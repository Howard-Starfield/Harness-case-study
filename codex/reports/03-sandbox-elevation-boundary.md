# Codex 26.1007 — Report 03: Elevation & Sandbox Boundary Map

**Queue requirement #9:** every binary that can raise privilege, every path that reaches it, and the validation on each.

---

## 3.1 Boundary map at a glance

```
┌─ RENDERER (webview/**, 14,782 JS files) ─ sandboxed, contextIsolated, no Node ─┐
│   no elevation_service ref · no sandbox-setup ref · no command-runner ref       │
└───────────────────────────┬─────────────────────────────────────────────────────┘
                            │ contextBridge.exposeInMainWorld × 3  → electronBridge
                            │ 17 named IPC channels, sender-validated (report 02)
┌───────────────────────────┴─────────────────────────────────────────────────────┐
│ ELECTRON MAIN (.vite/build, 34 JS files)                                      │
│                                                                               │
│  PATH A — auto-update elevation      main → native/windows-updater.node       │
│           gate: isTrustedIpcEvent · allowServiceInstallElevation:!0           │
│                                                                               │
│  PATH B — Windows sandbox setup      main → codex app-server (JSON-RPC)       │
│           gate: typed request `windowsSandbox/setupStart` · mode ∈ {elevated, │
│           unelevated} · 20-min timeout REJECTS · 5-min retry cooldown         │
│                       └→ codex.exe (Rust, 334 MB)                            │
│                            └→ codex-windows-sandbox-setup.exe  (Rust, 17.7 MB) │
│                            └→ codex-windows-sandbox-service.exe(Rust, 55.8 MB) │
│                            └→ codex-command-runner.exe          (Rust, 8.2 MB) │
└───────────────────────────────────────────────────────────────────────────────┘
                                    ╎
┌───────────────────────────────────╂───────────────────────────────────────────┐
│ CHROMIUM BROWSER PROCESS (chrome.dll, 329 MB) — OUT OF SCOPE, upstream         │
│  └→ elevation_service.exe          upstream Chromium C++, caller-validated     │
│  └→ elevated_tracing_service.exe   upstream Chromium C++                      │
└───────────────────────────────────────────────────────────────────────────────┘
```

## 3.2 Every privilege-raising binary

| # | Binary | Bytes | Lang | Can raise privilege? | Reached from JS? |
|---|---|---:|---|---|---|
| 1 | `elevation_service.exe` | 3,905,840 | C++ (Chromium) | Yes — the elevation service itself | **No** (0 refs) |
| 2 | `elevated_tracing_service.exe` | 4,549,936 | C++ (Chromium) | Yes — Windows-tracing service | No (0 refs) |
| 3 | `codex-windows-sandbox-setup.exe` | 17,725,744 | Rust | Yes — ACLs, firewall, user provisioning | Indirectly, Path B |
| 4 | `codex-windows-sandbox-service.exe` | 55,824,688 | Rust | Yes — hosts the sandbox | Indirectly, Path B |
| 5 | `codex.exe` | 334,121,776 | Rust | Orchestrates 3 & 4 and exec policy | Indirectly, Path B |
| 6 | `codex-command-runner.exe` | 8,204,592 | Rust | Executes sandboxed commands | Indirectly, Path B |
| 7 | `cua_node/.../codex-computer-use.exe` | 1,551,152 | — | Computer-use control | No (0 refs) |
| 8 | `cua_node/.../codex-computer-use-swift.exe` | 56,534,320 | Swift | Computer-use control | No (0 refs) |

**Not privilege-raising but adjacent:** `codex-code-mode-host.exe` (74.7 MB), `rg.exe`, `tectonic.exe`
(55.1 MB), `winpty-agent.exe` (1.39 MB) — agent/tool payload, not escalators.

## 3.3 `elevation_service.exe` — provenance and caller validation

**Provenance: upstream Chromium C++, not OpenAI code.** Source paths embedded in the binary:

```
..\..\chrome\elevation\caller_validation.cc
..\..\chrome\elevation\elevator.cc
..\..\chrome\elevation\elevated_recovery_impl.cc
..\..\chrome\elevation\elevation_service_delegate.cc
```

