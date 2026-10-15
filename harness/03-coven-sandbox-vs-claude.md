# Coven vs. Claude — Sandbox Posture at `v0.0.54`

**Subject:** `https://github.com/OpenCoven/coven` @ tag `v0.0.54`
**Audited commit:** `a47889459df540a489291b3b440444d61fa2d9da` (2026-07-12)
**Method:** static read-only source analysis. Nothing was built, installed, or executed.
**Baseline:** Claude Desktop 2.31226.1.0, as characterised by prior static analysis (treated as a claim, not truth).

---

## 1. Existence check

Both checks passed. The repository and the tag are real, public, and were audited directly.

| # | Check | Result |
|---|---|---|
| 1 | `git ls-remote https://github.com/OpenCoven/coven` | **Reachable.** HEAD = `d6afbffde4f815a538f65185c80da2d0ee951d2d` (= `refs/heads/main`) |
| 2 | `git ls-remote --tags … \| grep v0.0.54` | **Tag resolves.** Annotated tag object `60547a1d6fa59cbe1c2456fd93cda6bdb6a31ceb`, peeled commit `a47889459df540a489291b3b440444d61fa2d9da` |
| 3 | `web_fetch https://api.github.com/repos/OpenCoven/coven` | **HTTP 200.** `"private": false`, `"visibility": "public"`, `"full_name": "OpenCoven/coven"`, `"language": "Rust"`, `"size": 90825` KB, MIT |

Identity cross-checks: the clone's `git tag --points-at HEAD` returns exactly `v0.0.54`; `crates/coven-cli/Cargo.toml` declares `version = "0.0.0"` — the crate version is **not** bumped per release, so the git tag is the only release marker and Cargo.toml must not be used to verify a release.

No similarly-named project was substituted. `OpenCoven/coven` is a Rust workspace (`coven-cli`, `coven-memory`, `coven-relay`) for project-scoped coding-agent sessions; it is not OpenCode, OpenCoder, or CoVeN-as-some-other-thing.

---

## 2. Corpus, method, and what a number means

**Corpus at `a4788945`:**

- **671 files**, **43,794,271 bytes (41.77 MiB)**
- 190 **CODE** (text, non-documentation) — scanned
- 430 **DOC** — scanned
- 426 of those are `.md`; 51 binary assets skipped
- **0 VENDOR**

### What a number in this report means

Every count is classified into exactly one bucket, because each proves something different:

- **CODE** — first-party implementation in a source file. *Proves a mechanism exists.*
- **DOC** — markdown / rst / docs. *Proves only a claim exists.* A README sentence saying "sandboxed" is not a sandbox.
- **VENDOR** — vendored third-party trees (`node_modules/`, `vendor/`, `third_party/`, bundled upstream repos). *Proves nothing about this project's posture.*

Counts are **occurrences** (non-overlapping regex matches), not lines and not files; per-needle file lists are in `_audit/census-detail.json`. Byte figures are exact file sizes.

**Vendored-subtree check (explicit).** Searched for `node_modules`, `vendor`, `third_party`, `third-party`, `target`, `.cargo`, `bower_components`, `site-packages`, `dist`, `build`, `out`, `deps`. **None present.** No vendored third-party tree, no bundled upstream CLI. The VENDOR bucket is empty **by construction**, so every number below is either CODE or DOC and none is inflated by someone else's code.

### Calibration — every zero is calibrated

Three positive controls returned non-zero over the same corpus in the same pass; one negative control returned zero.

| Control | CODE | DOC | Verdict |
|---|---|---|---|
| rust `impl ` | 151 | 29 | non-zero ✔ |
| generic `config` | 634 | 440 | non-zero ✔ |
| path `/` | 15,867 | 15,421 | non-zero ✔ |
| negative `ZzQxJ9f3a` (impossible) | 0 | 0 | zero as required ✔ |

**CALIBRATION: PASS.**

