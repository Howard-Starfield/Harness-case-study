# Codex 26.1007 — Report 06: Findings & Corrections Ledger

Every finding below states its own scope and its own confidence. Findings that rest on a negative
result carry their calibration. Findings that depend on unreadable native code are marked
**pending native confirmation** and are not presented as exploits.

---

## 6.1 Findings

### F1 — No Electron fuse wire exists anywhere in the Codex package
**Severity: medium** (largest gap vs the Claude Desktop control) · **Confidence: high on the negative,
explicitly unresolved on the consequence**

The `@electron/fuses` sentinel `dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX` occurs **exactly once** in the
package (`chrome.dll` @ `0x10e22af0`), and the bytes preceding it are **not** a v1 fuse wire
(`uint32 = 1917811060`, `uint32 = 6646084`). A sweep of 34 PE/`.node` candidates found
**0 valid fuse wires**.

Claude Desktop, the control in this same study, has 9 fuses read directly from `claude.exe`:
`RunAsNode`, `EnableNodeOptionsEnvironmentVariable` and `EnableNodeCliInspectArguments` all disabled;
`EnableCookieEncryption`, `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar` all
enabled. Codex has no equivalent, **despite declaring `@electron/fuses ^1.8.0` as a dependency**.

**What is NOT claimed:** that `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` or `--inspect` are actually
honoured, or that ASAR integrity validation is off. The `ValidateIntegrityOrDie` code path is present
and compiled in, and `app.asar.unpacked/` exists as a directory. This Chromium-based "owl" shell may
enforce these by another route. Resolving it needs disassembly of `chrome.dll` or a runtime probe,
and **runtime probing is out of scope under the static-only rule**. Carried as the target's largest
residual unknown. Evidence: `evidence/round7.js`, `round8.js`, `round9.js` → `fuse-hunt.txt`.

### F2 — Native code, including the PTY stack, lives outside the ASAR integrity boundary
**Severity: low** (mitigated by MSIX ACL + Store signature) · **Confidence: high**

Eight executables are in `app.asar.unpacked/`, not in the `app.asar` payload:
`pty.node`, `conpty.node`, `conpty_console_list.node`, `winpty.dll`, `winpty-agent.exe`,
`better_sqlite3.node`, `bindings.node` (`@serialport`), `HID.node`.

The first five are the pseudoterminal stack behind every terminal command the agent runs. Any
integrity validation scoped to the ASAR container does not cover them.

**Mitigation, stated explicitly:** these files live under `C:\Program Files\WindowsApps` in an MSIX
package whose `SignatureKind` is `Store` and whose `Status` is `Ok`. A standard user cannot write
there. Reaching them requires Administrator rights or a Store-signing compromise — either of which
already wins. The finding's value is architectural: it names exactly where an ASAR-scoped control
would stop applying. Its practical severity is low.

### F3 — The update-staging path swallows an elevation HRESULT and records success
**Severity: medium** · **Confidence: high on the code path, pending native confirmation on impact**

```js
try { await this.options.nativeAddon.stagePackage(a.packagePath) }
catch (e) {
  if (!this.options.allowServiceInstallElevation || !(e instanceof Error)
      || !(`hresult` in e) || e.hresult !== 2147958056)
    throw await this.discardPreparedUpdate(), e
}
… await writeFile(stageState); return `update-ready`
```

`2147958056` = **`0x80073D28`** (facility 7, severity 1, win32 code `0x3D28`). On that exact HRESULT,
with elevation allowed, the error is **discarded** and staging is recorded as successful.

`allowServiceInstallElevation` is **hardcoded `!0` at all three** updater construction sites — no
setting, no build-flavor gate. The JS entry point is sender-gated
(`isTrustedIpcEvent`) and the install path re-checks `options.allowed()`.

**Not claimed:** exploitability. `stagePackage` lives in `native/windows-updater.node` and its
behaviour on this HRESULT is not statically readable; whether the package ends up correctly staged,
partially staged, or not staged determines the real impact.

**The HRESULT name is unverified.** Windows SDK headers are only partially installed on this machine
(`Windows Kits\10\Include` exists; `winerror.h` does not) and a web lookup failed. `0x80073D28` is
reported **as a hex value only** — no error name is attached.

**Contrast:** Claude Desktop's equivalent path **fails closed** (non-matching error → discard staged
update and rethrow). Codex's is deliberately tolerant.

### F4 — Browser-webview hardening enables DevTools unconditionally
**Severity: low** · **Confidence: high on the code, low on exploitability**