plus perfetto tracing paths. **Zero** OpenAI/Codex source paths; no Rust markers; a `.pdb` is
present. This is the stock Chromium elevation service, code-signed by OpenAI because MSIX signs
everything it ships.

Behavioural strings present: `Failed to authenticate caller process:`, `CheckTokenMembership`,
`DuplicateTokenEx`, `GetTokenInformation`, `OpenProcessToken`, `ShellExecuteExW`,
`CreateProcessAsUserW`, `LaunchElevatedProcess`, `runas`, `do-not-de-elevate`.

**Testing escape hatches present in the shipped binary:**

```
elevator-allow-untrusted-path-for-testing
elevator-allow-untrusted-recovery-hash-for-testing
elevator-allow-untrusted-switches-for-testing
```

These are Chromium's own test-only relaxations. In stock Chromium they are gated to non-official
builds; they exist here, so the **shipped binary contains the strings**. I could not read the gate's
compiled condition statically, so I make **no claim** that they are inert in this build — that would
require disassembly. Flagged as an open item, not as a vulnerability.

**Can an unprivileged renderer reach it? No.** See report 02 §2.5/§2.7: zero references across
14,816 JS files in both corpora, with positive control needles in the same sweep. The service is
launched by the Chromium browser process.

**Static-only limitation:** like Claude's pipe analysis, the caller-validation *logic* is readable
only as symbol and string evidence, not as verified code. `caller_validation.cc` existing in the PDB
path table is strong evidence a real check exists; it is not proof of what that check admits. This
is the single biggest residual gap in the target and is carried into `verification-brief.md`.

## 3.4 Path A — auto-update elevation

**Path:** renderer → `electronBridge` → IPC channel → `isTrustedIpcEvent` → `native/windows-updater.node` → `stagePackage` / `activateStagedPackage`.

The updater is constructed with `allowServiceInstallElevation:!0` at three sites in
`bootstrap-487kJHw_.js` (@51513, @51788 for the updater instances; the flag is consumed at @21465
and @24399). Detail and the finding it produces are in report 05.

Validation on the path: the JS-side entry point `codex_desktop:check-for-updates` is gated by
`isTrustedIpcEvent`, and the install path re-checks `this.options.allowed()` before proceeding. The
native addon's internal validation is not readable statically.

## 3.5 Path B — Windows sandbox setup

**This is the answer to "does sandbox setup fail open like Typeless's GPU-crash handler?" — no, it fails closed.**

The orchestration lives in `src-BJv5Mk7n.js`, in the `Kp` class (`startWindowsSandboxSetup`).

**Mode is explicit, not inferred.** Exactly two modes, enumerated as literals:

```js
for (let e of [`elevated`, `unelevated`]) { … this.timedOutWindowsSandboxSetup[e] … }
```

**Constants (read at `src-BJv5Mk7n.js` @125036):**

```js
var ao=3e4,                            // 30 s
    so=12e4,                           // 120 s
    co=`Timed out waiting for Windows sandbox setup completion`,
    lo=12e5,                           // 1,200,000 ms = 20 min  ← setup timeout
    uo=3e5,                            //   300,000 ms =  5 min  ← retry cooldown
```

**Full state machine:**

```js
async startWindowsSandboxSetup(e,t){                        // e = mode, t = cwd
  if(this.clearExpiredWindowsSandboxTimeouts(),
     this.activeWindowsSandboxSetup && !this.activeWindowsSandboxSetup.finished)
      throw Error(`Windows sandbox setup already in progress`);
  if(this.timedOutWindowsSandboxSetup?.[e] != null)
      throw Error(`Cannot retry the same Windows sandbox setup mode immediately after a timeout`);

  let n=U(), r={mode:e, finished:!1, cancelTimeout:null,
                complete:e=>{i()&&n.resolve(e)},
                fail:    e=>{i()&&n.reject(e)}},
      i=()=> !r.finished && (r.finished=!0, r.cancelTimeout!=null&&(r.cancelTimeout(),r.cancelTimeout=null),
                            this.activeWindowsSandboxSetup===r&&(this.activeWindowsSandboxSetup=void 0), !0);
  this.activeWindowsSandboxSetup=r;

  let a; try { a = await this.requestClient.sendRequest(`windowsSandbox/setupStart`,{mode:e,cwd:t}) }
  catch(e){ …; r.finished=!0; throw e }

  return a.started
    ? (r.finished || (r.cancelTimeout = this.schedule(()=>{
          this.timedOutWindowsSandboxSetup={...this.timedOutWindowsSandboxSetup,[e]:Date.now()+uo};
          r.fail(Error(co));                    // ← REJECTS the promise
      }, lo)),                                  // ← 20 minutes
       {started:!0, completion:n.promise})
    : ( …; r.finished=!0; {started:!1})
}
```