> **The first census run FAILED this calibration, and that failure is the most important methodological fact in this audit.**
> The census script was written inside its own scan root. It matched *its own regex literals* and reported `CODE=4` seatbelt, `CODE=3` bwrap, `CODE=4` nsjail, `CODE=2` Landlock, `CODE=2` seccomp, `CODE=7` JobObject. **Every one of those was a false positive caused by the auditor's own file.** After excluding `_audit/`, seatbelt, bwrap, nsjail, Landlock and seccomp all dropped to **CODE=0**.
> A project can look maximally sandboxed because of where the auditor put the scanner. Always run a negative control.

---

## 3. Sandbox findings

### 3.1 OS-level confinement — **none. The "sandbox" is a pass-through.**

Every OS primitive in the census, classified:

| Primitive | Platform | CODE | DOC | Files |
|---|---|---|---|---|
| `CreateJobObjectW` / `AssignProcessToJobObject` | Windows | **4** | 0 | `crates/coven-cli/src/daemon.rs` |
| `JOB_OBJECT_LIMIT_*` | Windows | **0** | 0 | — |
| `CreateRestrictedToken` | Windows | 0 | 0 | — |
| AppContainer / `CreateAppContainerProfile` | Windows | 0 | 0 | — |
| `sandbox-exec` / `sandbox_init` / seatbelt / SBPL | macOS | **0** | 2 | — |
| `bwrap` / bubblewrap | Linux | **0** | 2 | — |
| Landlock / seccomp / `nsjail` / `firejail` / `unshare` / `CLONE_NEW*` | Linux | **0** | 0 | — |
| `docker run/exec` / podman / gvisor / runsc / firecracker / e2b | any | **0** | 26 | — |

**The one Windows primitive is not a sandbox.** All four occurrences are in the process-teardown path:

```rust
// crates/coven-cli/src/daemon.rs:415-437
fn piped_killer(pid: u32) -> Box<dyn RuntimeKiller> {
    #[cfg(windows)]
    let job_handle = {
        ...
            JobObjects::{AssignProcessToJobObject, CreateJobObjectW},
        ...
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            ...
                AssignProcessToJobObject(job, ph);
```

…used later only as `TerminateJobObject(h, 1)` (daemon.rs:537) with a `TerminateProcess` fallback. Its documented purpose (daemon.rs:484-491) is killing the child process tree on `/kill`, `/clear`, or chat exit. **No `JOB_OBJECT_LIMIT_*` is ever set**, so the job carries no resource, memory, or handle restrictions even as a lifecycle object.

**What `sandbox` actually means in this codebase** is a mapping to the downstream harness CLI's own flags:

```rust
// crates/coven-cli/src/harness.rs:240-244
/// How this harness enforces a sandbox/permission policy. `Some(_)` maps
/// `coven run --permission <full|read-only>` to `[flag, value]`; `None`
/// means the harness declares no sandbox mechanism, so `--permission` is a
/// warned no-op for it (mirrors `model_flag`).
pub sandbox: Option<SandboxMapping>,
```

```rust
// harness.rs:443-449   (Claude Code)
sandbox: Some(SandboxMapping::Flag {
    flag: "--permission-mode".to_string(),
    full: "bypassPermissions".to_string(),
    read_only: "plan".to_string(),
}),
// harness.rs:417-423   (Codex)
sandbox: Some(SandboxMapping::Flag {
    flag: "--sandbox".to_string(),
    full: "danger-full-access".to_string(),
    read_only: "read-only".to_string(),
}),
```

Coven confines nothing itself. It selects a flag string and shells out. **The confinement posture of a Coven session is entirely inherited from whichever CLI it launched.**

### 3.2 Fail-closed or fail-open? — **Split: fail-open on execution, fail-closed on the daemon control plane.**

There is no sandbox to fail, so the question resolves differently on each path.

**Execution path — fails open (by absence).** When a harness declares no mapping, the request degrades to a warning rather than an error:

```rust
// main.rs:1854-1858
// Resolve the requested sandbox/permission policy. It forwards to the
// harness's native flag (codex `--sandbox`, claude `--permission-mode`) so
// the composer's Access chip is enforced. Harnesses that declare no sandbox
// mechanism warn (don't error) so a selection degrades gracefully. Absent
// (`None`) leaves the harness at its default (equivalent to `full`).
```

