# 06 — Consolidated Findings

**Target:** Claude Desktop 2.31226.1.0 (MSIX x64, Electron 44.4.3 / Chromium)
**Date:** 2026-10-13
**Method:** Static only. Nothing launched, executed, or debugged. No user data read.
**Scope:** security posture — IPC surface, sandbox/elevation boundary, auto-update,
code signing, native binary inventory.

---

## 6.1 Executive summary

Claude Desktop's Electron shell is **materially more defended than the Typeless baseline
this study inherited**. The Typeless precedent — raw `ipcRenderer` passthroughs with zero
sender validation, and a GPU-crash handler that failed open to `--no-sandbox` — **does not
reproduce here**. Every one of the ~2,090 privileged IPC handlers runs an origin allowlist
plus a top-frame check before dispatch, and no fail-open path to an unsandboxed renderer
was found.

The genuinely privileged trust boundary in this product is **not** the Electron IPC layer.
It is a **signature-verified named pipe to a Windows service running as SYSTEM**, which
hosts a Hyper-V VM for agentic execution. That boundary is narrow and authenticated.

The most consequential observation is architectural rather than a vulnerability: the app
ships and drives a **disposable VM with a full SSH server and host-drive enumeration**,
reachable by a Go service running at SYSTEM privilege. The control that matters is the
pipe's signature verification, and that control could not be dynamically tested under the
static-only constraint.

---

## 6.2 Ranked findings

### F1 — Every privileged IPC handler is origin-allowlisted and top-frame-checked *(mostly positive, with two caveats)*

**Severity:** informational / defence confirmed, with F1a and F11 as carve-outs
**Evidence:** reports 02, 03

1,294 handler channels are derived from 94 `ao()` codegen call sites. The dominant guard
family checks `senderFrame.parent === null` **and** origin against
`{claude.ai, preview.claude.ai, claude.com, preview.claude.com, app://localhost}`.
Non-codegen handlers use a parallel wrapper `Aka` → `Rya(senderFrame)` → `$A(host)`.
Arguments and return values are additionally validated by declared schemas.

**Every one of the 1,294 handlers is matched by a preload reference — there are no orphaned
privileged handlers in either direction.**

Caveats:
- **4 of 16 guards check no origin at all** (`Ixe`, `PMr`, `vTi`, `nba` are literally
  `return e.senderFrame?.parent === null`), covering 57 channels (4.4%) across 8
  auxiliary-window interfaces. The top-frame rule still blocks cross-origin embedding.
- `cowork-artifact:` is an additional accepted origin beyond the five listed.

This is the correct architecture, and it directly refutes the inherited Typeless
expectation of raw passthroughs.

### F1a — The `electron_window` guard fails OPEN when a build-time define is absent *(the one material weakness)*

**Severity:** **medium**
**Evidence:** report 02 §2.4a(ii)

```js
function Yjr(e){
  if (typeof __ELECTRON_WINDOW_ALLOWED_ORIGINS__ > "u") return !0;   // FAIL OPEN
  …
  return __ELECTRON_WINDOW_ALLOWED_ORIGINS__.includes(n)
}
```

`__ELECTRON_WINDOW_ALLOWED_ORIGINS__` occurs **4 times** in the entire extracted tree —
twice in `Yjr` (main) and twice in the preload twin `Xn`, which gates whether
`electron_window` is exposed at all. It is **never assigned** anywhere in the JS corpus,
and a streaming scan of `claude.exe` (246,402,896 bytes) finds **0 occurrences**.

The scan was calibrated against control needles (`__dirname` → 34 hits, `__filename` → 32,
`ELECTRON_RUN_AS_NODE` → 11) to establish that the method detects identifiers of this class,
so the absence is evidence rather than a scan artifact.

**Consequence:** on this build `Yjr` returns `true` for every sender and `Xn` exposes
`electron_window` unconditionally, making the six `WindowManager` channels reachable from
any frame loading that preload.