**Why this is fail-closed:**

1. **Timeout rejects.** `r.fail(Error(co))` calls `n.reject(...)`. There is no branch that resolves
   with a "proceed unsandboxed" value. A hung or dead setup cannot silently become success.
2. **Cooldown blocks naive retry.** For 5 minutes after a timeout, the *same mode* is refused with a
   hard error. A crash-loop cannot immediately re-prompt for elevation.
3. **Concurrent setup refused.** A second concurrent attempt throws.
4. **Completion is mode-matched.** The inbound handler rejects mismatched modes:
   ```js
   case`windowsSandbox/setupCompleted`:{
     let{mode:t, success:n, error:r} = e.params, i = this.activeWindowsSandboxSetup;
     if(!i){ this.clearTimedOutWindowsSandboxSetupMode(t);
              this.logger.warning(`Received windowsSandbox/setupCompleted without active setup`,…); return }
     if(i.mode!==t){ this.clearTimedOutWindowsSandboxSetupMode(t);
                     this.logger.warning(`Received windowsSandbox/setupCompleted for wrong mode`,
                                         {safe:{expectedMode:i.mode,mode:t,success:n},…}); return }
     i.complete({mode:t,success:n,error:r}); return }
   ```
   An unsolicited or wrong-mode completion is **logged and dropped**, not applied.
5. **`success` and `error` travel together** in the completion payload, so a caller cannot receive a
   bare "done" that hides a failure.

**Contrast with Typeless:** Typeless's GPU-crash handler failed *open* to `--no-sandbox`. Codex's
equivalent failure mode (setup timeout) fails *closed* by rejecting. No flag-flipping fallback
exists on this path.

**What `codex-windows-sandbox-setup.exe` actually configures** (from its string tables,
`evidence/sandbox-setup-strings.txt`):

- ACLs: `Local\CodexSandboxReadAcl`, `PersistentDenyReadAclState`,
  `ConvertStringSecurityDescriptorToSecurityDescriptorW`, `SetNamedSecurityInfoW`
- Windows Firewall via COM: `INetFwPolicy2`, `INetFwRule3`, rule configured / rule removed
- Sandbox **user provisioning**: "for sandbox users", "provision sandbox users failed"
- Winlogon `UserList` hiding, to keep sandbox accounts off the interactive login screen
- Module path `windows-sandbox-rs\src\setup_provisioning.rs`

So it configures **filesystem ACLs + network egress + dedicated low-privilege accounts**. The
firewall rule is the interesting one for posture: it implies sandboxed commands are
network-restricted by default.

## 3.6 Path B — the protocol that carries it

`windowsSandbox/setupStart` is **not** Electron IPC and **not** a raw socket. It is a typed request on
a 57-method JSON-RPC protocol to the native Codex app-server. Full method inventory in
`evidence/round3.txt`.

Security-relevant requests (from the 57): `fs/readFile`, `fs/writeFile`, `fs/copy`, `fs/remove`,
`fs/readDirectory`, `fs/getMetadata`, `fs/watch`, `fs/unwatch`, `fs/createDirectory`, `config/read`,
`config/batchWrite`, `initialize`, `ping`, plus 25 `thread/*` and 6 `turn/*` methods.

**The renderer has no direct filesystem access.** Every file operation is mediated by `codex.exe`,
which means path policy and sandbox enforcement are enforced in one auditable native place rather
than being re-implemented in JS. That is a materially better design than exposing `fs` to a preload.

