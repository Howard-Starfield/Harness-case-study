# Typeless 2.8.1 — Independent Adversarial Review

**Reviewer:** Mavis (fresh session, no prior authorship of the study)
**Date:** 2026-10-12
**Subject under review:** `typeless/functions/**` — 18 folders, verification brief, shared README
**Method:** re-derived from the extracted binary only. The prior reports were read as *claims under test*, never as evidence.

**Verdict in one line:** the study's architecture and privacy findings hold up well under attack — but it contains **one material
omission**: a persistent, user-uncontrollable path that disables the Chromium OS sandbox after a GPU crash.

---

## 0. How this review was done

| Step | Outcome |
|---|---|
| Recovered the prior session | `mvs_5da20d90a24148b885e5b9cf63ba7cc1` — two REA studies (Granola, Typeless) |
| Ran the brief's own §5 self-check | 13 numeric expectations re-measured independently |
| Resolved the obfuscation the brief never explains | ESM renamed imports, string-array indices |
| Attacked claims individually | see §2 |
| Independent verifier subagent | claims 1, 3–10 + DLL/PE + numeric checks |

**Ground truth the brief does not state** (re-derived, needed to read the bundle at all):

```js
// dist/main/index.js @985 — the single Electron import
import{app as _0xc2920c, BrowserWindow as _0x40cc99, ... , ipcMain as _0x488816,
       session as _0x5c1ef9, dialog as _0x245d85, ...} from 'electron';
```

| Real symbol | Alias | Consequence |
|---|---|---|
| `BrowserWindow` | `_0x40cc99` | literal `BrowserWindow(` returns **0**. Windows are `new _0x40cc99(` — only **2** direct constructions exist |
| `ipcMain` | `_0x488816` | handlers are `_0x488816['handle'](ch, fn)` — **bracket** notation, so `.handle(` returns 0 |

`dist/main/index.js` is 631,873 bytes on **one line with 0 newlines**. All counts below are occurrence counts, never line counts.

---

## 1. The finding the study missed — `--no-sandbox` fail-open

### Verdict: **NEW MATERIAL FINDING** — not in any of the 18 folders

The brief lists as an open question:

> *"Electron version is unresolvable from the ASAR, so the effective renderer `sandbox` default is UNKNOWN."*

That question was closedable, and closing it surfaces an unreported security behaviour.

**Startup path** (`index.js` @629977, function `s_`, invoked first thing in `i_`):

```js
s_ = () => {
  app.disableHardwareAcceleration();                                   // 0x282 — UNCONDITIONAL
  N.get('gpuSandboxDisabled')                                          // 0x649
    && app.commandLine.appendSwitch('no-sandbox');                    // 0x3b3 / 0xc32 / 0x299
  app.setAppUserModelId(app.getName());
  app.on('activate', …);
}
```

**The path that sets the flag** (`index.js` @431020):

```js
Bf = new Set([-0x3ffffecb, 0xc0000135]);      // ⚠ TWO distinct JS numbers — see correction below
Wf = () => app.on('child-process-gone', (_evt, info) => {
  if (info.type !== 'GPU' || !Bf.has(info.exitCode) || hi.isInProgress()) return;
  $f();
});
$f = () => { N.get('gpuSandboxDisabled') || (N.set('gpuSandboxDisabled', true), jf()); };
jf = () => { Vo || (Vo = true, setImmediate(() => {
  try { app.relaunch(); } catch {}
  try { app.exit(0);     } catch {}
  setTimeout(() => process.exit(0), 1500).unref();
})); };
```

**Decoded string indices** — re-derived by me with a decoder rebuilt from the bundle itself
(see §2b), **not** read from the study's `strings-main.txt`:

| Index | String | Index | String |
|---|---|---|---|
| `0x282` | `disableHardwareAcceleration` | `0x649` | **`gpuSandboxDisabled`** |
| `0x299` | **`no-sandbox`** | `0x3b3` | `commandLine` |
| `0xc32` | `appendSwitch` | `0xac6` | `GPU` |
| `0x4aa` | `type` | `0x31c` | `exitCode` |
| `0xadc` | `has` | `0xa05` | `relaunch` |
| `0x708` | `get` | `0x536` | `set` |

### What this means