**Mitigating, and why this is "medium" not "high":** those six channels are window-management
operations, not filesystem or credential operations; argument and result validation still
applies; and each also passes through `Aka`/`Rya`/`$A`, which resolves against the currently
configured host — a separate check from `Yjr`. That residual check was **not traced
end-to-end**, so exploitability is not claimed.

**This is the finding to raise with Anthropic.** The defect is the *pattern* — a guard whose
failure mode is "allow", with its defining input never supplied.

### F2 — No fail-open path to an unsandboxed renderer *(positive)*

**Severity:** informational
**Evidence:** report 03

| Probe | Result |
|---|---|
| `no-sandbox` (case-insensitive) | **0** |
| `sandbox:!1` / `sandbox:false` | **0** |
| `webSecurity:false` | **0** |
| `nodeIntegration:true` | **0** |
| `contextIsolation:false` | **0** |

All 16 `sandbox:` literals are `sandbox:true`. All 17 `contextIsolation` literals are
`true`; all 17 `nodeIntegration` literals are `false`.

### F3 — The remote-content window is the most hardened surface *(positive)*

**Severity:** informational
**Evidence:** report 03 §3.2

The silent-authorize window renders a **remote IdP origin** in a privileged shell, and is
built to a notably high standard: `sandbox:true`, `contextIsolation:true`,
`nodeIntegration:false`, `devTools:false`, a dedicated `session.fromPartition()`,
`setPermissionRequestHandler(→ deny)`, `setPermissionCheckHandler(→ deny)`,
`will-download → preventDefault`, and origin-scoped to a single `redirect_uri` prefix.

Capture/glow overlays additionally set `setContentProtection(true)`, and the native preview
view sets `setWebRTCIPHandlingPolicy("disable_non_proxied_udp")`.

### F4 — Electron fuses close the three classic local-escalation vectors *(positive)*

**Severity:** informational
**Evidence:** report 05 §5.2

`RunAsNode`, `EnableNodeOptionsEnvironmentVariable` and `EnableNodeCliInspectArguments`
are all **DISABLED**; `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar`
are both **ENABLED**. Combined with the MSIX + Authenticode chain (all six examined
binaries `Valid`, countersigned by DigiCert), patch-and-replace of the payload is
foreclosed at two independent layers.

### F5 — SYSTEM-privilege service with host-drive enumeration, reached over a named pipe

**Severity:** **medium (architecture), contingent on F6 holding**
**Evidence:** report 04

`cowork-svc.exe` (`github.com/anthropics/cowork-win32-service`, Go 1.25.14) is a Windows
service exposing 13 RPC handlers over `\\.\pipe\cowork-vm-service`, including:

- `handleGetNetworkDrives` — enumerates **host** drives from the SYSTEM context
- `handleStartVM` / `handleStopVM` — controls a Hyper-V guest
- `handleWriteStdin` — writes into the guest
- `handleConfigure` — includes `ValidateWritePathAsUser` and `CreateDynamicVHDXAsUser`

The binary embeds a full **SSH server** (banner, KEX, userauth, TLS 1.3 secrets) and a
**gVisor user-space network stack**. It also ships a 37.7 MB guest disk
(`smol-bin.x64.vhdx`).

This is the real privilege boundary. Its security rests entirely on the pipe
authentication, which is where attention should go.

### F6 — Pipe authentication is signature-based, and could not be dynamically verified

**Severity:** **medium — unverified control**
**Evidence:** report 04 §4.2

The Go symbol table shows `pipe/signature.go`, `pipe.(*Server).InitSignatureVerification`,
and a dispatch chain `dispatch → dispatchVerified → dispatchWithSession → handle*`.
`pipe.(*ClientInfo).InServicePackage` and `UserDataDirFor` suggest a second check that the
client lives inside the service package directory.