`--permission` absent is documented as **"equivalent to `full`"** — i.e. `bypassPermissions` / `danger-full-access`. No `failIfUnavailable` analogue exists (CODE=0); there is no configuration that makes an unconfined execution refuse to start.

**Daemon control plane — genuinely fail-closed (live code).**

```rust
daemon.rs:724  // Fail closed when daemon state already exists but is owned by a different
daemon.rs:743  // Fail closed if the home already exists as a symlink: following it would
daemon.rs:1595 // Fail-closed: refuse to connect to a socket that is not owned by the
daemon.rs:1758 // Fail closed if the socket path would resolve outside the trusted state
```

These are real, enforced refusals (asserted by tests at daemon.rs:3344/3363/3383). They protect the daemon's socket and home directory from hijacking. They are **not** execution sandboxing.

**The Ward is the one genuinely fail-closed security gate — and it is dead code.**

```rust
// crates/coven-cli/src/main.rs:42-45
// Ward identity-layer enforcement (Gates 1-2). Not yet wired into the API
// router or control plane; see ward.rs for the follow-up gates/endpoints.
#[allow(dead_code)]
mod ward;
```

A repo-wide search for `ward::`, `Ward::`, and `mod ward` returns **only `ward.rs` itself** (its own `#[cfg(test)]` unit tests) and this declaration. The `#[allow(dead_code)]` attribute is an explicit instruction to the compiler not to warn that the module is unused. Coven's strongest structural control is, at `v0.0.54`, exercised only by its own tests.

### 3.3 Can the approval prompt be suppressed? — **Yes, and the default posture is full-access.**

Two distinct paths:

| Path | Condition | Default |
|---|---|---|
| `COVEN_CLAUDE_BYPASS_PERMISSIONS=1` env var → `--permission-mode bypassPermissions` | opt-in | **`false`** ✔ |
| `--permission full` → `bypassPermissions` (Claude) / `--sandbox danger-full-access` (Codex) | user selects `full`; also the **documented default when `--permission` is absent** | **`full`** ✘ |

```rust
// harness.rs:913-920
fn claude_permission_bypass_enabled_from_value(value: Option<&str>) -> bool {
    value.map(|v| { let v = v.trim(); v == "1" || v.eq_ignore_ascii_case("true") })
         .unwrap_or(false)
}
```

```rust
// harness.rs:82
// `Full` preserves today's behavior (no restriction);
```

The env-var bypass **defaults to off** — this is the one suppression switch that is correctly opt-in, and it is better than Claude's `autoAllowBashIfSandboxed: true` default. But the *policy name* the product reaches for by default is "full", which maps to Claude's own bypass escape hatch. `acceptEdits`, `yolo`, `auto_approve`, `autoAllow*IfSandboxed` are all **CODE=0**.

### 3.4 Enforcement-liveness signal — **absent.**

No `{ backend, enforces: bool }` equivalent exists. `SandboxMapping` carries *flag strings*, not enforcement state. The single CODE hit for `enforces` is a doc comment describing the **harness's** enforcement, not Coven's:

```rust
// harness.rs:240
/// How this harness enforces a sandbox/permission policy.
```

No struct exposes whether confinement is actually active. A caller cannot distinguish "sandbox active" from "sandbox configured" — and in Coven, "configured" merely means "a flag string was chosen for someone else's binary."

### 3.5 Credential / exfiltration controls — **redaction is real; egress control is absent.**

**Implemented (CODE, genuine):** secret redaction on the storage/return path.

```rust
// crates/coven-cli/src/privacy.rs:102-229
pub fn redact_text(text: &str) -> String
pub fn redact_value(value: &Value) -> Value
pub fn redact_payload_json_with_config(payload_json: &str, config: &PrivacyConfig) -> String
    normalized == "authorization" || normalized == "cookie" || normalized == "set_cookie"
    r"(?is)-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----.*?-----END [A-Z0-9 ]*PRIVATE KEY-----"
    r"(?im)\bAuthorization\s*:\s*(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+"
```