```js
function cU(e,t){
  delete e.allowpopups; delete e.disablewebsecurity; delete e.webpreferences;
  t.sandbox=!0; t.devTools=!0;                       // ← the one weakening value
  t.nodeIntegration=!1; t.nodeIntegrationInSubFrames=!1; t.nodeIntegrationInWorker=!1;
  t.contextIsolation=!0; t.webSecurity=!0; t.allowRunningInsecureContent=!1;
  t.webviewTag=!1; t.plugins=!1; Object.assign(t,{disablePopups:!0})
}
```

`cU` hardens the agent-navigated browser webview aggressively — including force-setting
`nodeIntegration:false` in sub-frames and workers and **deleting** `disablewebsecurity` from
caller-supplied options. `devTools=!0` is the single value that cuts against the function's evident
intent, and it applies to windows rendering arbitrary web content chosen by the agent.

`allowDevtools(e){ return isInternal(e) }` gates the devtools **menu** to internal builds, but that
does not touch the `webPreferences.devTools` value, which is set regardless of flavor.

**Severity is low** because DevTools is a local, gesture-gated developer tool; nothing in the corpus
shows a renderer can open it without a user action.

### F5 — An unprivileged renderer cannot reach `elevation_service.exe`
**Severity: none — this is a negative security result** · **Confidence: high, with stated scope**

`elevation_service` occurs **0** times across the **14,816-file** JS corpus (MAIN 34 files /
10,333,165 B + RENDER 14,782 files / 383,489,825 B). `ShellExecuteEx` = 0. `sandbox-service` = 0.
All MAIN `elevat` hits are the auto-update flag, a telemetry field, the sandbox mode enumeration, or
the browser-import option — none is a renderer→elevation path (itemised in report 02 §2.6).

**Scope of this negative:** raw-text literal search over `.js`/`.mjs`, excluding locale `.json` and
excluding the native binaries' own string tables (which *do* contain the service name). Positive
control needles (`__dirname`, `ipcRenderer`) returned > 0 in the same sweep. Two raw counts in this
area were false positives and were corrected — see C-B and C-C.

`elevation_service.exe` is invoked by the Chromium browser process, outside vendor code and outside
JS reach. Full boundary map in report 03.

### F6 — One publisher key shared by all ten bundled plugins
**Severity: informational** · **Confidence: high**

All ten `public-key.der` files in `plugin-signatures/openai-bundled/` share SHA-256 `1be9c028…`
(294 B each), alongside `plugin.signature.json` (523 B), `plugin.tar.gz` and a `receipt.json`.

Normal for a first-party bundle. Recorded because the question worth revisiting is what happens when
the same root signs **user-installable** plugins — vendor and third-party trust would collapse into
one identity. No evidence that happens; no third-party plugin path was found or tested.

### F8 — An exec-policy approval can widen scope globally and take precedence over the sandbox
**Severity: medium** · **Confidence: high on the code path, impact pending disassembly** (report 09 §9.7)

`src-BJv5Mk7n.js` @1176833 — two distinct "remember this" decisions:

| Decision | Effect |
|---|---|
| `acceptForSession` / `scope === "session"` | thread-scoped: `widenedThreadIds.add(t)`, `widen(t)` |
| `acceptWithExecpolicyAmendment` / `approved_execpolicy_amendment` | **persistent + global**: `hasPersistentExecpolicyApproval = true`, `widen()` **with no argument** |

Consequence at @1175214 — once widened, the recorded `cwds` becomes **`null`** instead of the
thread's working directory, dropping the cwd constraint for later commands. The native side states
the precedence outright: *"command already matches an exec-policy allow rule, the command can be
auto-approved without an extra prompt. In that case, exec-policy allow behavior (**including any
sandbox bypass**) takes pre[cedence]…"*

**Assessment.** The mechanism is deliberate, not accidental — it requires an explicit amendment
decision, and a narrower thread-scoped alternative exists as the ordinary path. What is worth
flagging is that the two options are **not equally prominent**, and the global one is what persists.
Native strings confirm it is written to disk: `failed to persist network policy amendment to
execpolicy`, `failed to update runtime allowlist` / `denylist`.

**Not claimed:** whether the UI surfaces the distinction clearly, or what an amendment's scope
actually contains. Carried as R11/R12.

### F9 — Confinement defaults are fail-closed at every layer (positive result)
**Severity: none — positive** · **Confidence: high** (report 09)

Every ambiguous or malformed state resolves to a *more restrictive* policy:

- absent `sandbox_mode` → **read-only** (`Qn`, `src-CP7XXlpZ.js` @26649)
- configured root of `/` → refused as a writable root (`src` @886666)
- `writableRoots` is **replaced** with `[userFolder]`, never appended to
- projectless + `workspaceWrite` + no explicit root → demoted to default policy (`bw`)
- automation with no compatible permission set → **throws**
- managed-requirements conflicts → three separate fallbacks, **all toward read-only**
- `networkAccess` defaults to `false`

No string in the binary describes a fallback **upward**. F8 is the single exception, and it requires
an explicit user decision.

### F7 — Windows sandbox setup fails **closed**
**Severity: none — positive result** · **Confidence: high**

Setup timeout `lo=12e5` (20 min) calls `r.fail(Error(co))`, which **rejects** the promise. There is
no branch resolving success on failure. A 5-minute cooldown (`uo=3e5`) then refuses the same mode.
Wrong-mode and unsolicited completions are logged and dropped. Automation permission narrowing
throws `No compatible automation permissions satisfy the managed requirements` rather than falling
back.

This is the direct answer to the queue's question, and it is the **opposite** of the Typeless
GPU-crash handler, which failed open to `--no-sandbox`. Full state machine in report 03 §3.5.

## 6.2 Corrections ledger

Every correction is preserved rather than silently fixed (rule G8). Three of these are corrections to
*this study's own* earlier work, not to the queue.

