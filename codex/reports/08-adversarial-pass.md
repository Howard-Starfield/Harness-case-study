# Codex 26.1007 — Report 08: Adversarial Second Pass

> ## ⚠️ RETRACTION — this report originally claimed the pass was self-performed and that *nothing was refuted*. Both claims were wrong.
>
> An independent `verifier` subagent **did** run. It was cancelled before it could report back, because
> `task_output` repeatedly returned `(no output yet)` and I read that as a stall. That was a misreading:
> `(no output yet)` describes the **delivery channel**, not the child's **work**. The child's log
> survived on disk and was recovered afterwards.
>
> It **REFUTED two claims in these reports.** Both are now recorded as corrections and have been
> independently re-verified:
>
> | ID | Report said | Actually |
> |---|---|---|
> | **C-L** | `allowServiceInstallElevation` hardcoded `!0` at **3** construction sites | **2** construction sites + 2 reads |
> | **C-M** | report 05 covers "every PE binary in the package" | **40 PE files** under `app\`; report 05 signed **15**. `d3dcompiler_47.dll` (4,746,544 B, Microsoft-signed) omitted |
>
> The same subagent **corroborated** the rest on a broader corpus: `elevation_service` = 0 across
> **20,153 files / 556 MB** (including 912 files excluded by the `.js/.mjs` sweep); the IPC census with
> **no hidden `ipcMain` aliasing**; and F1 **hardened** across 94 PE binaries / 2.32 GB with both
> pre- and post-sentinel wire layouts tested.
>
> **Revised verdict: 2 REFUTED, 8 CONFIRMED, 2 INFLATED** (C-L and C-M), plus one open discrepancy
> (`runas` 121 vs 131). Recovered log: `harness/recovered-verifier-log.txt`.
> Full analysis of *why* this happened: `harness/01-agent-orchestration-explained.md` §7.

---

**Original method note (now superseded, retained for the record):** this pass was **performed
directly, not by an independent agent.** A verifier subagent was dispatched to re-attack these reports
under the same static-only constraints; it produced no output across an extended run and was cancelled
without returning a verdict (`task bg_6ab5ccf0-…`, status `canceled`). **No independent verdict is
claimed here.** What follows is
the adversarial work actually performed, with its evidence and its limits.

---

## 8.1 What "adversarial" meant for this pass

Not a re-read. Each load-bearing claim was attacked with a method chosen to **falsify** it, and where
a claim is a negative, the attack had to defeat the search itself — not merely agree with it.

| Claim | Attack | Result |
|---|---|---|
| F5 renderer cannot reach `elevation_service` | Lift every file-class exclusion | **survived** |
| F5 | Break the literal search (base64, hex, char-code, split concat) | **survived** |
| F5 | Invert: enumerate what the renderer *can* name | **survived** |
| IPC = 24 registrations | Recount with two different engines | **survived** |
| F3 update HRESULT path | Byte-exact snippet verification at cited offset | **survived** |
| F7 sandbox fails closed | Re-derive `fail` → `reject` from source | **survived** |
| Corpus 14,816 files / 393,822,990 B | Independent filesystem walk, no extension assumptions | **survived** (subagent: exact match, and extended to 20,153 files / 556 MB) |
| F1 no fuse wire | Search 34 candidates; validate version+length | **survived** |
| F2 8 natives outside ASAR | Confirm extraction gap is `unpacked`, not a bug | **survived** |
| F10/C-F signing | Magic-byte check before believing `UnknownError` | **survived** |

**Nothing in the reports was refuted by the adversarial pass.** That is a real result, but it is not
the same as "the reports are right" — see §8.5.

## 8.2 The headline negative, attacked three ways

Evidence: `evidence/attack-headline.js` → `attack-headline.txt`; `evidence/attack-followup.js` →
`attack-followup.txt`.

**Angle 1 — lift the exclusions.** The original scan covered `.js`/`.mjs` and excluded locale `.json`.
Re-running across every excluded class:

| Class | Files | Bytes | `elevation_service` hits |
|---|---:|---:|---:|
| `.json` (locales + data) | 998 | 14,182,808 | **0** |
| `.wasm` | 34 | 37,773,171 | **0** |
| `.c` / `.h` (shipped sources!) | 43 | 1,478,237 | **0** |
| no extension | 113 | 1,263,859 | **0** |
| `.data` | 2 | 11,582,346 | **0** |

Not one file class in the tree contains the string. Note the `.c`/`.h` class matters — Codex ships
**C/C++ headers and sources inside the asar**, and those were not in the original corpus either.

**Angle 2 — break the search.** All returned **0**: base64 standard, base64url, hex-escape with no
separators, hex-escape with arbitrary separators, full char-code sequence, `elevat`+`ion_service`,
`elevation`+`_service`, and a loose `elevat[^A-Za-z0-9]{0,20}_service`.

**Angle 3 — invert the question.** Instead of asking what is absent, enumerate what the renderer can
actually name. **64 real `.exe` literals**:

```
wsl.exe 29 · cmd.exe 21 · powershell.exe 19 · git-bash.exe 13 · chrome.exe 12 · msedge.exe 12
brave.exe 12 · opera.exe 12 · vivaldi.exe 12 · GitHubDesktop.exe 10 · pwsh.exe 9 · codex.exe 9
bash.exe 7 · git.exe 6 · where.exe 6 · explorer.exe 4 · subl.exe 4 · node.exe 5 · tar.exe 2
vswhere.exe 2 · taskkill.exe 2 · tectonic.exe 2 · extension-host.exe 3 · rg.exe 3
codex-code-mode-host.exe 3 · codex-windows-sandbox-setup.exe 3 · codex-command-runner.exe 3
codex-computer-use.exe 1 · codex-computer-use-arm64.exe 1 · codex-computer-use-swift.exe 1
codex-chrome-native-host.exe 1 · node_repl.exe 2
```

`elevation_service.exe` — **absent**. The renderer can name shells and Codex's own tools. It cannot
name the elevation service.

## 8.3 Two loose ends the attack surfaced, and their resolution

**`\brunas\b` = 5 word-bounded hits.** Correction C-B had claimed "0 elevation-verb `runas`" from the
*substring* count, where all 7 MAIN hits were inside `runAsync`. A word-bounded search is the stricter
test and returned 5, all in RENDER. Each was read:

| # | File | What it is |
|---|---|---|
| 1 | `bat-54ba94408a32.js` @5467 | a Windows command/utility **vocabulary list** (`runas` among `robocopy`, `schtasks`, `ssh`…) |
| 2 | `configuration-schedule-3024a2685e19.js` @33906 | `runAs:n.data.name` — a UI field ("run as user") |
| 3 | same @34858 | `runAs:\`Me\`` |
| 4 | `lv-LV-82e2a86f41c8.js` @1605952 | Latvian locale string `"Runas terapija"` (run therapy) |
| 5 | same @1710985 | Latvian locale string `"Runas burbulis"` (run bubble) |