`SECURITY.md` states this is applied to event payloads before SQLite storage and before return from `/events`, `/sessions/:id/events`, `/sessions/:id/log`, with bounded retention (7 days raw, 30 days redacted) and optional authenticated local encryption for raw artifacts.

**Absent:** no `credentials.files` deny/mask model (CODE=0), no `denyRead` (CODE=0), no `secretAccessKeyVar`-style indirection, **no network allowlist or egress control**. The census's "network allowlist" CODE=13 in 7 files was traced and is entirely incidental — comments about Claude Code's own pre-allowlisting and regression-test names.

**This distinction matters:** redaction controls what is *persisted and returned*. It does not stop a tool call from *sending* a secret to an attacker-controlled host. Coven has no exfiltration control in the network sense.

### 3.6 Administrative / managed-policy lock — **absent.**

`managed_settings` / `managedSettings` / `managed_config`: **CODE=0**. `admin policy / org lock`: **CODE=0**. There is no mechanism by which an operator can force a restrictive posture, and no lock preventing a user from widening it.

### 3.7 Prompt injection — **layer (a), prose only. Defeatable by construction.**

There is **no code that structurally validates or rejects untrusted input before the model sees it.** The only `prompt injection` hits in the CODE bucket are in `skills/openclaw-skills-manifest.json` — a catalogue of skill *descriptions*. The substantive material is prose:

```markdown
# skills/security-agent/references/prompt-injection-defense.md
### Direct Prompt Injection (ATLAS: AML.T0051)
- **Mitigation**: … Agent instructions that explicitly mark untrusted content boundaries.
### Indirect Prompt Injection (ATLAS: AML.T0051.001)
- **OpenClaw defense**: `web_fetch` wraps external content in `EXTERNAL_UNTRUSTED_CONTENT` markers…
- **Residual risk**: Model may still follow injected instructions despite markers.
```

Two aggravating details: the document **itself concedes the control is defeatable**, and the mitigation it describes belongs to **OpenClaw**, not to Coven's runtime. Coven ships an instruction *about* injection defence; it does not implement one.

The `authority` vocabulary in CODE is a different concept — daemon sole-authority, socket ownership, and the Ward's path-tier signatures. It is an authorization mechanism over **paths**, not a provenance rule over **content**. No "did this request originate in the user's own words?" test exists anywhere.

### 3.8 MCP — **discovery only; zero response validation. Strictly weaker than Claude.**

`crates/coven-cli/src/capabilities.rs` reads MCP server **definitions** from third-party config files:

```rust
// capabilities.rs:341-353
/// Scan `~/.cursor/mcp.json` for Cursor MCP servers.
/// Format: `{"mcpServers": {...}}` — same top-level shape as Claude desktop.
let config_path = home_dir.join(".cursor").join("mcp.json");
```

…and similarly Gemini settings and the Claude desktop shape. A targeted search for `jsonrpc`, `JSON-RPC`, `mcp.*(valid|schema|template)` returned **zero hits**. There is no template or schema validation of MCP **server responses**, no fail-closed rejection path, no declared content contract.

---

## 4. Comparison against the Claude baseline