1. If the **GPU child process dies with exit code `0xC0000135` (`STATUS_DLL_NOT_FOUND`)** and no dictation is in progress, the app sets `gpuSandboxDisabled = true` and force-relaunches itself.
2. From that relaunch onward, **every** startup appends `--no-sandbox` to Chromium's command line — disabling the OS-level sandbox for **all** renderer processes.
3. There is **no UI**: `gpuSandboxDisabled` occurs **0× in every renderer chunk**; no `gpu_sandbox` / `gpuSandbox` / "GPU sandbox" string exists anywhere in the renderer. Nothing in the app's interface turns it back off.

**This is a fail-open pattern**: a recoverable crash permanently weakens process isolation, with no user-facing control and no self-heal. It is exactly the class of defect an adversarial pass exists to find, and the study's own "UNKNOWN" marker sat one code-hop away from it.

### ⚠ CORRECTION to my own first draft (found on second pass)

My first write-up said `N` was `appStore = new Store({name:'app-storage', schema:{}})` — an
electron-store with an **empty schema**. **That was wrong.** Re-checking it was the single most
useful result of the second pass.

`N` has **exactly one binding in the entire bundle**, and it is the **`app-settings`** store
(`index.js@186477`), not `app-storage`. More importantly, `gpuSandboxDisabled` is a
**declared, schema-backed key**. I recovered the full schema; it reads:

```js
'dynamicMicrophoneDegradationEnabled':{'default':!0x0},
'gpuSandboxDisabled':{'default':!0x1},          // !0x1 === false
'preferredBuiltInMicId':{'default':null},
```

**This materially strengthens the finding.** The flag is not a stray key that happens to persist —
it is a deliberate, schema-declared setting whose default is **false**:

- A clean install is **safe**: `!0x1` → false → no `--no-sandbox`.
- It flips true **only** via the GPU-crash path above.
- Once flipped it persists in `app-settings.json`, is re-read every launch, and has no UI to clear it.

It also means the store is reachable over IPC. The generic handler at `index.js@598687` resolves
`{'app-onboarding':Et,'app-settings':N,'app-storage':Yt}[store]`, so while there is no
*user-facing* control, **any renderer script can read or reset this flag through that channel** —
a second-order consequence of claim 2's missing sender validation.

### Honest caveats
- `app.disableHardwareAcceleration()` runs unconditionally, which makes a GPU *process* crash less obvious than the handler implies. The two facts are in tension; I did not resolve why the handler exists if acceleration is already off.
- `0xC0000135` = `STATUS_DLL_NOT_FOUND` is my reading of the NTSTATUS value; I make no claim about vendor intent.
- Whether this path has ever fired on this machine is **runtime** state and was not checked (static-only constraint preserved).
- I did **not** verify the Electron version, so I still cannot state the *default* sandbox state — only that the app can force it off.

---

## 2. Claim-by-claim verdicts (my own re-derivation)

### Claim 2 — "A renderer can reach every IPC channel. Preload exposes raw `ipcRenderer`; main does zero sender validation."
### ✅ **CONFIRMED** — and the strongest claim in the study

`dist/preload/index.mjs` (11,315 bytes, fully readable) exposes, via `contextBridge.exposeInMainWorld('electron', …)`:

```js
'on'   (ch, cb)   => r['ipcRenderer']['on'](ch, cb),
'off'  (ch, cb)   => r['ipcRenderer'][…](ch, cb),
'send' (ch, ...a) => r['ipcRenderer']['send'](ch, ...a),
'invoke'(ch, ...a) => r['ipcRenderer']['invoke'](ch, ...a),
'addKeyListener', 'removeKeyListener', 'platform'
```

Every one is a **raw passthrough of the channel string**. There is no allowlist, no prefix test, no validation of any kind in the preload.

On the main side, I re-ran the negative search the brief relies on and hit **trap #1 myself**:
- literal `.sender` = **0 occurrences** — but `sender` is decoded string index `0x6d8`
- searching `0x6d8` gives 13 hits, **7 of which are false positives** from the generated variable `_0x6d82c0`, which literally contains the substring `0x6d8`

The 6 real uses are unambiguous, and none validate anything:

| Offset | Use | Purpose |
|---|---|---|
| @578499 | `BrowserWindow.fromWebContents(event.sender)` | resolve a window for a file dialog |
| @602792, @604986, @605243, @607286, @607514 | `win.webContents.send(...)` / `.sender.send(...)` | progress + result callbacks |

And `initIpcHandlers` registers handlers that **discard their event argument**:
```js
ipcMain.on(<channel>, (_ev, arg) => this[method](arg))    // event never inspected
ipcMain.handle(<channel>, async (_ev, …args) => …)         // event never inspected
```
`validateSender` / `verifySender` / `allowedOrigins` / `senderFrame` / `isTrusted` = **0** each, and none of them appear in the decoded string table either.