Security-relevant inbound notifications:

```
item/commandExecution/requestApproval        ← the approval gate
item/fileChange/requestApproval              ← the approval gate
item/permissions/requestApproval             ← the approval gate
item/autoApprovalReview/started | /completed
autoApprovalReview/strictReviewRequired
item/commandExecution/outputDelta | /terminalInteraction
item/fileChange/patchUpdated
attestation/generate
```

The approval gate is therefore implemented **in the Rust app-server** and surfaced to the UI as
notifications. That is a stronger placement than a renderer-side dialog, because the gate cannot be
skipped by a renderer that simply declines to draw the prompt.

## 3.7 Approval and permission policy in the JS layer

Occurrence counts in MAIN: `approvalPolicy` **123** · `requestApproval` **37** · `untrusted` **46** ·
`workspace-write` **40** · `read-only` **41** · `danger-full-access` **10** · `autoApprov` **12** ·
`sandboxMode` **11** · `exec-policy` **5** · `askForApproval` **0**.

The three-way sandbox triple is explicit:

```js
sandbox: I.sandboxPolicy.type===`dangerFullAccess` ? `danger-full-access`
      : I.sandboxPolicy.type===`readOnly`        ? `read-only`
      :                                           `workspace-write`
```

**Automations narrow permissions and fail closed.** For automation threads the effective permission
set is intersected against managed constraints:

```js
function sl(e,t){
  let n=[e.approvalsReviewer, ...t?.allowedApprovalsReviewers??[]],
      i=[e.approvalPolicy,      ...t?.allowedApprovalPolicies??[]],
      a=[e.sandboxPolicy,        r.ja().sandboxPolicy];
  for(let o of a) if(o.type!==`dangerFullAccess` && t?.allowedPermissionProfiles==null){
    for(let a of n) for(let n of i)
      if((n!==`never` || e.approvalPolicy===`never`) && r.za(t,r.Fa(o),n,a))
        return {...e, activePermissionProfile:null, sandboxPolicy:o, approvalPolicy:n, approvalsReviewer:a}
  }
  throw Error(`No compatible automation permissions satisfy the managed requirements`)
}
```

Two properties worth naming:

- If **no** combination satisfies the managed requirements, it **throws**. It does not fall back to a
  weaker profile.
- `dangerFullAccess` is skipped by the narrowing loop, and an explicit
  `activePermissionProfile.id === ':danger-full-access'` is preserved rather than overwritten
  (see `aT` in `src-BJv5Mk7n.js` @672391). Full-access remains an explicit, deliberate selection —
  but note it is a selection **in a permission profile**, and an automation with
  `allowedPermissionProfiles` set is handled separately.

**Residual risk, stated honestly:** the actual enforcement of `danger-full-access` vs
`workspace-write` happens in the Rust app-server and in `exec-policy`. Neither the approval
predicate nor the enforcement point is readable from the JS corpus; `exec-policy` appears only 5
times in MAIN and does not appear in RENDER at all. **The gate's server-side logic is unverified.**

## 3.8 `codex.exe` toolchain — confirmed

Fingerprinted by markers, not assumed:

| Binary | `.rs` source paths | Toolchain |
|---|---:|---|
| `codex.exe` | **1,408** | `/rustc/59807616e1fa2540724bfbac14d7976d7e4a3860`, `1.95.0-x86_64-pc-windows-msvc` |
| `codex-windows-sandbox-service.exe` | 141 | same |
| `codex-windows-sandbox-setup.exe` | 66 | same |
| `codex-command-runner.exe` | 50 | same |

Crates present: `execpolicy`, `windows-sandbox-rs`, `exec-server`, `protocol`, `cloud-config`,
`utils/pty`. The presence of an `execpolicy` crate and an `exec-server` crate confirms the approval
and sandbox-enforcement points live here, consistent with the JS-layer findings above.

The Linux `codex` (294,451,848 B) is the same program cross-compiled for WSL: ELF 64-bit
little-endian, `ET_DYN`, x86-64, SYSV. See correction C-F in report 05.