| ID | What was claimed | What is actually true | Why it went wrong |
|---|---|---|---|
| **C-A** | Renderer corpus = "20,119 `.js`/`.mjs` files, 545,939,185 B" (this study's own earlier note) | **14,782** files / 383,489,825 B. 20,119 counted *all* files under `webview/` regardless of extension | Conflated an all-files count with a JavaScript count. `webview/assets` alone is 19,961 files / 540,845,826 B of mixed content |
| **C-B** | `runas` = 7 occurrences in MAIN | **0** as an elevation verb | Every hit is the substring inside `runAsync` in a migration table. Same hazard applies to the RENDER figure of 131, which must not be quoted without disambiguation |
| **C-C** | Renderer `elevator` = 1 occurrence | **0** as an elevation reference | It is an emoji shortcode table: ``{n:[`lift`,`hoist`,`elevator`,`accessibility`],u:`1f6d7`,a:`13`}`` at `browser-e8c5f9aed22b.js` @167390 |
| **C-D** | IPC shapes: 34, 34, 34, 34, 34, 34 | `handle` 7, `on` 17, `handleOnce` 0, `removeHandler` 1, `removeAllListeners` 0, `webContents.send` 1 | The census counter incremented once per **file** per shape instead of counting matches. All six shapes shared the same 34 MAIN files, so the uniform value was the tell |
| **C-E** | "0 native `.node` modules in the extracted tree" | 6 `.node` + `winpty.dll` + `winpty-agent.exe`, all in `app.asar.unpacked/` | ASAR marks them `unpacked`, so their bytes are not in the `app.asar` payload and a payload-only extraction cannot produce them |
| **C-F** | 3 binaries return Authenticode `UnknownError` | They are **Linux x86-64 ELF** binaries (magic `7f454c46`, `ET_DYN`, x86-64) shipped as WSL companions — **not unsigned Windows binaries** | `Get-AuthenticodeSignature` on a non-PE file is a parser outcome, not a signing outcome. Would have produced a false "3 unsigned binaries" claim |
| **C-G** | Fuse sentinel absent from `ChatGPT.exe` and `Codex.exe` | The sentinel is in **`chrome.dll`** @ `0x10e22af0` | This package does not put the Electron runtime in the exe — it is a Chromium-based "owl" shell. A calibration sweep with `Electron`/`Chrome/`/`node::`/`v8::` control markers located it |
| **C-H** | Sentinel at `0x10e22af0` is the fuse wire | It is a **substring of an error-message string**: `"…ing algorithm in ValidateIntegrityOrDie"` + `\0` + sentinel. Preceding `uint32`s are `1917811060` / `6646084` | A bare sentinel occurrence is not proof of a wire. Version and length must be validated before claiming. Result: **0 valid wires package-wide** |
| **C-I** | Queue's Codex artifact map lists the privileged binaries | It **omits `codex-windows-sandbox-service.exe`** (55,824,688 B, Rust, 141 `.rs` sources) | Prior map was built before the file was enumerated. Re-derived from the artifact rather than trusted |
| **C-J** | One version identity | Two: MSIX `26.1007.2314.0`, in-app `26.1007.21434` (`package.json` **and** `owl-app.ini` agree) | Not a formatting difference — the numbers do not correspond. Update-identity comparisons must state which scheme |
| **C-K** | `elevation_service.exe` is a Codex/OpenAI binary that might be reachable | **Upstream Chromium C++** (`chrome/elevation/{caller_validation,elevator,elevated_recovery_impl,elevation_service_delegate}.cc`), zero OpenAI source paths, signed by OpenAI only because MSIX signs everything it ships | Prior framing treated shipped-binary provenance as authorship. Re-derived from embedded source paths |
| **C-L** | `allowServiceInstallElevation` is hardcoded `!0` at **3** construction sites | **2** construction sites (@51513 MSIX-fallback updater, @51788 non-x64/arm64 updater) + 2 reads (@21465, @24399) | 4 total mentions were counted as 3 construction sites. **Conclusion unaffected** — still always true, never user-configurable. Found by the re-verification subagent |
| **C-M** | Report 05 covers "every PE binary in the package" | **CLOSED — and stronger than either party's guess.** Package-wide **magic-byte** enumeration finds **60 PE files: 60 Valid, 0 NotSigned, 0 Unknown** (59 OpenAI thumbprint `0C6C3CA9…`, 1 Microsoft `d3dcompiler_47.dll`). The report's original hardcoded list was **15**; the cancelled verifier guessed **92**; 40 is the count under `app\` alone | The signing script used a **hardcoded file list** and the prose generalised it to "every PE binary". Closed by `evidence/signing-all-pe.ps1` → `signing-all-pe.txt`. **Also downgrades the subagent's "Microsoft-signed binary in an OpenAI MSIX" alarm to a non-finding** — Microsoft redistributables in a Chromium app dir are normal, and OpenAI correctly does not re-sign them |
| **C-N** | The cancelled verifier logged `runas` = **121** where report 02 states **131** | **Neither was wrong — a regex flag difference.** Re-measured: `/runas/g` (case-sensitive) = 121 RENDER; `/runas/gi` (case-insensitive) = 131 RENDER. Defensible figure remains **word-bounded case-insensitive `/\brunas\b/gi` = 5**, all non-elevation | Not a counting error but a method-reporting gap: the report quoted 131 without stating the flag. 116 of the 121 are the Latvian word for *run* in `lv-LV` strings ("Runas terapija", "Runas burbulis"); `is-IS` adds `runasamskip`/`runaspjall`; `bat-54ba94408a32.js` adds one entry in a Windows command-vocabulary list. **Elevation-verb `runas` corpus-wide: 0** |
| **C-P** | Renderer-wide voice census quoted raw totals — `voice` **15,854** / 293 files, `dictation` **4,579** / 109 files, `microphone` **3,082** / 102 files | **82% of every one of those totals is translation text.** Splitting the renderer by filename (`/^[a-z]{2,3}(-[A-Za-z]{2,4})?-[0-9a-f]{8,}\.js$/i` → 258 locale bundles, 227,096,998 B, 184,642,514 chars) gives code-only: `voice` **2,901** / 162 files, `dictation` **957** / 46, `microphone` **623** / 39 | The renderer ships 258 translation bundles that outnumber code 1:58 in bytes. Locale bundles were never separated from code. **Rule adopted: no renderer-wide count is quoted without the code/locale split.** Evidence `evidence/voice-render4.txt` |
| **C-Q** | Two independent renderer scans disagreed on `AudioContext`: **51** vs **24** | **24 is correct.** The `i`-flagged regex additionally matches lowercase `"audiocontext"` — an option-string key, not an API call site. Reconciled per file: exactly **27** case-insensitive-only extras, 15 in `app-initial` and 8 in `mathlive.min` (which exposes a config key of that name) | Neither scan was wrong *for its own regex*; neither stated its flag, so the pair looked like a contradiction. Resolved by measuring the case-only delta rather than picking a side. Evidence `evidence/voice-render4.txt` |

**How C-L and C-M entered the record.** Both were found by the `verifier` subagent dispatched to
adversarially attack these reports. That subagent was **cancelled before it could report back** — the
parent read `(no output yet)` from `task_output` repeatedly, concluded the child was stalled, and
stopped it. Its work survived on disk at
`~/.minimax/background-tasks/bg_6ab5ccf0-b288-474c-971f-1351bd9d1dff/summary.txt` and was recovered
there. The two refutations above were then **independently re-verified by the parent** before being
recorded here. Full recovered log: `harness/recovered-verifier-log.txt`.

**What the cancelled subagent corroborated** (its work was genuinely valuable, not merely
contradictory): corpus arithmetic exact; `elevation_service` = 0 across **20,153 files / 556 MB** —
a broader corpus than the parent's, including 912 files the `.js/.mjs` sweep excluded; the emoji-table
explanation for the single renderer `elevator` hit, at offset 167390; the IPC census, with the
apparent extra hits traced to `sendInputEvent`/`sendSync` substrings and **no hidden `ipcMain`
aliasing**; and F1 **confirmed and hardened** — it tested both pre- and post-sentinel fuse layouts
across 94 PE binaries / 2.32 GB, against the parent's 34.

## 6.3 What was deliberately not claimed

- **No exploitability claim for F3.** The HRESULT name is unverified and the native behaviour is
  unreadable.
- **No claim that F1's absent fuses mean absent protections.** The `ValidateIntegrityOrDie` path
  exists; enforcement by another route is plausible and untested.
- **No claim about the `elevator-allow-untrusted-*-for-testing` switches** shipped in
  `elevation_service.exe`. The strings exist; whether the gate that neutralises them is compiled in
  is not readable statically.
- **No claim about the Typeless column** in report 07 — that is a carried queue claim, re-stated and
  explicitly marked as untested by this run.
- **No claim about the SSH surface**, despite `ssh-config ^5.2.0` being a dependency. Target 1 found
  a second in-tree SSH stack in Claude; whether Codex has one is unexamined.

## 6.4 Severity summary

| ID | Severity | Status |
|---|---|---|
| F1 no fuse wire | medium | Confirmed negative; consequence unresolved — largest open item. Cancelled subagent independently hardened it (94 PE binaries / 2.32 GB, both wire layouts) |
| F2 natives outside ASAR | low | Confirmed; mitigated by MSIX ACL + Store signature |
| F3 tolerated update HRESULT | medium | Code path confirmed byte-exact; impact pending native confirmation. **C-L corrects the site count** |
| F4 devTools on browser webview | low | Confirmed; local/gesture-gated, not remotely reachable |
| F5 renderer cannot reach elevation | none | Confirmed negative, scope stated, controls calibrated |
| F6 shared plugin key | informational | Confirmed; architectural note |
| F7 sandbox fails closed | none | Confirmed positive |
| **F8 exec-policy widening** | **medium** | **New** — a global "remember forever" approval drops the cwd constraint and can take precedence over the sandbox; report 09 §9.7 |
| **F9 confinement is fail-closed** | **none** | **New, positive** — every ambiguous state resolves to a *more* restrictive policy; report 09 |
| **F10 `AGENTS.md` written read-only** | low | **New** — `mode: 292` (`0o444`); users cannot correct generated project instructions in place. Report 10 §4.1 |
| **F11 queue mode fails open** | low | **New** — any `followUpQueueMode` value other than the exact string `queue` results in `send-now`. Report 10 §5 |
| **F12 `AGENTS.override.md` unchecked** | informational | **New** — sibling-file override of the project instruction set, read with a `hasOverride` flag and no validation. Report 10 §4.1 |
| **F13 send locks are in-process only** | informational | **New** — `tryAcquire` keyed by `{conversationId,messageId,lockId}`; no multi-process protection evidenced. Report 10 §5 |
| **F14 voice media bypasses the app-server** | **medium** | **New** — the renderer opens a WebRTC PeerConnection to `chatgpt.com`; RTP audio never traverses the main process, so fetch interception, the IPC allowlist, and thread send-locks do not govern it. Mitigated by OS mic gating and `getBackendRequestAuth`. Report 11 §4.3 |
| **F15 staging endpoint co-located** | **medium** | **New** — `https://chatgpt-staging.com` sits beside `https://chatgpt.com` in the same voice-transport module; a config/build flip could route live microphone audio to staging. Reachability not established. Report 11 §4.2 |
| **F16 Silero VAD fetched, not bundled** | low | **New** — no model file exists in the package; integrity rests on a single client-side SHA-256 comparison. Fails closed (`browserVoice.sileroVadUnavailable`). Report 11 §3.1 |
| **F17 dictation simulates keystrokes** | informational | **New** — macOS accessibility API, gated by explicit OS permission with a settings deep-link. Report 11 §2.1 |
| **F18 explicit microphone arbitration** | none | **New, positive** — `Microphone is owned by dictation`; single-owner capture, no contention between dictation and realtime voice. Report 11 §5 |
| **F19 autoplay policy respected** | none | **New, positive** — `chatgpt.voice.assistant_audio_playback_blocked.toast`. Report 11 §8 |
| **F20 voice delegates rather than self-executes** | informational | **New** — cross-task routing is first-class (`to-task`/`from-task`, `taskUpdate.{running,completed,interrupted,failed,stopped}`); the orb renders the delegate's live status. Report 11 §6.3 |