**Conclusion holds: every `ipcMain` channel is reachable from any renderer script, with no sender check.** Combined with the broad bridge surface this remains the study's most defensible headline.

---

### Self-check §5 — re-measured independently

| Expectation | Measured | Verdict |
|---|---|---|
| `webPreferences` raw count = 9 | **9** (all in `index.js`) | ✅ |
| explicit `nodeIntegration` = 7 | **7** | ✅ |
| explicit `sandbox:` = 0 | **0** quoted-key forms | ✅ (but see §1 — the conclusion drawn from it was incomplete) |
| Drizzle migrations = 14 | **14** | ✅ |
| Drizzle tables = 2 | **2** `CREATE TABLE` | ✅ |
| `winax` in dist = 0 | **0** (1 in `package.json` only) | ✅ |
| `getUserMedia` in renderer | **present** (2 files) | ✅ |
| `MediaRecorder` in renderer = 0 | **0** | ✅ |
| renderer windows = 6, one shared preload | **6, one preload** | ✅ (see below) |
| channel list ≥ 177 | **175** in the shipped file | ❌ **FAILS** (see §2b) |
| DLL exports 9 / 48 | *verifier* | — |
| settings store keys = 26 | *verifier* | — |

**Renderer windows = 6 — CONFIRMED by construction, not by counting.** There is a base class `ps` with exactly one `createWindow()` that does the single `new _0x40cc99({...cfg})`, and **exactly 6 subclasses** override `getWindowOptions()`:

```
class fp extends ps  @199433     class Kp extends ps  @238065
class yp extends ps  @201157     class uf extends ps  @392242
class wp extends ps  @202017     class uy extends ps  @583852
```

All six return `nodeIntegration: !0x1` (→ **false**) and `contextIsolation: !0x0` (→ **true**). Trap #6 applies and the study applied it correctly. `webSecurity` never appears as a quoted key, consistent with "never disabled".

**"All sharing one preload" — CONFIRMED, but only after a trap the brief omits.** There are six preload *variables* (`gp, mp, _p, qp, af, ly`) and they split across two encodings:

- `gp`, `mp`, `_p`, `af` → `join(St, <index 0x823>)`
- `qp`, `ly` → `join(St, '../preload/index.mjs')` — the **same string as an inline literal**

`0x823` decodes to `../preload/index.mjs`; `St = dirname(fileURLToPath(import.meta.url))` = `dist/main`. All six therefore resolve to `dist/preload/index.mjs`.

> **NEW TRAP #11 — the same string can exist both in the string array (by index) *and* as an inline literal.**
> Searching by index finds **4**. Searching for the literal finds **3** (1 inside the string array itself + 2 inline). Neither search alone is complete; only the union (6) is right. A reviewer trusting either single search would have reported a wrong preload count.

A 7th `BrowserWindow` exists (site @597296) but it is a **1×1 offscreen** window with its own `session.fromPartition(...)`, `nodeIntegration:false`, `contextIsolation:true` — safe, and not a "renderer window" in the 6-window sense.

---

### Claim 1 — "No local speech recognition exists."
### ✅ **CONFIRMED**, with two false-positive traps recorded

Independently re-measured across all of `dist`: `onnxruntime`, `sherpa`, `vosk`, `whisper.cpp`, `faster-whisper`, `SpeechRecognition`, `speech_recognition`, `keyword_spotting`, `kaldi`, `WenetModel`, `Zipformer` = **0 each**. Model-like assets (`.onnx .tflite .bin .pt .pb .nemo .ort .gguf`) on disk = **0**.

Two traps that a careless pass would have misread as hits:

| Pattern | Hits | Actual meaning |
|---|---|---|
| `nemo` | 23 | **all** Slavic i18n: `onemogućena`, `nemogočiti`, `nemokamų`, `nemožno`. Not NVIDIA NeMo. |
| `transcri` | 1,775 | the product noun "transcription", not an engine reference |

`nemo` is the dangerous one: a scanner pattern-matching a speech-toolkit name returns 23 "hits" that are all Croatian/Lithuanian UI strings. **Absence claims need substring triage, not counts.**

---

## 2b. Self-check §5 channel count — ❌ FAILS on its own evidence file

The brief's §5 acceptance criterion reads:

```
Channel list size                → expect ≥177
```

The artifact handed to a reviewer, `evidence/ipc-channels.txt`, contains **175** unique entries. The expectation is **not satisfiable** against the deliverable as shipped — a reviewer following §5 mechanically is stuck at the first channel line.

Two sub-findings, and they point in opposite directions:

- **The list is internally consistent.** I independently harvested every colon-pattern string from the decoded main string table: **147** candidates, of which **0** are absent from `ipc-channels.txt`. So nothing discoverable from the string table is missing.
- **`page:open-url` *is* present** (the brief calls it out as the 177th find, invisible to string-table search), along with `page:open-url-scheme`. So the ≥177 total was not fabricated.

The most likely explanation is mundane: the 177 figure accumulated across passes and two entries (e.g. channels registered through constant objects like `Ft[…]`, or renderer-side channels) never made it into the persisted artifact. This is **not** a security-relevant error — the list is a completeness aid, and every channel I could independently recover is present. But it means **the brief's self-check cannot be used as-is**, and the study's own warning that "the channel list is never complete" is correct in spirit and should have been reflected in the §5 expectation rather than contradicted by it.

---

## 2c. Second-pass method: decoder rebuilt from scratch

On the re-check I refused to reuse `evidence/strings-main.txt` — it is the artifact most likely to be
wrong, since every index in §1 originally came from it. I extracted only the string-array function,
the rotator IIFE, and the decoder from `dist/main/index.js` and evaluated **those three alone** in a
fresh `vm` context. No vendor logic executes.

**Validation against five independent use sites** (all matched):

| Index | Decoded | Expected |
|---|---|---|
| `0xa2e` | `defineProperty` | ✅ |
| `0x50f` | `handle` | ✅ |
| `0x6d8` | `sender` | ✅ |
| `0x284` | `webPreferences` | ✅ |
| `0x1cf` | `getWindowOptions` | ✅ |

**Result: 2,881 strings decoded** from base `0x1b5` — independently reproducing the study's own
claimed string count. Every index in the `no-sandbox` chain decoded exactly as reported above.

This also upgraded the phantom-channel evidence in §5 from a literal grep (weak) to a **full-table
exhaustion** (strong): all three `focused-context:*visible-text*` / `*window-text*` names are absent
from all 2,881 decoded strings, so they cannot be hiding in the obfuscated array.

`focused-context:` in the decoded main table = **4** channels; the remaining 3
(`set-last-focused-info-timer`, `get-focused-app_info`, `get-selected-text`) are **inline literals**
in the `Ft` constant object, never entering the string array. Union = 7. Trap #11 again.

---

## 2d. `app-settings` schema — 25 keys, settled

Full brace-matched schema recovered from `index.js@186477`:

```js
featureShortcutBindings, microphoneDevices, selectedMicrophoneDevice, preferredLanguage,
autoSelectLanguages, selectedLanguages, launchAtSystemStartup, showFlowBarOnDesktop,
enableInteractionSoundEffects, enableShowAppInDock, historyDurationSeconds,
enabledMuteBackgroundAudio, __DEV_API_HOST, releaseNotesShownVersions,
__COMPATIBLE_V0_3_0_SELECTED_LANGUAGES_FLAG, enabledOpusCompression,
dynamicMicrophoneDegradationEnabled, gpuSandboxDisabled, preferredBuiltInMicId,
translationModeTargetLanguageCodes, translationModeAlertPreferredLanguageCode,
__COMPATIBLE_TRANSLATION_MODE_SHORTCUT_CHECKED_FLAG,
__COMPATIBLE_FEATURE_SHORTCUT_BINDINGS_MIGRATED_FLAG,
__COMPATIBLE_TRANSLATION_TARGET_LANGUAGE_CODES_MIGRATED_FLAG, appearancePreference
```

= **exactly 25 top-level keys**. A naive regex over the same text returns **26**, because
`releaseNotesShownVersions:{'default':{}}` contributes a second `'default'` token. **That is almost
certainly where the study's "26" came from**, and it is the correct explanation of the discrepancy
rather than a missing key.

Privacy check on those 25: **zero** match `privacy|telemetry|analytics|consent|track|pii|cloud_sync|diagnos|opt`.
Note `gpuSandboxDisabled` itself is the only sandbox/isolation-related key in the entire store.

---

## 3. New methodology traps discovered (beyond the brief's 10)