A targeted string sweep strengthens this materially: the binary contains
**`HMAC-SHA2-256`**, **`enforceSignature`**, **`SignatureKey`**, **`CheckSignature`**, and a
runtime log line **`Could not verify service signature: %v`** — so verification failures
are surfaced rather than silently ignored. It also contains `pipe.validateBundlePathAsUser`
wrapping `handleConfigure`, meaning write paths into the VM are validated against the
requesting user, and `Ignoring network drive with bad letter (len=%d)`, showing
drive-letter validation on the drive-enumeration path.

**The ordering — verify-before-dispatch — is the security property, and it is the right
design.** But under the static-only constraint I could read symbol names and string
constants, not logic. I cannot confirm:

- whether the HMAC key is derived from something a non-elevated local process could
  reproduce (`HMAC-SHA2-256` proves the algorithm, not the key);
- whether a non-elevated local process could open the pipe and satisfy the check;
- whether `handleGetNetworkDrives` has any restriction beyond the dispatch gate and
  drive-letter validation.

**This is the single highest-value item for a follow-up engagement that is permitted to
observe the service (not to run it).** It should not be read as a finding of weakness —
only as a control whose key derivation remains unproven.

### F7 — Elevation fails closed

**Severity:** low / positive
**Evidence:** report 04 §4.3

The app never spawns `cowork-svc.exe` with `runas` — there is **no `cowork-svc` literal
anywhere in the JS corpus**. It calls `StartService` via the SCM. When the service is not
installed, is denied, or fails to bring up its pipe, the app reports `denied`/`failed` and
**imposes exponential backoff** rather than escalating or falling back to an elevated
spawn. The service's own strings state that `install`/`uninstall` require Administrator —
so privilege is required to *establish* the boundary, not to *use* it.

### F8 — `GrantFileProtocolExtraPrivileges` is enabled

**Severity:** low
**Evidence:** report 05 §5.2

Fuse #7 is `ENABLED`, granting `file://` extra privileges. The app loads local artifact
HTML over `file://` (artifact windows, `loadFile`), so this is expected for the feature
set — but it means local file content is treated as more trusted than a web origin. Of the
nine fuses, this is the only one where a reviewer should form an independent view.

### F9 — SSH trust is split across two implementations

**Severity:** low / nuance
**Evidence:** report 04 §4.4

There are **two** SSH trust paths, not one:

| Path | Transport | Host-key policy |
|---|---|---|
| Native broker | `claude-ssh-broker.exe` → **system OpenSSH**, ≥9.4 version floor enforced | system OpenSSH's |
| In-tree JS | `ssh2` in `index.chunk-CATyehLt.js` | **own `known_hosts` / `@revoked` / `@cert-authority` parser** |

The native path delegates to the OS client — one fewer bespoke credential store. But the
in-tree path implements its own known-hosts handling (11 × `known_hosts`, 30 × `hostKey`,
14 × `revoked`, plus `verifyHostKey` / `hashKnownHosts`), so host-key trust there is a
**second implementation** that does not inherit the system OpenSSH audit trail.
`claude-ssh-askpass.exe` provides the GUI credential prompt as a separate process, keeping
it out of direct reach from a compromised renderer.

### F10 — Two `appendSwitch` loops take dynamic flag names

**Severity:** low — bounded, not resolved
**Evidence:** report 03 §3.3

Of 11 `commandLine` calls, 8 use literals (`enable-features`, `disable-gpu`,
`blink-settings`, …) and 2 loop over `t.name` / `(t.name, t.value)`. Neither is driven by
renderer input in the observed code, and the fuses remove the `NODE_OPTIONS`/`--inspect`
injection routes. **Not proven safe** — the value domain of `t.name` was not expanded.
Stated as open rather than absent.

---

## 6.3 Open items carried forward