**Elevation-verb `runas` across the whole JS corpus: 0.** C-B is confirmed and strengthened.

**The `.exe` list was initially contaminated.** A naive `[A-Za-z0-9_.-]{2,40}\.exe` regex over minified
bundles returned **465 "filenames"**, dominated by artifacts such as `inbox.automations.exe`,
`localconversation.mcptoolactivity.sites.exe` and `this.exe` — where `.exe` is a **minified variable
name** terminating a dotted property chain. Filtering to word-bounded, non-minified-chain literals
gives 64. *No report quotes the 465 figure*; the trap is recorded here and in the verification brief
because it will recur on any future minified corpus.

## 8.4 Independent re-verification by method substitution

Evidence: `evidence/independent-recheck.js` → `independent-recheck.txt`.

**IPC count, counted twice with different engines.** `round5` used a regex; this used a sliding
`indexOf` scan and a `split().length-1` scan:

| Token | `indexOf` | `split` | Files | Agreement |
|---|---:|---:|---|---|
| `ipcMain.handle(` | 7 | 7 | 2/2 | AGREE |
| `ipcMain.on(` | 17 | 17 | 2/2 | AGREE |
| `ipcMain.handleOnce(` | 0 | 0 | 0/0 | AGREE |
| `ipcMain.removeHandler(` | 1 | 1 | 1/1 | AGREE |

Total **24**, and the explicit C-D trap check passes: the totals are not equal to the 34-file count,
which is what the original defect produced.

**F3 byte-exactness.** The catch block quoted in reports 05/06 is verbatim from
`bootstrap-487kJHw_.js` @24482:

```js
catch(e){if(!this.options.allowServiceInstallElevation||!(e instanceof Error)||!(`hresult`in e)||e.hresult!==2147958056)throw await this.discardPreparedUpdate(),e}
```

**F7 fail-closed, re-derived.** `r.fail(Error(co))` at `src-BJv5Mk7n.js` @294351, and `fail` is
defined as `fail:e=>{i()&&n.reject(e)}` — the timeout path **rejects**. Confirmed from source rather
than by reading the surrounding prose.

## 8.5 What this pass does NOT establish

Being unable to break a claim is weaker than proving it. Explicit limits:

- **No independent agent verdict.** The delegated verifier returned nothing. A second pair of eyes on
  the same artifact would be worth having; this pass does not substitute for one.
- **Static negatives cannot exclude runtime-only paths.** F5 says the *shipped JS corpus* contains no
  reference. It does not prove no code path exists that constructs the name at runtime from data
  outside the corpus (config, environment, network). I looked for the obvious construction shapes and
  found none; that is weaker than a proof.
- **F1's consequence stays open.** The negative (0 fuse wires) is solid. Whether the protections those
  fuses would carry are enforced by another mechanism is **not established**, and closing it needs
  disassembly or a runtime probe — the latter is barred here.
- **R1–R10 in `verification-brief.md` §4 are unchanged.** This pass did not close any of them.
- **The Typeless column of report 07 remains a carried queue claim**, not a verified fact.

## 8.6 Corrections preserved

All thirteen corrections (C-A … C-M) remain visible in `06-findings.md` §6.2, three of which are
corrections to **this study's own earlier work**. Nothing was silently fixed.

- **C-A…C-K** were found and fixed *during* the pass.
- **C-L and C-M were found by the cancelled subagent**, recovered from disk after the fact, and then
  independently re-verified by this session before being recorded. That recovery is the reason this
  report now exists in two versions rather than one: the original "nothing was refuted" verdict was
  wrong, and the correction is recorded here rather than silently replaced.
- One open discrepancy remains unrecorded as a correction because it could not be resolved:
  the subagent measured `runas` = **121** where report 02 states **131** (RENDER substring count).
  Both are substring counts and both were already flagged as unsafe to quote; the word-bounded
  figure (5, all non-elevation) remains the only defensible one.

**Revised verdict: 2 REFUTED (C-L, C-M), 8 CONFIRMED, 1 open discrepancy.** The load-bearing security
findings — F5 (renderer cannot reach elevation), F7 (sandbox fails closed), F1 (no fuse wire) and the
IPC census — all survived, and F1 and the headline negative were *strengthened* by the subagent's
broader corpus. The two defects were in secondary claims in report 05.