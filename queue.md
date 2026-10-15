# Static Study — Work Queue

Established 2026-10-13. Extends the Typeless 2.8.1 study (`../verify/VERIFICATION-REVIEW.md`)
to two additional locally-installed desktop clients.

**Method:** static only.

---

## Global rules (apply to every target)

These are inherited from the Typeless engagement and are **not** per-target options.

| # | Rule | Why |
|---|------|-----|
| G1 | **Static analysis only.** Never launch the app, never let it phone home, never attach a debugger to a live process, never load a DLL into a live host. | A launched agent client executes real code with the user's credentials. |
| G2 | **"0 hits" is never evidence of absence.** Every count states (a) method, (b) corpus scope (code / locales / both), (c) whether the corpus was the obfuscated pool or raw text. | Obfuscation, string-array encoding, and per-file obfuscation keys all defeat naive grep. |
| G3 | **Prior reports are claims under test, never evidence.** Re-derive from the artifact. | Prior work already produced 4 confirmed errors in one pass. |
| G4 | **Rebuild any decoder from scratch**, ignoring existing string indexes, then validate it against ≥5 independent use sites before trusting a single index. | Typeless traps #11 (string is both index and literal) and #20 (per-file keys) each silently corrupted a pass. |
| G5 | **`.js` globs include `.mjs`.** `Get-ChildItem -File -Include *.js` without `-Recurse` returns zero files silently (Typeless trap #18). | Silent zero is worse than no zero. |
| G6 | **Count occurrences, not lines**, on single-line minified bundles. | A 630 KB one-line file is 1 line and ~600 KB of content. |
| G7 | **Extracted trees are read-only.** Never copy, never redistribute vendor source. Scratch work goes in `%TEMP%` or this workspace only. | These are proprietary, unpublished vendor sources. |
| G8 | **Every headline claim gets an adversarial second pass** by an independent verifier that rebuilds its own decoder, and every alleged error is re-verified by me before acceptance. | One reviewer caught 4 real errors in my own report. |
| G9 | **Byte count ≠ char count.** Record both. | Typeless trap #19. |
| G10 | **Obfuscation is per-file, not global.** Never carry a decoder across files. | Typeless trap #20. |

---

## Queue

| # | Target | Version | Status | Folder |
|---|--------|---------|--------|--------|
| 0 | Typeless 2.8.1 — adversarial re-verification | 2.8.1 | ✅ **Done** | `../verify/` |
| 1 | **Claude Desktop** | 2.31226.1.0 (Electron/Chromium 44.4.3) | ✅ **Done — 7/7 reports + verification brief + adversarial pass** | `claude/` |
| 2 | **Codex** | 26.1007.2314.0 (Chromium 155.0.8059.40, "owl" shell) | ✅ **Done — 11/11 reports + verification brief + adversarial pass** | `codex/` |

### Scope (confirmed by user 2026-10-13)

**Security-posture focus.** In scope: IPC surface, sandbox/elevation boundary, auto-update,
code signing, native binary inventory. **Out of scope:** feature walkthroughs and per-subsystem
documentation for their own sake.

Each target yields **6–8 reports**, not the 18+ function folders of the Typeless study.

Expected per-target report set:

1. `01-artifact-manifest.md` — SHA-256 of everything examined, byte + char counts.
2. `02-ipc-surface.md` — every handler/invoker, set-difference both ways, sender validation.
3. `03-sandbox-boundary.md` — per-window `webPreferences`, fail-open paths.
4. `04-native-and-elevation.md` — exports, RVA↔file-offset, privilege-elevation reachability.
5. `05-update-and-signing.md` — update channel, signature verification, entitlements.
6. `06-findings.md` — consolidated.
7. `verification-brief.md` — every claim, its verdict, and its stated method.
8. Adversarial second pass — corrections preserved visibly (G8).

---

## Target 1 — Claude Desktop 2.31226.1.0

**Status:** queued, next up. Not started.

### Artifact map

Package root (MSIX, readable only by exact path — the parent `C:\Program Files\WindowsApps`
denies directory listing but permits direct traversal into a known package folder):

```
C:\Program Files\WindowsApps\Claude_2.31226.1.0_x64__pzs8sxrjxfjjc\
├── AppxManifest.xml            11,421 B
├── AppxSignature.p7x           10,547 B
├── resources.pri               441,392 B
└── app\
    ├── claude.exe           246,402,896 B   ← Electron main process
    ├── ffmpeg.dll             3,132,288 B
    ├── dxcompiler.dll        25,766,224 B
    ├── vulkan-1.dll             959,824 B
    ├── v8_context_snapshot.bin  742,200 B
    ├── version                       6 B   ← "44.4.3"
    └── resources\
        ├── app.asar         44,590,401 B   ← primary JS payload
        ├── app.asar.unpacked\          (3 native binaries, largest 20.6 MB)
        ├── ion-dist\                  ← renderer bundle tree
        │   ├── index.html         45,944 B
        │   ├── frame-shell.html   24,634 B
        │   ├── frame-connect.html  1,635 B
        │   ├── frame-manage.html   1,632 B
        │   ├── scc.json               151 B
        │   ├── custom-3p-gated-imports.json  35 B
        │   └── {assets,audio,i18n,images,_frame-rt}/
        ├── chrome-native-host.exe 1,130,832 B
        ├── claude-ssh-broker.exe   2,599,248 B
        ├── claude-ssh-proxy.exe    1,976,144 B
        ├── claude-ssh-askpass.exe  2,648,912 B
        ├── claude-browser-shim.js       6,770 B
        ├── cowork-svc.exe        13,605,200 B
        ├── smol-bin.x64.vhdx    37,748,736 B   ← embedded VM disk
        └── {50+ locale .json files, en-US.json = 56,092 B}
```

**Out of scope (stated, not silently dropped):** `~/.claude/` — 5 files, only `settings.json`
(`{"autoUpdatesChannel": "latest"}`). No Claude Code CLI is installed (`claude` not on PATH).

### Open questions to resolve

- Does the preload expose raw `ipcRenderer` passthroughs, as Typeless did? *(Typeless precedent:
  `on`/`send`/`invoke` were unvalidated passthroughs with zero sender checks.)*
- What is `cowork-svc.exe` and does it accept commands over a local socket/pipe?
- `smol-bin.x64.vhdx` — a 37.7 MB Hyper-V disk shipped inside the package. What is the VM for,
  and does it run with a network adapter or shared folder?
- Is the `ssh-broker` the trust boundary for remote sessions, and who can drive it?
- What does `custom-3p-gated-imports.json` gate?
- Is there an `update` channel with signature verification, given `autoUpdatesChannel: latest`?

### Definition of done

1. Artifact manifest with SHA-256 for every file examined; byte + char counts for every text file.
2. Decoder rebuilt from scratch per obfuscated file, validated on ≥5 use sites (G4).
3. Full IPC channel inventory: every `handle`/`on` in main, every `invoke`/`send` in renderer,
   with the **set difference both ways** and an explicit statement of sender validation per handler.
4. Sandbox / `webPreferences` posture per window, with the count of windows sharing each config.
5. Native binary inventory: exports, RVA↔file-offset mapping stated explicitly, entry points.
6. Update / code-signing posture.
7. A `reports/verification-brief.md` listing every claim with a verdict and a stated method.
8. An adversarial second pass (G8) with all corrections preserved visibly.

---

## Target 2 — Codex 26.1007.2314.0

**Status:** queued behind #1. Not started.

### Artifact map

```
C:\Program Files\WindowsApps\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0\
└── app\
    ├── Codex.exe                20,272 B   ← launcher stub
    ├── ChatGPT.exe          4,781,872 B
    ├── chrome.dll         329,411,888 B   ← Chromium, not vendor code
    ├── chrome_elf.dll        2,823,504 B
    ├── elevation_service.exe 3,905,840 B   ← ELEVATION
    ├── elevated_tracing_service.exe 4,546,544 B
    ├── 155.0.8059.40.manifest        226 B
    ├── owl-shell-runtime.json         104 B
    └── resources\
        ├── app.asar     567,399,024 B   ← primary JS payload (541 MB)
        ├── app.asar.unpacked\
        ├── codex.exe    334,121,776 B   ← the agent binary
        ├── codex        294,451,848 B   ← no-extension variant
        ├── codex-code-mode-host.exe 74,712,368 B
        ├── codex-command-runner.exe   8,204,592 B
        ├── codex-windows-sandbox-setup.exe 17,725,744 B  ← SANDBOX SETUP
        ├── codex-notification-helper.exe    109,686 B
        ├── rg.exe / rg            4,352,304 / 5,408,904 B
        ├── native\                          ← co_node, re_*, wi_* (.node/.dll)
        ├── plugins\, skills\, plugin-signals\
        ├── tectonic\                       ← 55 MB LaTeX
        ├── cua_node\                       ← computer-use node runtime
        ├── default_app\                    ← 2,804 / 73,801 / 12,057 / 8,657 B
        ├── chatgpt-theme*.json             ← 30,208 / 30,990 B
        ├── accessibility\                  ← 2,400 B
        └── owl-app.ini, owl-electron.json, masque-*, THIRD_PARTY_NOTICES
```

**Out of scope (stated, not silently dropped):** `~/.codex/` — 6,934 files including
`logs_2.sqlite` (1.07 MB + 4.25 MB WAL), `memories_1.sqlite`, `state_5.sqlite`,
`queue_1.sqlite`, `goals_1.sqlite`, and `config.toml`. These are **the user's own conversation
and memory data**, not application code. They will not be read unless explicitly requested.

Also out of scope: `chrome.dll` (329 MB of upstream Chromium) and the `.pak` locale tables.
Analyzing vendor code is the objective; re-deriving Chromium's internals is not.

### Open questions to resolve

- `codex-windows-sandbox-setup.exe` — what does it configure, and does it require elevation?
- `elevation_service.exe` — what is its IPC surface, and can an unprivileged renderer reach it?
  *(This is the highest-value question in the whole queue: an Electron app that can reach an
  elevation service is a privilege-escalation story.)*
- Does the sandbox setup fail **open**, the way Typeless's GPU-crash handler failed open to
  `--no-sandbox`? Compare exit-code handling and default flag state.
- Same IPC question as Claude: raw passthrough? sender validation?
- `codex.exe` is 334 MB and likely a Rust binary. Confirm toolchain and locate the real
  command-execution path, approval gate, and sandbox enforcement point.

### Definition of done

Same 8-point checklist as Target 1, plus:

9. Explicit elevation / sandbox boundary map: every binary that can raise privilege, every path
   that reaches it, and the validation on each.
10. A direct comparison table against the Typeless findings, since these are the same class of
    product — an Electron chat client with agentic tool execution and a local sandbox.

---

## Status log

| Date | Event |
|------|-------|
| 2026-10-13 | Queue created. Both MSIX packages confirmed directly readable by exact path. Scope depth pending user confirmation. |
| 2026-10-13 | Scope confirmed: security-posture focus. Hourly resume cron created (`146c645a-3ea1-4e74-93f6-1f195abd7c9e`, `0 * * * *`, America/Los_Angeles, fixed task-owned session). |
| 2026-10-13 | **Claude Desktop started.** Wrote `01-artifact-manifest`, `02-ipc-surface`, `03-sandbox-boundary`, `04-consent-and-bypass`. |
| 2026-10-13 | Methodology trap **#21** found and corrected: ripgrep skips dot-directories, so a `.vite/build/**` search returned a confident false zero. All ripgrep negatives over this corpus must be re-verified with `Select-String` over an explicit file list. |
| 2026-10-13 | Self-correction: an interim read concluded "no preload exists" from that false zero. **Wrong** — 13 preloads exist as per-window `.vite/build/*.js`. Recorded in report 01 rather than silently fixed. |
| 2026-10-13 | REA `analyze_javascript_application` failed twice on the 44 MB ASAR (MCP transport timeout ×2), then the CLI fallback produced **no output in ~90 minutes** and was cancelled. Superseded by a purpose-written ASAR header parser plus full-corpus analysis. REA is still the right tool for the **native** binaries in report 05. |
| 2026-10-13 | **Claude Desktop — reports 01–07 + `verification-brief.md` complete; adversarial second pass finished with verdict PARTIAL.** Nine corrections (C-A…C-I) recorded visibly; one new material finding (F1a, the `Yjr` fail-open) survived independent re-verification and a calibrated negative. Target 1 → **Done**. |
| 2026-10-13 | Corrections ledger: C-A `sandbox:!0` misread as false (fixed, conclusion strengthened) · C-B natives misidentified as Rust, actually Go 1.25.14 · C-C 4 fuses decoded `UNKNOWN`, actually DISABLED · **C-D handler count 2,092 → 1,294** (nested-tuple double-count; "798 orphans" → **0**) · C-E 4 guards check top frame only · C-F allowlist not "exactly" 5 origins · **C-G NEW: `Yjr` fails open** · C-H 6 literal handlers do exist outside `ao()` · C-I a second in-tree SSH stack with its own `known_hosts` parser exists. |
| 2026-10-13 | Shell working directory `C:\Users\AI-Howard\.minimax\workspace` was missing and blocked all commands; recreated with a placeholder file. Deletion of 2 stale zero-byte evidence files (`all-files-summary.txt`, `asar-analysis.json`) was **blocked by local safety policy** — they remain on disk and are harmless, but are leftovers from the prior run. |
| 2026-10-13 | **Codex Desktop started.** Purpose-written ASAR parser (validated against the known-good Claude asar, 478 entries, after its first header offsets failed). Codex `app.asar` = 567,399,024 B / 20,988 entries / `headerSize` 5,829,680; extracted 20,980 files / 566,146,084 B to `%TEMP%\codex-src`. 43 evidence scripts + outputs in `codex/evidence/`. |
| 2026-10-13 | **Codex provenance finding:** `elevation_service.exe` is **upstream Chromium C++**, not OpenAI code — `chrome/elevation/{caller_validation,elevator,elevated_recovery_impl,elevation_service_delegate}.cc` in the PDB paths, 0 OpenAI source paths. Codex ships a Chromium-based **"owl" shell** (`owl-electron-app.json`, `runtimeName:"owl"`), so the Electron runtime lives in `chrome.dll`, not in `ChatGPT.exe`. |
| 2026-10-13 | **Codex: the queue's highest-value question is answered.** An unprivileged renderer **cannot** reach `elevation_service.exe`: **0** occurrences across 14,816 JS files (MAIN 34 + RENDER 14,782), MAIN and RENDER counted separately throughout. Attacked from three angles — lifting every file-class exclusion (998 `.json`, 34 `.wasm`, 43 `.c`/`.h`, 113 no-ext, 2 `.data`: all 0), breaking the literal search (base64/base64url/hex-escape/char-code/split-concat: all 0), and inventorying what JS *can* name (**64 real `.exe` literals** — `wsl.exe`, `cmd.exe`, `powershell.exe`, `codex.exe`, `codex-windows-sandbox-setup.exe`…; `elevation_service.exe` absent). |
| 2026-10-13 | **Codex: sandbox setup fails CLOSED, not open.** `src-BJv5Mk7n.js` @293330 — mode ∈ {`elevated`,`unelevated`}; timeout `lo=12e5` (20 min) calls `r.fail(Error(co))` which **rejects**; cooldown `uo=3e5` (5 min) refuses the same mode; wrong-mode/unsolicited completions logged and dropped; automation permission narrowing throws `No compatible automation permissions satisfy the managed requirements`. **Opposite of Typeless's GPU-crash handler, which failed open to `--no-sandbox`.** |
| 2026-10-13 | **Codex IPC is a bounded allowlist, not a passthrough.** 7 `ipcMain.handle` + 17 `ipcMain.on` = **24 registrations**, 17 minified channels (`g.pt`…`g.At`) + 1 literal (`codex_desktop:check-for-updates`). Sender validation in 3 layers, failing closed: registered-`webContents`-id allowlist → `isTrustedIpcEvent` guard → top-frame `senderFrame !== mainFrame` deny-shaped fallback. 3 `contextBridge.exposeInMainWorld` calls. Compare Claude: 1,294 channels; Typeless: raw passthrough. |
| 2026-10-13 | **Codex signing: 12/12 PE binaries Valid**, one certificate `CN="OpenAI OpCo, LLC"` (EV/"ID Verified CS AOC CA 03"), sha384RSA, countersigned, thumbprint `0C6C3CA9…`, notAfter 10/09/2026; MSIX `SignatureKind: Store`, `Status: Ok`. **No Electron fuse wire exists** (0 valid wires over 34 PE/`.node` candidates) despite the declared `@electron/fuses ^1.8.0` dependency — the target's largest open question. |
| 2026-10-13 | **Codex reports 01–07 + `verification-brief.md` written (8 files).** 7 findings: F1 no fuse wire (medium) · F2 8 natives incl. the node-pty stack outside the ASAR (low, MSIX-mitigated) · F3 update path swallows `0x80073D28` and records `update-ready` (medium, pending native confirmation) · F4 `devTools:true` set unconditionally in the browser-webview hardening fn (low) · F5 renderer cannot reach elevation (negative, verified) · F6 one plugin key across all 10 bundled plugins (informational) · F7 sandbox fails closed (positive). |
| 2026-10-13 | **Codex corrections ledger: 11 corrections (C-A…C-K), 3 of them to this study's own earlier work.** C-A renderer corpus 20,119 → **14,782** files (all-extensions counted as JS) · C-B `runas` MAIN 7 = all `runAsync`; word-bounded `\brunas\b` = 5, all non-elevation (command-vocabulary list, a `runAs` UI field, 2 Latvian locale strings) · C-C renderer `elevator` = an emoji shortcode table · **C-D IPC census counted files not matches** (uniform fake "34") · C-E `.node` 0 in tree = ASAR `unpacked`, not absence · C-F 3 "unsigned" = **Linux x86-64 ELF** (magic `7f454c46`) · C-G fuses "absent" from `ChatGPT.exe` = wrong file → found in `chrome.dll` · C-H that sentinel is an **error-message substring** (`ValidateIntegrityOrDie`), not a wire → **0 valid wires** · C-I queue map omitted `codex-windows-sandbox-service.exe` · C-J two version schemes (MSIX `26.1007.2314.0` vs in-app `26.1007.21434`) · C-K `elevation_service.exe` is Chromium, not OpenAI. |
| 2026-10-13 | **Codex adversarial pass complete — 8/8 reports + brief + pass. Nothing refuted.** Headline negative attacked 3 ways (lifted all exclusions incl. the 43 shipped `.c`/`.h` sources: all 0; 5 encodings: all 0; inverted to enumerate the **64 real `.exe` literals** JS can name — `elevation_service.exe` absent). IPC recount confirmed 7+17=24 by **two different engines**, C-D trap clear. F3 catch block verified **byte-exact** @`bootstrap` 24482. F7 fail-closed re-derived from `fail:e=>n.reject(e)`. |
| 2026-10-13 | **Honest limit on the Codex adversarial pass:** the delegated verifier subagent (`bg_6ab5ccf0-…`) produced **no output across an extended run and was cancelled** without a verdict. The pass was performed **directly, not independently**. No independent verdict is claimed. Recorded in `codex/reports/08-adversarial-pass.md` §8.5 and `verification-brief.md` §7. Ten residual unknowns (R1–R10) remain open; **R1 (whether absent fuses mean absent protections) is the largest**. |
| 2026-10-13 | **Codex Desktop — Target 2 → Done.** 8 reports in `codex/reports/`, 45 files in `codex/evidence/`. **All three queue targets are now Done** (Typeless, Claude Desktop, Codex). No further targets are queued; the next step is to add a target or stop. |
| 2026-10-13 | **Post-Done cleanup — C-M closed and strengthened, C-N resolved.** After the harness investigation, the 25-binary signing gap was closed properly: **package-wide magic-byte enumeration → 60 PE files, 60 Valid, 0 NotSigned, 0 Unknown** (59 × `CN="OpenAI OpCo, LLC"` thumbprint `0C6C3CA9…`, 1 × Microsoft `d3dcompiler_47.dll`). Stronger than the report's original hardcoded-15 claim, and lower than the cancelled subagent's guess of 92. The subagent's "Microsoft-signed binary inside an OpenAI MSIX" alarm is **downgraded to a non-finding** — Microsoft redistributable DLLs in a Chromium app directory are normal. **C-N:** the subagent's "`runas` 121 vs report 131" discrepancy was **not an error** — `/runas/g`=121 vs `/runas/gi`=131 is a regex flag difference; word-bounded `/\brunas\b/gi`=5, all non-elevation (Latvian locale strings + a Windows command-vocabulary list). Elevation-verb `runas` corpus-wide: **0**. |
| 2026-10-13 | **Harness architecture documented** (`harness/01-agent-orchestration-explained.md`). Established from runtime evidence + public sources that the todo/subagent/report-back loop is the **runtime creating real child sessions** (`sessionType:'branch'`, `purpose:"local-background-task:bg_<uuid>"`), with frozen tool lists, blocked nesting, shared permission gate, and receipt-first delivery rate-limited to 3 wake-ups/60s with 1→2→5→60→300s backoff. **Root-cause of the C-L/C-M loss: `(no output yet)` from `task_output` describes the delivery channel, not the child's work — cancelling a live child discards work it already completed.** |
| 2026-10-13 | **Report 09 added — permission modes & workspace confinement** (extends a Done target; both questions answered from fresh extraction, not memory). **Modes** (`src-CP7XXlpZ.js` @24098): `read-only`=`:read-only`+`on-request` · **`auto`**=`:workspace`+`workspace-write`+`on-request` · **`granular`**=same sandbox + a 5-field policy object where **`sandbox_approval:false`** (the sandbox *blocks*, it never asks) but `mcp_elicitations:true` · **full access**=`:danger-full-access`+`never`. **The default is read-only** (`Qn` @26649). **Confinement:** `writableRoots` is **replaced** with `[userFolder]` not appended (@886666); a configured root of `/` is **refused**; containment uses `{directory,boundary}` pairs with **outside → throw** and **`followSymlinks:false`** (main @3232214); projectless+workspaceWrite+no root → demoted. Native: Windows **restricted token** + per-root **capability SIDs** (`workspace-write sandbox has no writable root capability SIDs`), `networkAccess:false` by default, AppContainer fallback. Three managed-requirements fallbacks, **all toward read-only**; no string describes a fallback upward. **2 new findings: F8 (exec-policy `acceptWithExecpolicyAmendment` widens GLOBALLY and drops the cwd constraint; native string: *"exec-policy allow behavior (including any sandbox bypass) takes precedence"*) and F9 (fail-closed by default, positive).** |

| 2026-10-13 | **Reports 10 + 11 added — orchestration and the voice pipeline** (extends a Done target). **Report 10:** the orb is a *presentation layer*, not an agent process (`avatar-overlay-*` events, `OrbPhysics`, `throwWithVelocity`, edge-stashing `quickChat`); queueing is an explicit `followUpQueueMode` ∈ {`queue`,`send-now`} with per-message `{conversationId,messageId,lockId}` send locks and a follower priority table where `edit-last-user-turn` (2) outranks every approval and queue op (1); **on the `.md` question — three mechanisms, none of them a to-do list:** `AGENTS.md` (written `mode:292` = `0o444` read-only, created empty if missing, plus an unchecked sibling `AGENTS.override.md`), `automations/<id>/memory.md` (the literal shipped instruction *"use the memory file … to avoid repeating recent work"*, copied on duplicate), and server-side `memories.{version,dual_write,generate_memories,use_memories}` config keys. **`TODO.md`/`tasks.md`/`MEMORY.md` = 0.** Routing is explicit, not implicit: `steeringUserMessage` carries **`targetTurnId` + `targetTurnStartedAtMs`** (a race guard — `Interrupted before the steer was accepted.`), and outbound text is re-chunked through `chunkedMessageSender` with a separate `sendCritical` lane. |
| 2026-10-13 | **Report 11 — voice pipeline, and two corrections.** **C-P:** the renderer-wide voice census was **82% translation text** — splitting the 258 locale bundles (227,096,998 B, 184,642,514 chars) out of 14,782 gives code-only `voice` **2,901**/162 files (not 15,854/293), `dictation` **957**/46, `microphone` **623**/39. **C-Q:** two independent scans disagreed on `AudioContext` (51 vs 24); resolved per file to exactly **27 case-flag extras** (lowercase `"audiocontext"` option strings, 15 in `app-initial`, 8 in `mathlive.min`) — **24 is the API-use figure**. **Two separate voice systems:** global *dictation* (macOS-only, accessibility-API keystroke injection, WebSocket `/dictation/stream` with `chatgpt-dictation` subprotocol + `openai-bearer.<token>`, status **432**, workspace accounts explicitly refused) vs *realtime voice* (**WebRTC `RTCDepPeerConnection` straight to `chatgpt.com`, `RTCRtpScriptTransform` both directions, ECDSA P-256 cert persistence, `gpt-4o`, `/realtime/status`**). **No local STT and no local LLM:** `SpeechRecognition` = 0, and **zero ML model files in 20,980** (no `.onnx/.ort/.tflite/.gguf/.safetensors/.bin`); the 34 `.wasm` are orb-character, .NET/Blazor, and LVGL — none an ML runtime. The one local model, **Silero VAD via ONNX Runtime Web**, is *fetched at runtime* and SHA-256 verified, failing closed. **TTS:** no engine for the orb; `SpeechSynthesisUtterance` (2, 1 file) is entirely `mathlive.min`. **New medium findings: F14 (voice media bypasses the main process — RTP never touches the fetch interceptor or IPC allowlist) and F15 (`chatgpt-staging.com` co-located with `chatgpt.com` in the same voice module).** Positive: F18 explicit `Microphone is owned by dictation` arbitration, F19 autoplay respected. **F20 answers the user's routing question directly — the orb *delegates*: `realtimeVoice.taskCreated/taskReturned/taskUpdate.{running,completed,interrupted,failed,stopped}` with `to-task`/`from-task` routing and handoff targets {`global-overlay`,`main-thread`,`in-window`}.** |
| 2026-10-13 | **Codex corrections ledger now runs C-A…C-Q (17 corrections); findings F1–F20.** Report file count 8 → **11**. Two *independent* renderer scans were run and cross-checked (13-pass `match()` vs single-pass `exec()` loop); where they disagreed the disagreement was **reconciled per file rather than averaged** — that is what surfaced C-Q. The local-model question was settled by **extension inventory, not keyword search**: every ML-container extension in the tree is 0, which is a stronger negative than `whisper`-keyword absence. |

### Codex Desktop — findings so far

| # | Finding | Status |
|---|---|---|
| X-1 | **No Electron fuse wire anywhere in the package** (0 valid wires over 34 PE/`.node` candidates; the one sentinel hit is an error-message substring), despite declaring `@electron/fuses ^1.8.0`. Claude had 9 fuses decoded | Confirmed negative; **consequence unresolved — largest open item** |
| X-2 | 8 native binaries incl. the whole **node-pty stack** (`pty.node`, `winpty.dll`, `winpty-agent.exe`) live in `app.asar.unpacked/`, outside the ASAR integrity boundary | Confirmed; low — mitigated by MSIX ACL + Store signature |
| X-3 | Update path **swallows `0x80073D28`** from `stagePackage` and still records `update-ready`; `allowServiceInstallElevation` hardcoded `!0` at all 3 sites | Code path confirmed byte-exact; **impact pending native confirmation**; HRESULT name unverified |
| X-4 | Browser-webview hardening fn `cU` sets **`devTools:!0` unconditionally** for agent-navigated content, though it hardens everything else correctly and the devtools *menu* is internal-only | Confirmed; low — local/gesture-gated |
| X-5 | **An unprivileged renderer cannot reach `elevation_service.exe`** — 0 refs / 14,816 JS files, attacked 3 ways; the service is launched by the Chromium browser process | Confirmed negative, scope stated, controls calibrated |
| X-6 | One publisher key shared by all 10 bundled plugins (identical `public-key.der` SHA-256) | Confirmed; informational — normal for a first-party bundle |
| X-7 | **Windows sandbox setup fails CLOSED** — 20-min timeout rejects, 5-min same-mode cooldown, wrong-mode completions dropped, automation narrowing throws. **Opposite of Typeless's fail-open `--no-sandbox`** | Confirmed, read in full |
| X-8 | IPC is a **24-registration allowlist with 3-layer sender validation**, not a raw passthrough; approval gate lives in the native Rust app-server | Confirmed |

### Claude Desktop — findings so far

| # | Finding | Status |
|---|---|---|
| C-D1 | `nodeIntegration:!1` ×17 and `contextIsolation:!0` ×17, **one distinct form each** — no window anywhere flips either | Confirmed |
| C-D2 | Electron fuses read from `claude.exe` at offset `0xbe244b8`: `RunAsNode`, `NODE_OPTIONS` and `--inspect` all disabled; cookie encryption, ASAR integrity validation and `OnlyLoadAppFromAsar` all enabled | Confirmed (fuse naming for the 2 unnamed bytes is inferred) |
| C-D3 | IPC is a **17-channel allowlist**, not a passthrough. Contrast Typeless's raw `on`/`send`/`invoke` | Confirmed |
| C-D4 | `localExecConsent` carries real sender validation: top-frame check, build-state-matched origin, `Set`-validated enum payload | Confirmed — read in full |
| C-D5 | **Consent dialogs are skipped entirely when the deployment mode is `3p`** (third-party inference provider). `decision:"allowed"` is returned without a prompt | Confirmed as behaviour; **impact open** |
| C-D6 | The `apply` consent kind is non-modal, does not take focus, and has `timeoutMs: Infinity` | Confirmed — UX weakness, not a bypass |
| C-D7 | `nodeIntegrationInSubFrames: this.isClaudePage` looks dangerous but is **inert** — `nodeIntegration:!1` and `sandbox:!0` in the same object literal | Confirmed against Electron docs |

### Claude Desktop — IPC/sandbox/native findings (this pass)

| # | Finding | Status |
|---|---|---|
| C-D8 | The prior run's "0 literal `ipcMain.handle` channels / 8 orphans" was a **method artifact**: channels are composed at runtime by the `@ant/ipc-codegen` factory `ao(PREFIX,"Iface",GUARD,{methods,events})` | Confirmed |
| C-D9 | **1,294** handler channels from **94** `ao()` sites; **1,384** preload-referenced; **1,294 matched**; **0** orphaned handlers either way | Confirmed after correction C-D |
| C-D10 | **NEW — the `electron_window` guard fails OPEN.** `Yjr` returns `true` for every sender when `__ELECTRON_WINDOW_ALLOWED_ORIGINS__` is undefined; it is never assigned in the JS corpus and has **0 occurrences** in `claude.exe` (246 MB), calibrated against `__dirname`=34 / `__filename`=32 | **Confirmed finding, medium** — see F1a |
| C-D11 | 4 of 16 guards (`Ixe`,`PMr`,`vTi`,`nba`) check **only** the top frame, no origin — 57 channels (4.4%) across 8 auxiliary-window interfaces | Confirmed |
| C-D12 | `sandbox: true` in **all 16** sites, `sandbox: false` in **0**; no `--no-sandbox` anywhere | Confirmed |
| C-D13 | `cowork-svc.exe` is **Go 1.25.14** (not Rust), module `cowork-win32-service`, a SYSTEM service hosting a Hyper-V VM via gVisor, pipe `\\.\pipe\cowork-vm-service`, dispatch gated by `dispatchVerified` / HMAC-SHA2-256 | Confirmed |
| C-D14 | The app never spawns the service: **0** `cowork-svc` literals in JS; it calls SCM `StartService` and **fails closed** with backoff on `denied` | Confirmed |
| C-D15 | **Two** SSH stacks exist: the native broker delegates to system OpenSSH (≥9.4 floor), and `ssh2` in `index.chunk-CATyehLt.js` implements its own `known_hosts` parser | Confirmed — corrects an earlier over-claim |
| C-D16 | All 6 examined binaries Authenticode-**Valid** (`CN="Anthropic, PBC"`), DigiCert chain, countersigned; 9/9 Electron fuses decoded | Confirmed |
| C-D17 | `claude-ssh-askpass.exe` and `claude-ssh-proxy.exe` are MSIX `Windows.FullTrustApplication` entry points — no AppContainer | Confirmed |
| C-D18 | Pipe **HMAC key derivation** remains unproven statically | **Open** — highest-value follow-up |

**Adversarial second pass: verdict PARTIAL.** An independent verifier attacked 10 headline
claims and returned 6 confirmed, 2 refuted, 2 inflated, 1 new finding. Every refuted claim was
re-verified by me before acceptance (G8). **9 corrections** (C-A…C-I) are preserved visibly in
the individual reports and in `verification-brief.md`.

### Claude Desktop — deliverables

`claude/reports/`: `01-artifact-manifest.md`, `02-ipc-surface.md`, `03-sandbox-boundary.md`,
`04-native-and-elevation.md`, `05-update-and-signing.md`, `06-findings.md`,
`07-consent-gate-and-3p-bypass.md` (carried forward from the prior pass, renumbered),
`verification-brief.md`. All 8 definition-of-done items satisfied.

### Claude Desktop — remaining open questions

- Can a 3p deployment introduce an MCP connector the administrator never configured?
  (highest-priority policy question — C-D5 / F11)
- Does `Rya`/`$A` independently constrain the `Yjr` fail-open? Would decide F1a severity.
- Pipe HMAC key derivation (C-D18).
- Guest VM default network adapter (NAT vs isolated).
- `autoUpdater` feed URL + `verifyUpdateCodeSignature`; CSP policy **contents**.