| # | Question | **Coven v0.0.54** | **Claude Desktop 2.31226.1.0** (baseline claim) | Verdict |
|---|---|---|---|---|
| 1 | OS-level confinement | **None.** Zero primitives. Windows Job Objects used only for process-tree `TerminateJobObject`; no `JOB_OBJECT_LIMIT_*`. Seatbelt/bwrap/Landlock/seccomp/AppContainer all CODE=0. `sandbox` = flag-mapping into the downstream CLI. | Rich `sandbox.*` schema with per-platform backends (macOS seatbelt, Linux isolation). | **Claude ≫ Coven.** Coven confines nothing; it delegates. |
| 2 | Fail-closed / fail-open | **Fail-open on execution** — no `failIfUnavailable`; unconfined degradation is a warning, not an error; absent `--permission` == `full`. **Fail-closed on the daemon control plane** (socket/home ownership, live). | **Fails open by default**: `failIfUnavailable: false` → "a warning is shown and commands run unsandboxed." | **Mixed.** Coven's daemon layer is genuinely fail-closed; its execution layer has no mechanism to fail either way. Neither is safe-by-default for execution. |
| 3 | Approval suppression | `COVEN_CLAUDE_BYPASS_PERMISSIONS=1` → `bypassPermissions`, **default `false`** ✔. But `--permission full` → `bypassPermissions` / `danger-full-access`, and **`full` is the documented default**. | `autoAllowBashIfSandboxed` **default `true`** (suppresses prompt); `allowUnsandboxedCommands` **default `true`** (honours bypass). | **Coven better on the flag default.** Claude has two default-on escape hatches; Coven has one, and it is opt-in — but Coven's *default posture* is still full-access. |
| 4 | Enforcement-liveness signal | **None.** Only CODE hit is a doc comment about the harness's enforcement. | **None found** exposed to callers. | **Tie (both absent).** A tie at zero is still a gap. |
| 5 | Credential / exfiltration controls | **Secret redaction is real and code-enforced** (privacy.rs; authorization/cookie/private-key/env patterns, applied pre-storage). **No** `credentials.files` deny/mask, **no** network allowlist, **no** egress control. | `credentials.files` deny + mask entries, `filesystem.denyRead`, `network.allowedDomains`. | **Claude better on policy depth; Coven better on being unambiguous that it only redacts.** Redaction ≠ exfiltration control. |
| 6 | Managed / admin lock | **None.** CODE=0 for managed settings and admin policy. | Restrictive-only managed-settings policy; admin can force sandbox-on and lock escape hatches. | **Claude ≫ Coven.** Coven has no governance surface at all. |
| 7 | Prompt injection | **Layer (a) — prose only.** A skill reference doc, describing *OpenClaw's* markers, which concedes "Model may still follow injected instructions despite markers." No structural validation. | **Layer (a)** authority-provenance rule in prose, **plus** layer (b) code-enforced MCP prompt-response template validation, rejected fail-closed with a JSON-RPC error. | **Claude better.** Claude has at least one structurally enforced control; Coven has prose only. Both prose layers are defeatable by construction. |
| 8 | MCP-specific | **Discovery only.** Reads server *definitions* from `~/.cursor/mcp.json`, Gemini settings, Claude desktop shape. **Zero** response validation. | Template validation of MCP **prompt responses**, fail-closed with JSON-RPC error. | **Claude better.** This is the one dimension where Claude has a real code-enforced control and Coven has none whatsoever. |

### Which design is stronger, for which threat

**For an untrusted agent doing destructive or exfiltrating work, Coven is weaker than the Claude baseline on six of eight dimensions**, and it lacks the two primitives that matter most: a confinement primitive, and any way to make execution refuse when confinement is absent. Claude at least confines by default-on-config and can be administratively pinned; Coven offers no pin and no confinement to pin.

**Claude's richer config surface is not automatically better, and the task prompt is right to flag this.** Two of Claude's defaults are actively permissive — `allowUnsandboxedCommands: true` and `autoAllowBashIfSandboxed: true` mean the sandbox suppresses its own safety prompts, and `failIfUnavailable: false` means it degrades to unsandboxed with a warning. A user who installs Claude Desktop and changes nothing gets unsandboxed execution behind a suppressed prompt. That is a worse *effective* posture than it looks.

**But "Coven's default is also permissive" is a weaker claim than it appears, and the distinction is worth stating precisely.** For a user who configures nothing, both systems end up running a coding-agent CLI with full access — Coven because it never confines and defaults to `full`, Claude because its sandbox fails open. So the *outcome* is comparable.

**The real gap is in kind, not degree.** Claude has a sandbox that is often disabled; Coven has no sandbox that can be enabled. Claude's config surface can be turned *up* by an administrator; Coven's cannot be turned up at all, because there is nothing underneath to configure. That is why Claude scores better even while failing open: a default-off control is a repairable deployment mistake, whereas an absent control is a property of the architecture.

**Where Coven is genuinely better, and it should be credited:**

- The env-var bypass defaults to **false**. Opt-in is the correct polarity for a prompt-suppression switch, and Claude's equivalent defaults to true.
- Secret redaction is **real, code-enforced, and applied on the storage/return path** with bounded retention and optional encryption. This is a control Claude's baseline does not describe at all.
- The daemon control plane **fails closed** on socket and home ownership, with tests. Claude's baseline says nothing comparable about its own IPC surface.