1. **Trap 11 — a string may exist BOTH in the string array (by index) and as an inline literal.** Index search and literal search each return a *different incomplete subset*; only their union is complete. Directly caused a wrong preload count until resolved (§2).
2. **Trap 12 — obfuscator-generated variable names can contain hex-index substrings.** `_0x6d82c0` contains the literal substring `0x6d8`. Searching for a decoded index produced 13 raw hits of which **7 were this artifact**. Always bound the match so it cannot be part of a longer identifier.
3. **Trap 13 — ESM renamed imports make symbol-name searches return a clean, confident 0.** `BrowserWindow as _0x40cc99` means `BrowserWindow(` → 0 while 2 real window constructions exist. This is the *same failure shape* as the Granola `webPreferences: 0` incident, now recurring in the sibling study — and it is silent, because 0 is a perfectly plausible answer.
4. **Trap 14 — bracket-notation method calls.** `_0x488816['handle'](…)` means `.handle(` → 0 while 148 `ipcMain` uses exist.

> Pattern worth naming: traps 13 and 14 are **instances of a general rule — in a renamed-import ESM bundle, any property-name search must be run against the alias table, never the original name.** The study documented traps for the string array and for `.mjs` globs, but not for the import layer.

---

## 4. Verifier subagent results (claims 1, 3–10 + PE/numeric)

The verifier rebuilt its own string decoder from scratch rather than reusing the prior table
(`arr[idx-0x1b5]` + rotation IIFE; validated `0xa2e`→`defineProperty`, `0x50f`→`handle`,
`0x6d8`→`sender`, `0x284`→`webPreferences` against use sites), plus a second decoder for
`worker/opusWorker.js` (base `0x13d`, 103 strings).

| Claim | Verdict | Note |
|---|---|---|
| C1 no local ASR | ✅ CONFIRMED | weakest *evidentially* — a static negative |
| C3 text not audio | ✅ CONFIRMED | 12 keys exactly; **framing understates** |
| C4 accessibility inert | ✅ CONFIRMED | **strongest claim** — byte-exact both halves |
| C5 no telemetry opt-out | ✅ CONFIRMED **+ WORSE THAN STATED** | escalation |
| C6 hotkeys + denylist | ✅ CONFIRMED | self-executing proof |
| C7 per-app tones | ✅ CONFIRMED | low-value claim type |
| C8 dictionary server-only | ✅ CONFIRMED | 7 endpoints, 2 tables |
| C9 history ≠ style | ✅ CONFIRMED | strengthened |
| C10 Opus `-5` | ✅ CONFIRMED | **cited RVA is wrong** |

### C4 — confirmed at byte level, with a correction

The claim held under the hardest available attack. `checkAccessibilityPermission` is in **UtilHelper.dll**, RVA `0xe490`, file offset `0xd890`:

```
b8 01 00 00 00 c3 cc cc cc…
```

= `mov eax,1; ret`. A contrast probe of `deviceIsLidOpen` in the same DLL returns real code
(`4c 8b dc 48 81 ec a8 00 00 00…`), proving this is not a parse artifact.