| # | Item | Why unresolved |
|---|---|---|
| O1 | Pipe HMAC **key derivation** strength | Algorithm confirmed (`HMAC-SHA2-256`); key source not readable statically |
| O2 | Whether a non-elevated local process can open the pipe | Requires observing the service |
| O3 | Guest VM default network adapter (NAT vs isolated) | `virtualnet.go`/`hcn.go` exist; defaults not traced |
| O4 | `autoUpdater` feed URL + `verifyUpdateCodeSignature` | Squirrel path exists; config not read |
| O5 | CSP policy **contents** | 19 occurrences counted; policies not parsed |
| O6 | Dynamic `appendSwitch(t.name)` value domain | Loops not expanded (verifier found a 13-entry GPU-only allowlist `A8`, which strengthens the conclusion) |
| O7 | ~~Electron fuse #8 name~~ | **RESOLVED** — `WasmTrapHandlers`, ENABLED; confirmed against upstream `electron/fuses` |
| O8 | Whether `Rya`/`$A` independently constrains the F1a fail-open | Would decide F1a severity; not traced end-to-end |
| O9 | `claude.internal.sableOtter` — 10 preload channels with no handler found in the main chunk | Flagged by the adversarial pass; likely a split-chunk registration, not confirmed |

---

### F11 — Local-exec consent is skipped entirely in third-party deployment mode

**Severity:** **medium — policy question, likely deliberate**
**Evidence:** report 07 (carried from the prior pass, re-verified)

The app's primary "something wants to act on my machine" control — the local-exec consent
dialog — is present and carefully built for `1p` deployments, and **absent for `3p`**:

```js
async function j(e,t,r,i={showConsentWindow:R}){          // connect / disconnect
  if (e.type==="3p")
    return { verdict:{ decision:"allowed", resolvedName:r }, pool:e.activeConnectorPool() };
  …
}
function P(e,t,n={showConsentWindow:R}){                   // chat-grant
  if (e.type==="3p") return !0;
  …
}
```

`decision:"allowed"` is returned unconditionally; no dialog is constructed. `3p` is
verified to mean the enterprise "bring your own inference provider" mode (Bedrock / Vertex /
customer gateway), evidenced by managed-config keys scoped `["3p"]` such as
`inferenceBedrockAwsCliPath`, `inferenceBedrockRegion`, `inferenceGatewayOidc`.

Related: in 3p mode, scheduled-task approval times are *recorded rather than requested*
(`recordsApprovalTime: () => W().type==="3p"`).

**This is very likely intentional** — in 3p mode connectors come from
`adminConnectorSource()`, and the codebase does distinguish "admin says no" elsewhere
(`"disabled-by-admin"`). The concern is the **asymmetry**: the consent control is fully
built for 1p and entirely absent for 3p, so in that mode no local-exec consent prompt
exists at all. Whether that is acceptable is a policy decision for a security owner, not
something settleable from the binary.

**What would settle it:** whether a 3p deployment can introduce a connector the
administrator never configured — one registered by a plugin, a DXT extension
(`@ant/dxt-registry` is a declared dependency), or a skill-supplied MCP server. If the 3p
connector pool is strictly admin-authored, the bypass is sound. If any installed component
can extend it, the control is absent.

### F12 — Two SSH helpers are full-trust MSIX entry points

**Severity:** low
**Evidence:** report 04 §4.1

`AppxManifest.xml` declares three `Windows.FullTrustApplication` entries: `Claude`,
`SshAskpass` (`claude-ssh-askpass.exe`) and `SshProxy` (`claude-ssh-proxy.exe`). All three
run **outside any AppContainer sandbox**, so the askpass binary — the SSH credential prompt —
can be launched by any local process that resolves MSIX activation. Launching it out-of-band
is not reading credentials, but it is a UI-spoofing surface sitting on the same trust
boundary as the SSH broker. `cowork-svc.exe` is *not* an MSIX entry point and is reachable
only through the SCM.

---

## 6.3b Prompt-injection defences and the execution sandbox (report 09)

Report 09 examines agent execution — the boundary reports 01–08 did not cover. Report 03's
`sandbox: true` is the **Electron renderer** sandbox; `sandbox.*` here is a different, agent-facing
configuration.

### F13 — `sandbox.failIfUnavailable` defaults to false: the sandbox fails open