**Where Coven's own documentation is more honest than its code.** `SECURITY.md` states outright: *"Please treat the repository as pre-1.0 software and avoid running untrusted harnesses or prompts in sensitive repositories."* And `docs/POSITIONING-VS-OMNIGENT.md` assigns session sandboxing to **Omnigent**, not to Coven — Coven claims only the *identity layer*. That matters for fairness: **Coven does not appear to overclaim OS-level sandboxing.** The seatbelt/bwrap DOC hits are Coven describing a *different product*, not Coven claiming a feature it lacks.

The catch is sharp, though: the identity layer Coven *does* claim — the Ward, its one genuinely fail-closed deterministic gate — is **not wired into the router or control plane**. A modest claim that is honestly scoped is still unmet at `v0.0.54`.

---

## 5. Findings with severities

| ID | Severity | Finding |
|---|---|---|
| **F-1** | **HIGH** | **No OS-level execution sandbox.** Zero confinement primitives in CODE. `sandbox: Option<SandboxMapping>` is a pass-through that selects flags on the downstream CLI (`bypassPermissions`, `danger-full-access`). The only Windows primitive is a Job Object used for process-tree teardown with no `JOB_OBJECT_LIMIT_*` set. Confinement is entirely inherited from an unverified third-party binary. |
| **F-2** | **HIGH** | **The Ward — Coven's only genuinely fail-closed deterministic security gate — is dead code.** `main.rs:42-45`: *"Not yet wired into the API router or control plane"* + `#[allow(dead_code)] mod ward;`. Repo-wide search finds no call sites outside its own unit tests. The project's central identity-layer guarantee does not execute. |
| **F-3** | **HIGH** | **Default posture is full-access.** `main.rs:1858` documents an absent `--permission` as *"equivalent to `full`"*, which maps to Claude's `bypassPermissions` and Codex's `danger-full-access`. There is no configuration in which Coven refuses to execute unconfined. |
| **F-4** | MEDIUM | **No enforcement-liveness signal.** No `{backend, enforces}` equivalent. A caller cannot distinguish active confinement from a configured flag string — and here "configured" often means "mapped onto someone else's binary." |
| **F-5** | MEDIUM | **No network egress control.** No allowlist, no domain policy. Secret redaction covers the *persistence and return* path only; it does not prevent a tool call from transmitting a secret. Redaction is not an exfiltration control. |
| **F-6** | MEDIUM | **No managed/administrative lock.** CODE=0 for managed settings and admin policy. No operator can force a restrictive posture or prevent a user from widening it — a governance gap that would block enterprise deployment regardless of the other findings. |
| **F-7** | MEDIUM | **Prompt-injection defence is prose only, and is not Coven's own.** No structural validation of untrusted input. The one reference document describes OpenClaw's markers and concedes *"Model may still follow injected instructions despite markers."* |
| **F-8** | MEDIUM | **MCP responses are entirely unvalidated.** MCP servers are *discovered* from third-party config (`~/.cursor/mcp.json`, Gemini settings, Claude desktop shape) with zero schema/template validation of anything they return. Strictly weaker than the Claude baseline, whose only code-enforced control is exactly this. |
| **F-9** | LOW *(positive)* | **Prompt-suppression env var defaults to `false`** (`harness.rs:913-920`). Correct polarity; better than Claude's default-true `autoAllowBashIfSandboxed`. |
| **F-10** | LOW *(positive)* | **Secret redaction is real and code-enforced** (`privacy.rs`), applied pre-storage to events, with bounded retention and optional encryption of raw artifacts. |
| **F-11** | LOW *(positive)* | **Daemon control plane fails closed** on socket and home-directory ownership, with regression tests. |
| **F-12** | INFO | **`docs/daemon/auth-posture.md` is an unfilled stub** — its entire body is `"Stub — fill in. See [Daemon overview]"`. The daemon authentication posture is documented nowhere, despite live fail-closed logic existing in `daemon.rs`. |
| **F-13** | INFO | `crates/coven-cli/Cargo.toml` declares `version = "0.0.0"`; the crate version is never bumped per release. Only the git tag identifies a release. Downstream automation must not use Cargo.toml for version checks. |