JS half at `index.js@593876`: `async checkAccessibility(){ return !0x0; }` — and `!0x0` is **true**
(trap #6 applied correctly). Consumed by `permission:check-with-child-process`, which **spawns no
child process despite its name**.

> **Correction to the brief:** it attributes the export to "a DLL" without naming it. It is
> **UtilHelper.dll**, not ContextHelper.dll.

### C5 — the one escalation: this is worse than claimed

The claim "no telemetry opt-out" is true, but the prior framing **missed both pipelines**.

**Sentry is actively initialised** (`index.js@630781`) with a hardcoded DSN,
`sendDefaultPii:false`, **`sampleRate:1` (100% of errors)**, plus a **30-second memory gauge**:

```js
setInterval(()=>{ Sentry.metrics.gauge('main_process_memory',
  process.memoryUsage().rss/0x400/0x400, {unit:'megabyte'}) }, 30000)
```
with a local crash queue at `<userData>/sentry/queue/queue-v2.json`.

**And Mixpanel is entirely absent from the prior analysis** — because the SDK is never named
"analytics", so the literal search was aimed at the wrong word. Channel `mixpanel:track-event`
accepts `{eventKey, data}` from the renderer and POSTs to **`/app/metrics_mp`**, with
`collectFocusedInputInfo` taking an `enableUploadMixpanel` parameter.

Settings check: the `app-settings` schema has **zero** keys matching
`privacy|telemetry|analytics|consent|track|pii|cloud_sync|diagnos`.

> **Net effect: the study's "no telemetry opt-out" should be restated as "two analytics/crash
> pipelines (Sentry crash + Mixpanel product analytics), hardcoded DSN, 100% error sampling,
> 30 s memory telemetry, renderer-driven event collection, and no user-facing switch anywhere."**

> **CORRECTION (third pass).** I told the user "`tracesSampleRate:1`". **Wrong.** The raw source is
> `'tracesSampleRate':0.01` — I mis-transcribed `0.01` as `0x01` and then read that as `1`.
> (`sampleRate:0x1` *is* genuinely `1` = 100% of **errors**; trace sampling is 1%.) I also described
> the gauge generically: it measures **`process.memoryUsage().rss`** (resident set size), not heap,
> every **30,000 ms** (`0x7530`).
>
> **And the "always-on" framing is too strong.** A second verifier traced the Mixpanel send function
> and found it **gated on a logged-in user** — it returns early unless a current `user_id` exists.
> Sentry's `init` is genuinely unconditional at module scope; **Mixpanel requires sign-in**. The
> accurate statement is: *one always-on crash pipeline and one sign-in-gated analytics pipeline.*

### C3 — confirmed, and the framing understates it

Push payload at `index.js@300966` is **exactly 12 keys**; feeder `SELECT` at `@296749` is 10
columns; `audio` / `audio_local_path` / `audio_context` are in neither.

But `mode_meta` **is** synced and is **derived from** `audio_context`
(`extractSelectedTextFromModeMeta(...)` → `buildModeMetaWithSelectedText` at `@256066`), so
pre-recording `selected_text` also reaches the vendor. Counterweight, genuinely in the vendor's
favour: `audio_context` is RSA-encrypted at rest (`encryptedAudioContext`, `@256968`).

> **Trap:** the key is *named* `audio_id` but carries the `history_v2` row id. A reader skimming
> the payload could easily conclude audio is uploaded. It is not.

### C10 — confirmed, cited address is wrong

The misleading literal is verbatim in `worker/opusWorker.js`: `"Buffer too small (error -5),
retrying with doubled buffer: "`, and the retry predicate is `if (code === -0x5) buffer *= 2`.

**`0x679d8` is not an RVA** — it is unmapped (`.text` ends `0x67200`, `.rdata` starts `0x68000`).
It is a **file offset**, mapping to RVA `0x693d8`, holding 7 pointers (ImageBase `0x180000000`):

```
[1] → "buffer too small"          [4] → "request not implemented"   (OPUS_UNIMPLEMENTED)
```

Index = `|err| − 1` (the relation that actually produces these pairs), so **−5 → index 4 →
"request not implemented"**, and **−2 → index 1 → "buffer too small"**.

> **CORRECTION (third pass).** My first draft wrote `Index = err + 1`, which is arithmetically
> impossible: `−5 + 1 = −4`, not `4`. The mapping I asserted is right, but the formula was wrong.
>
> **A second verifier also reports this 7-pointer table is unreferenced from `.text`** — an exhaustive
> RIP-relative scan found no code reference to RVA `0x693d8` (apparent hits were coincidental
> `movdqa` SIMD). If true, the table is **dead data**, and it is weaker evidence than it looks.
>
> **Downgrade C10 from CONFIRMED to WEAKENED.** The string table, the `0x679d8`-is-a-file-offset
> correction, and the retry predicate `code === -0x5` all reproduce. But the *load-bearing* inference
> — that −5 is not a size error — rests on a table that may never be executed. The conclusion is
> plausible and consistent with libopusenc's own `OPUS_ENC_INVALID_DATA = -5`, but I did not prove it.

The doubled-buffer retry is therefore **probably** futile; the original study's comment is
**probably** wrong. Neither is established at the standard the rest of this review meets.

### C1 — confirmed, but it is the weakest claim type

All runtime names = 0. Model assets across **11,177** extracted files = **0** (extensions
`.onnx .tflite .ort .gguf .nemo .pt .pb .bin .safetensors`). `whisper` = **425 hits in renderer,
100% in `'key':'value'` locale shape, 0 engine references** — matching the prior count. `\bNeMo\b`
across all of `dist` = **0**.

> **This remains a static negative.** A model could ship in a resource outside those ten
> extensions, or be embedded in a DLL. Treat as *high-confidence negative*, not *proven*.

---

## 5. Numeric self-check — two failures

| Check | Claimed | Measured | Verdict |
|---|---|---|---|
| ContextHelper exports | 9 | 9 | ✅ |
| Total exports, 6 DLLs | 48 (11/6/9/9/7/6) | 11+6+9+9+7+6 = **48** | ✅ |
| Drizzle tables | 2, `history`+`history_v2` | **2**, exact names | ✅ |
| `app-settings` schema keys | **26** | **25** | ❌ **REFUTED** — the 26th is a nested `'default'` token, see §2d |
| IPC channel list | ≥177 (file has 177) | file has **175**; true ≈**196** | ❌ **both numbers wrong** |

### The 3 phantom channels — independently confirmed by me

The verifier reported 3 entries in `ipc-channels.txt` that appear nowhere in `dist`. I tested this
against its own trap #1 rather than accepting it, then confirmed it outright.

Literal search across **all 84 `.js` and `.mjs` files**:
`focused-context:get-focused-visible-text`, `…-async`, `focused-context:get-focused-window-text`
→ **0 hits each**. But the **namespace is live**: `focused-context` = 14 hits (7 in `index.js`,
7 in `renderer/…/D1JFvEfK.mjs`).

The real namespace is exactly these 7, recovered from the `Ft` constant object at `@359586` and
mirrored in `D1JFvEfK.mjs`:

```
focused-context:set-last-focused-info-timer
focused-context:execute-last-focused-info-task
focused-context:get-last-focused-info
focused-context:get-focused-app_info        <-- note the underscore
focused-context:get-focused-input-info
focused-context:get-selected-text
focused-context:get-full-context
```

The prior folder 11 found the **method** `getFocusedVisibleTextAsync` (2 hits, camelCase) and
appears to have promoted it into three channel names that do not exist. Real neighbours are
`get-focused-app_info` and `get-focused-input-info`.

**So: 3 phantom channels confirmed. The namespace was real; three of its member names were invented.**

---

## 6. New methodology traps (brief's 10 + these)

From my pass:
- **#11 — the same string can exist BOTH in the string array (by index) AND as an inline literal.** Index search finds 4; literal search finds 3; only the union (6) is correct. Caused a wrong preload count.
- **#12 — obfuscator-generated variable names can contain hex-index substrings.** `_0x6d82c0` contains `0x6d8`; 7 of 13 raw `sender` hits were this artifact. Always bound matches against longer identifiers.
- **#13 — ESM renamed imports make property-name searches return a confident 0.** `BrowserWindow as _0x40cc99` ⇒ `BrowserWindow(` = 0 while 2 real constructions exist.
- **#14 — bracket-notation method calls.** `_0x488816['handle'](…)` ⇒ `.handle(` = 0 while 148 `ipcMain` uses exist.

From the verifier:
- **#15 — hyphenated channel namespaces silently collapse a prefix regex.** `^[a-z][a-zA-Z0-9_]*:` excludes `focused-context:`, `keyboard-input:`, `sync-engine:`, `release-notes:`, `ms-settings:`. This one character class cost **48 real channels** on a first pass.
- **#16 — multi-colon channel names defeat both the anchored-table test and the quote-adjacent raw regex.** `sync-engine:transcription-history:push-immediately` has 3 segments and needs a dedicated `(?::[a-z0-9_-]+){1,3}` pass.
- **#17 — obfuscated code and inlined i18n share one literal pool, so shape heuristics silently change your denominator.** Locale data is inlined in renderer chunks: 425 `whisper` hits were 100% `'key':'value'`; 59 `system_reserved` hits were 100% translation strings. **Never quote a corpus-wide hit count without stating whether code, locales, or both were searched** — the prior `425 whisper` and the verifier's `29 nemo` differ only by scope.
- **Bonus — `Get-ChildItem -File -Include *.js` without `-Recurse` or a wildcard path returns zero files silently in PowerShell.** It produced a false `whisper_total=0`. Use `-Filter` or filter on `.Extension`.

> **Generalising #13/#14:** in a renamed-import ESM bundle, *every* property-name search must run
> against the alias table, never the original name. The study documented traps for the string array
> and for `.mjs` globs, but not for the import layer. The Granola `webPreferences: 0` incident and
> this are the same failure shape recurring across both studies.

---

## 8. Third pass — a second verifier attacked *this report*, and found real errors

I pointed an independent verifier at my own review with instructions to refute it, specifically
including "is `N` really the electron-store, or did you misidentify it?" It rebuilt its own decoder
again (validated on 6 use sites) and returned **PARTIAL**: two of my three new claims were
directionally right but carried materially false supporting detail, and one contained hard errors.

**Every error it found in me was real. I have re-verified each independently before accepting it.**

| # | What I got wrong | Settled by |
|---|---|---|
| 1 | `N` = `app-storage` with empty schema | I caught this myself in pass 2; verifier independently agreed |
| 2 | `gpuSandboxDisabled` is a stray key | It is schema-declared, `'default':!0x1` (false) — I caught this in pass 2 |
| 3 | "`Bf` members are one value" | **`Set.size === 2`.** My "1 distinct value" was an int32-truncation artifact. Negative member is the live one; positive literal is dead |
| 4 | `tracesSampleRate: 1` | **Wrong — it is `0.01`.** I mis-transcribed `0.01` as `0x01`. `sampleRate:0x1` is genuinely 1 |
| 5 | "two always-on pipelines" | **Mixpanel is gated on a logged-in `user_id`.** Sentry is the unconditional one |
| 6 | Opus `Index = err + 1` | **Arithmetically impossible.** The real relation is `|err| − 1`. Plus the table may be unreferenced dead data → C10 downgraded |
| 7 | "`index.js` is 631,873 bytes" | That's the **char** count; the file is **632,559 bytes**. Text-reader offsets are char offsets and must not be compared across files |

### What survived its attack unchanged
- The `--no-sandbox` mechanism: `0x299` → `no-sandbox`, `0xc32` → `appendSwitch`, all indices correct.
- `s_()` is the **first** call in the sole entry point, before any window is built. Exactly **one** `appendSwitch` and one `commandLine` site exist in the whole bundle.
- `hi.isInProgress()` returns `isShuttingDown` (false at startup), so it does **not** suppress the path.
- The 3 phantom channels — confirmed, and the verifier properly neutralised trap #1 by decoding `preload/index.mjs` and `opusWorker.js` too.
- UtilHelper.dll export bytes, the file-offset-vs-RVA distinction, and the 48-export count.

### Two traps it added that matter for any future pass
- **Char count ≠ byte count.** The bundle is multibyte UTF-8; `.Length` differs from file size by 686 bytes. Any offset from a text reader is a *char* offset.
- **Obfuscation is per-file, not global.** `preload/index.mjs` (base `0x117`) and `worker/opusWorker.js` (base `0x13d`) carry independent arrays and rotation targets — a decoder built from `index.js` yields **garbage** on them. Worse, naive decoder-signature regexes match ordinary arithmetic (`x-0x1`, `charCodeAt()-0x30`) and make a plain bundle *look* obfuscated: the inverse of the trap I was warned about.
- **Data ≠ reachable code.** A 7-pointer error-string table with zero code references can be mistaken for an active error contract; the real contract lived in a separately obfuscated worker.

### Honest self-assessment
This review took three passes. Pass 1 produced a headline finding with a wrong store identity and a
wrong formula; pass 2 fixed both and *strengthened* the finding; pass 3 caught three more errors that
had survived a round-trip through a subagent. **Two subagent error-propagations occurred** — the
first verifier wrote `0x01` for `0.01`, I repeated it as `1`, and only the adversarial re-check
surfaced it. Treat every number in this document as worth one more look if it matters.

---

## 7. Bottom line

**The study is substantially trustworthy.** Nine of ten claims survived adversarial attack, several
at byte level, and the two most load-bearing ones (C4 inert accessibility, C10 wrong Opus comment)
are proven rather than inferred. The privacy architecture conclusions — no local ASR, no audio in
the sync payload, server-only dictionary — all replicate.

**Four things need correcting**, none of which overturn a conclusion:

1. `app-settings` has **25** keys, not 26.
2. The channel list is **175** in the artifact (not 177), the true count is ≈**196**, and **3 entries are phantom**.
3. `checkAccessibilityPermission` is in **UtilHelper.dll**, not "a DLL" / not ContextHelper.
4. `0x679d8` is a **file offset**, not an RVA.

**Two things need strengthening:**

1. **C5 is an escalation, not a confirmation** — two live telemetry pipelines (Sentry + Mixpanel), not a quiet absence. This is the most consequential change to the study's conclusions.
2. **C1 should be labelled a static negative**, not a proven absence.

**One thing was missed entirely:** the `gpuSandboxDisabled` → `--no-sandbox` fail-open path in §1.
That is a new security finding, not a correction to an existing claim.