**Severity:** medium · **Evidence:** report 09 §3.1

If `sandbox.enabled` is true but the sandbox cannot start, commands **run unsandboxed** behind a
warning rather than failing. Anthropic documents this as intentional — *"Intended for
managed-settings deployments that require sandboxing as a hard gate"* — and an admin-only hard gate
exists. On a default install the sandbox is best-effort and the user-visible signal is a warning.

### F14 — Only MCP *prompt* responses are template-validated against injection

**Severity:** medium · **Evidence:** report 09 §2

The single code-enforced injection control (`GQr`, main process, fail-closed to a JSON-RPC error)
covers the `prompts/*` surface only. Tool **results**, tool **descriptions**, and ordinary
file/web content have no equivalent. Those are precisely the surfaces the rest of Anthropic's own
prompt text is defending against in prose.

### F15 — `filesystem.denyRead` and `credentials.files.deny` are not independent

**Severity:** low · **Evidence:** report 09 §3.2

Both are enforced by the same filesystem layer, so `enableWeakerNetworkIsolation` disables both at
once. Only `mask` entries survive. Treating `denyRead` and credential `deny` as two independent
controls over-counts the protection.

### F16 — The approval gate is suppressed by default for sandboxed commands

**Severity:** low · **Evidence:** report 09 §1

`sandbox.autoAllowBashIfSandboxed` defaults to `true`; `sandbox.allowUnsandboxedCommands` defaults
to `true`. Both are correct-by-design and both reversible, and both are correctable by managed
settings. The finding is the *composition* with F13: a suppressed prompt plus a sandbox that can be
absent is the one configuration where no layer remains.

### F17 — The injection defence is authority-provenance, not content filtering

**Severity:** informational · **Evidence:** report 09 §2

`Prompt Injection` is a **named hazard class** in the clearing rules, tested by *where the request
originated*, not what it says. No keyword blocklist exists: `jailbreak` **0**, `indirect injection`
**0**, `untrusted_content` **0**, `<untrusted>` **0**, `[INST]` **0**. Accurate framing matters here —
there is no "jailbreak filter" to praise or attack.

### F18 — Positive: six independent fail-closed downgrades

**Severity:** none · **Evidence:** report 09 §4

uid-0/root (Windows via `remoteUid === 0`, POSIX via `getuid() === 0`), CLI version skew,
launcher-vs-in-app disagreement, config-load sessions (`behavior:"deny"`), side-chat narrowing
(*"Read, Grep and Glob only"*), and `declareParentTools` forcing `autoAllowBashIfSandboxed: false`.
Every ambiguous state resolves to **less** privilege.

### F19 — Positive: MCP is deny-by-default

**Severity:** none · **Evidence:** report 09 §5

`disallowedTools: ["mcp__*"]` with `strictMcpConfig` when the CLI runs on-host.

### F20 — Positive: credential masking targets exfiltration payload

**Severity:** none · **Evidence:** report 09 §3.3

`sandbox.credentials.files` mask entries, per-service `sigv4` deny, AWS `secretAccessKeyVar`
indirection. The only control in the artifact aimed at what a successful injection could *take*.

### F21 — Positive: managed settings lock all eight sandbox escape hatches

**Severity:** none · **Evidence:** report 09 §6

A `restrictive`-only policy list lets an admin force sandbox-plus-prompt with no lower tier able to
loosen any of them.

### Corrections C-J and C-K (report 09 §7)

| ID | Prior claim | Corrected |
|---|---|---|
| **C-J** | Report 03 §3.5 diagram: escalation is `spawn → named pipe → cowork-svc.exe (Go, SYSTEM service) → Hyper-V VM` | **The JS corpus contains 0 references to `cowork-svc`/`coworkSvc`/`svc.exe`** across all 408 files. The lone `Hyper-V` hit is a WSL diagnostic-log regex `/\[(?:vm\|hcs\|hvsock\|…\|vhdx\|console\|hyperv\|…)\]/i`, not a VM launch. This does **not** clear `cowork-svc.exe` — it may be spawned natively by `claude.exe`. The claim is **unverified from JS** |
| **C-K** | 23 `.vhdx` hits imply a Claude Hyper-V sandbox VM | **22 of 23 are a WSL distribution rootfs download manifest** (`rootfs.vhdx`, `vmlinuz`, `initrd`, SHA-256, per-arch). `grep .vhdx` conflated a VM image Claude *ships* with one it *downloads for WSL* |