---

## 6. What this audit does NOT establish

Stated plainly, because the gaps are as important as the findings:

1. **Nothing was executed.** No build, no install, no test run, no invocation of any Coven code. Every conclusion is static reading of source text at one commit. Runtime behaviour is unverified — including whether any code path I read as dead is genuinely unreachable in some other configuration.
2. **`v0.0.54` is ~3 months behind `main`.** `main` is `d6afbffd`, far ahead. Any of F-1…F-8 may already be fixed upstream. **These findings describe `v0.0.54` only** and say nothing about current Coven.
3. **Downstream harness behaviour is out of scope.** Whether `claude --permission-mode plan` or `codex --sandbox read-only` actually confines anything was not evaluated. Coven's posture is inherited from binaries this audit did not inspect.
4. **Redaction effectiveness was not measured.** The patterns in `privacy.rs` were read, not tested. Their coverage against real-world secret shapes is unknown.
5. **`crates/coven-memory` and `crates/coven-relay` were scanned but not deeply read.** Both are in the census (CODE bucket) and neither contains a sandbox primitive, but I did not audit them line-by-line for subtler controls.
6. **`packages/` (TypeScript) and `web/` were scanned as CODE but not deeply read.** My close reading concentrated on `crates/coven-cli/src`. A control in the TS layer would not necessarily have been found by hand.
7. **Absent ≠ absent in every sense.** "CODE=0" means the needle did not occur in the first-party text corpus at this commit. It does not rule out a control implemented under entirely different vocabulary, in a dependency fetched at build time, or in a branch not reachable at this tag.
8. **The Claude baseline was not re-verified.** It is taken as given from prior analysis of Claude Desktop 2.31226.1.0. If any baseline claim is wrong, the verdicts in §4 inherit that error. This asymmetry should be read honestly: Coven's side is first-hand evidence, Claude's side is second-hand.
9. **No dynamic or adversarial testing.** No prompt injection was attempted, no escape was attempted, no config was fuzzed.

---

## 7. Evidence index

**Raw evidence directory:** `%TEMP%\coven-audit\_audit\`

| Artifact | Contents |
|---|---|
| `PINNED.txt` | Repo, tag, commit SHA, file counts, bytes, vendor check, calibration, primary source inventory |
| `census.mjs` | The census script — read-only scanner, three-bucket classifier, positive + negative controls |
| `census-output.txt` | Full console output of the passing run |
| `census-detail.json` | Per-needle CODE/DOC file lists, machine-readable |

**Primary sources read** (all under `crates/coven-cli/src/`):

| File | Size | Cited for |
|---|---|---|
| `main.rs` | 146,795 B | `mod ward` + `#[allow(dead_code)]` (:42-45); `--permission` default (:1854-1858) |
| `daemon.rs` | 166,725 B | Job Objects (:415-437, :487-543); fail-closed socket/home (:724, :743, :1595, :1758) |
| `harness.rs` | 108,807 B | `SandboxMapping` (:240-244); bypass env default (:903-935); permission mappings (:417-449) |
| `ward.rs` | 48,698 B | Fail-closed identity gate, Gates 1–2, symlink-escape handling |
| `privacy.rs` | 15,250 B | Redaction implementation (:102-229) |
| `capabilities.rs` | 50,370 B | MCP definition discovery (:257-375) |
| `SECURITY.md` | — | Redaction/retention claims; pre-1.0 caution |
| `docs/POSITIONING-VS-OMNIGENT.md` | — | Omnigent owns session sandbox; Coven claims identity layer |
| `skills/security-agent/references/prompt-injection-defense.md` | — | Prose-only injection defence; self-declared residual risk |
| `docs/daemon/auth-posture.md` | — | Unfilled stub |

**Reproduction:** `node %TEMP%\coven-audit\_audit\census.mjs %TEMP%\coven-audit` — expect `CALIBRATION RESULT: PASS`.