---

## 6.4 Adversarial second pass — outcome

An independent verifier was given the artifact, the ten headline claims, and an explicit
instruction to falsify them. **Verdict returned: PARTIAL.**

| Class | Claims |
|---|---|
| Confirmed | C1 (codegen grammar), C5 (sandbox/webSecurity), C7 (Go 1.25.14, pipe name, dispatch chain), C8 (no `runas`, SCM `StartService`) |
| Refuted | **C9** (single SSH stack — there are two), **C10** (fuse enumeration omitted #8) |
| Inflated | **C2** (2,092 → 1,294; the "798 orphans" figure was an artifact), **C3** ("all origin-validated" — 4 guards check only top frame) |
| New finding | **`Yjr` fail-open** (now F1a) |

Every refuted claim was **re-verified by me before being accepted** (G8), not taken on
faith. In particular the `Yjr` fail-open was independently reproduced and the negative
calibrated against control needles before being promoted to a finding. All eight
corrections are preserved visibly in the individual reports and in `verification-brief.md`.

---

## 6.5 Comparison against the Typeless baseline

| Property | Typeless 2.8.1 | **Claude Desktop 2.31226.1.0** |
|---|---|---|
| Preload IPC | raw passthrough, zero sender checks | **1,384 channels; 1,237 origin-allowlisted, 57 top-frame-only, and 6 behind a guard that fails open** |
| Arg/result validation | absent | **present** (`Nxe`/`Oxe`/`Axe` + per-method schemas) |
| `nodeIntegration` | — | **`false` ×17** |
| `contextIsolation` | — | **`true` ×17** |
| `sandbox` | failed open to `--no-sandbox` on GPU crash | **`true` ×16, zero `sandbox:false`** |
| `webSecurity` | — | never assigned → Chromium default `true` |
| Electron fuses | — | **RunAsNode / NODE_OPTIONS / `--inspect` all DISABLED**; asar integrity ON |
| Code signing | — | **6/6 Valid**, Anthropic PBC, DigiCert chain, countersigned |
| Update channel | — | MSIX (OS-enforced signing) primary + Squirrel fallback |
| Elevation model | — | **SCM `StartService`, fails closed, no `runas` spawn** |
| Consent gate | — | **carefully built for 1p; absent entirely in 3p enterprise mode** (F11) |
| Highest-privilege component | renderer | **SYSTEM service over signature-verified pipe** |

**The security centre of gravity has moved.** In Typeless the renderer was the weak link.
In Claude Desktop the renderer is well fenced — with one genuine exception (F1a) — and the
meaningful questions become F1a, F5/F6 and F11: a fail-open guard, a SYSTEM service reached
over a pipe, and a consent control that is absent in one deployment mode.

---

## 6.6 Scope statement

**Done:** artifact manifest with hashes; IPC channel inventory with set-difference both
ways and per-handler sender validation; per-window `webPreferences` census and fail-open
analysis; native binary inventory with toolchain fingerprinting, section tables and the
RVA↔offset rule; pipe name, RPC surface and elevation model; fuse decode; Authenticode
chain.

**Not done, and not claimed:** dynamic validation of the pipe signature scheme; guest VM
network defaults; CSP policy contents; Squirrel updater verification config; execution of
any kind; the user's own `~/.claude` data.

**Stated rather than silently dropped:** Chromium's 329 MB of libraries and the 50+ locale
files were excluded as upstream/data; `~/.claude/` was excluded as user data.
