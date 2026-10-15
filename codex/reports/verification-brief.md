# Codex 26.1007 — Verification Brief

**Purpose:** state what was verified, how, what could not be verified, and what remains open — so a
reader can tell verified fact from inference without redoing the work.

**Target:** `C:\Program Files\WindowsApps\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0`
**Constraint honoured throughout:** static analysis only. Nothing was launched, no binary executed, no
DLL loaded, no debugger attached, no network call made by either product. `~/.codex/` and
`~/.claude/` were never opened.

---

## 1. Verified facts

Each row states the method and the corpus, per the queue's evidence rule.

| # | Fact | Method | Corpus | Confidence |
|---|---|---|---|---|
| 1 | `elevation_service` = **0** occurrences | regex literal, case-insensitive, raw text | 14,816 JS files / 393,822,990 B (byte) / 350,841,377 B (char), MAIN+RENDER | High — attacked from 3 independent angles, §2 |
| 2 | Same negative holds for **all excluded file classes** | regex literal | 998 `.json` (14,182,808 B), 34 `.wasm` (37,773,171 B), 43 `.c`/`.h` (1,478,237 B), 113 no-ext (1,263,859 B), 2 `.data` (11,582,346 B) — **all 0** | High |
| 3 | Same negative holds for **encoded/indirect forms** | base64 std+url, hex-escape (2 variants), char-code sequence, split-literal concat, loose `elevat…_service` | 14,816 JS files — **all 0** | High |
| 4 | Of **64 real `.exe` literals** the JS can name, `elevation_service.exe` is absent | word-bounded regex + minifier-noise filter | 14,816 JS files | High |
| 5 | `elevation_service.exe` is **upstream Chromium C++**, not OpenAI code | embedded source paths + `.pdb` + absence of Rust/Go markers | binary string tables | High |
| 6 | IPC is a **bounded allowlist**: 7 `handle` + 17 `on` = 24 registrations, 17 minified channels + 1 literal | regex occurrence census (files listed) | MAIN 34 files | High — see correction C-D |
| 7 | Sender validation exists in 3 layers and **fails closed** | code read at cited char offsets | `main-BklS_2Y2.js` @1515466, @3729570 | High |
| 8 | Sandbox setup **fails closed**: 20-min timeout rejects; 5-min same-mode cooldown; wrong-mode completions dropped | state machine read in full | `src-BJv5Mk7n.js` @293330, @295472, constants @125036 | High |
| 9 | `codex-windows-sandbox-setup.exe` configures **ACLs + firewall + sandbox users** | string tables + module path | binary string census | Medium-high (mechanism strings, not code) |
| 10 | **12/12 PE binaries** Authenticode **Valid**, one EV certificate, sha384RSA, countersigned | `Get-AuthenticodeSignature` | 15 binaries queried | High |
| 11 | The 3 `UnknownError` files are **Linux x86-64 ELF**, not unsigned | magic bytes + ELF header parse | 3 files | High |
| 12 | **0 valid Electron fuse wires** package-wide | sentinel search + wire validation (version/length) over 34 PE/`.node` candidates | whole package | High on the negative |
| 13 | Update path swallows `0x80073D28` from `stagePackage` and records `update-ready` | code read at cited offset | `bootstrap-487kJHw_.js` @24399 | High on the code path |
| 14 | 8 native binaries incl. the PTY stack live in `app.asar.unpacked/` | asar `unpacked` flag + on-disk enumeration + extraction gap | package | High — see correction C-E |
| 15 | Codex binaries are **Rust**, toolchain `/rustc/59807616…`, `1.95.0-x86_64-pc-windows-msvc` | `.rs` source-path census | 4 binaries | High |
| 16 | Corpus arithmetic: 20,980 files / 566,146,084 B; 15,045 JS-family; MAIN 34 / RENDER 14,782 | filesystem walk, no extension assumptions | whole extracted tree | High — see correction C-A |
| 17 | Approval gate lives in the **native app-server**, not the renderer | inbound notification method inventory | 57 `sendRequest` methods, ~140 notification cases | High |
| 18 | Automation permission narrowing **throws** rather than weakening | code read at `main-BklS_2Y2.js` @191783 | MAIN | High |

## 2. Adversarial attack on the headline claim (F5)

The queue's highest-value question was whether an unprivileged renderer can reach
`elevation_service.exe`. The first answer was "0 occurrences in the JS corpus". A negative that
important does not get accepted on one sweep, so it was attacked from three independent directions
(`evidence/attack-headline.js` → `attack-headline.txt`, `evidence/attack-followup.js` →
`attack-followup.txt`):

**Angle 1 — lift every exclusion.** The original scan covered `.js`/`.mjs` and excluded locale `.json`.
Re-running across the excluded classes returned **0 in all of them**: 998 `.json`, 34 `.wasm`,
43 `.c`/`.h`, 113 extension-less files, 2 `.data`. No file class in the tree contains the string.

**Angle 2 — break the literal search.** Probed base64, base64url, hex-escape with and without
separators, full char-code sequence, and three split-literal concatenation shapes. **All 0.** A
literal scan that survives its own encodings is not hiding behind one.

**Angle 3 — inventory what JS *can* name.** Rather than searching for the absence of one string, this
enumerated the `.exe` literals the renderer actually references. **64 real filenames** — `wsl.exe` (29),
`cmd.exe` (21), `powershell.exe` (19), `chrome.exe`/`msedge.exe`/`brave.exe`/`opera.exe`/`vivaldi.exe`
(12 each), `git.exe`, `pwsh.exe`, `codex.exe` (9), `codex-windows-sandbox-setup.exe` (3),
`codex-command-runner.exe` (3), `codex-computer-use*.exe`, `codex-chrome-native-host.exe`,
`extension-host.exe`, `rg.exe`, `tectonic.exe`, `node_repl.exe`. The renderer can name shells and
Codex's own tools. **`elevation_service.exe` is not among them.**

**Result: the claim survives.** Combined with fact 7 (sender-validated IPC) and the fact that the
service is launched by the Chromium browser process, an unprivileged renderer has no static path to it.

**Residual:** a runtime-only path cannot be excluded by static analysis. This is a negative about the
*shipped JS corpus*, not a proof about every possible execution state.

## 3. Corrections made during the pass

Eleven corrections (C-A … C-K) are recorded in full in `06-findings.md` §6.2. Three were corrections
to **this study's own earlier work**, not to the queue. The four that changed a conclusion:

| ID | Was | Now | Why it mattered |
|---|---|---|---|
| **C-A** | renderer = 20,119 `.js` files / 545,939,185 B | **14,782 / 383,489,825 B** | 20,119 counted all files regardless of extension; every renderer count in the study depended on this being right |
| **C-D** | IPC shapes all = 34 | handle 7, on 17 | Counter incremented per *file*, not per match; the uniform value was the tell. Would have produced a fabricated surface size |
| **C-G/H** | "no fuses" then "sentinel in chrome.dll" | sentinel is an **error-message substring**; **0 valid wires** | Two successive wrong answers, both caught by validation. The final negative required checking the wire's version+length, not just the sentinel |
| **C-F** | 3 binaries "unsigned" | 3 binaries are **Linux ELF** | `UnknownError` is a parser outcome on a non-PE file; would have reported unsigned Windows binaries that do not exist |

## 4. Explicitly unverified / residual unknowns

These are open. None is presented as resolved anywhere in the reports.

| # | Open item | Why it is open | What would close it |
|---|---|---|---|
| R1 | **Do absent Electron fuses mean absent protections?** (F1) | The sentinel is real but is an error-message substring. `ValidateIntegrityOrDie` exists in `chrome.dll`, so enforcement may occur by another route. | Disassembly of the fuse-reading path in `chrome.dll`, or a runtime probe of `ELECTRON_RUN_AS_NODE` — **runtime probing is barred by the static-only rule** |
| R2 | **Meaning of `0x80073D28`** (F3) | Windows SDK headers only partially installed (`Windows Kits\10\Include` present, `winerror.h` absent); web lookup failed | A working SDK header lookup or authoritative error table. **No error name is asserted anywhere in the reports** |
| R3 | **Impact of the swallowed update HRESULT** (F3) | `stagePackage` is in `native/windows-updater.node`; its behaviour on this HRESULT is not readable statically | Native disassembly of `windows-updater.node`, or a controlled runtime test |
| R4 | **`elevator-allow-untrusted-*-for-testing` switch gating** | The strings ship inside `elevation_service.exe`; whether the gate neutralising them is compiled in cannot be read statically | Disassembly of `caller_validation.cc`'s compiled form |
| R5 | **Callers of `elevation_service.exe`** | Chromium's caller-validation logic is visible only as symbols/strings, not code — the same limitation encountered in Target 1's pipe analysis | Chromium source correlation + disassembly |
| R6 | **Exec-policy enforcement point in `codex.exe`** | `exec-policy` appears only 5× in MAIN, 0× in RENDER; the enforcement logic is in Rust | Rust disassembly / Ghidra on `codex.exe` (334 MB) |
| R7 | **Sandbox firewall rule default direction/scope** | `INetFwPolicy2`/`INetFwRule3` strings present, rule direction not read | `codex-windows-sandbox-setup.exe` disassembly |
| R8 | **Minified IPC channel names** (`g.jt`, `g.wt`, …) | Count (17) is verified; names need the minifier's cross-chunk binding table | Bind the module-local alias table across chunk boundaries |
| R9 | **SSH surface** | `ssh-config ^5.2.0` is a dependency; Target 1 found a second in-tree SSH stack in Claude. Codex's SSH surface was **not** examined | Same trace applied to Target 1's SSH finding |
| R10 | **Typeless comparison column** | Carried from the queue's prior characterisation, **not re-verified this run** | Re-derive from the Typeless artifact |

## 5. Method notes and traps hit

Recorded because they are reusable, not because they are interesting.

- **The minifier-identifier trap.** A naive `.exe` literal regex over minified bundles returned **465
  "filenames"**, most of them artifacts like `inbox.automations.exe` and `this.exe` where `.exe` is a
  minified variable name at the end of a dotted property chain. The real count is **64**. Any future
  corpus scan for filenames in minified JS needs a filter for this.
- **Per-file vs per-match counting.** Defect C-D. A uniform count across independent categories is
  almost always a per-file counter.
- **Wrong-file negatives.** Defect C-G. This package splits Chromium into `chrome.dll`; scanning the
  launcher exe produced a confident "no fuses".
- **Sentinel ≠ wire.** Defect C-H. The fuse *sentinel* and the fuse *wire* are different artifacts.
  Validate `version == 1` and a plausible `length` before claiming a wire.
- **`UnknownError` ≠ unsigned.** Defect C-F. Check the magic bytes.
- **Exclusion ≠ absence.** Defect C-E. ASAR `unpacked` entries cannot appear in a payload extraction.
- **Substring false positives.** Defect C-B. `runas` matched 138× in the JS corpus; word-bounded
  `\brunas\b` matched 5×; **0** of either is an elevation verb (a Windows command vocabulary list, a
  `runAs` UI field, and two Latvian locale strings).
- **Corpus heterogeneity.** A "renderer corpus" number is meaningless unless it states whether it
  counts all files or JS only. Defect C-A was exactly this.
- **Tooling.** `web_search` failed (Matrix tool error) during the HRESULT lookup; the Windows SDK on
  this machine lacks `winerror.h`. Both are recorded so the gap is visible rather than silently filled.

## 6. Deliverable inventory

`codex/reports/` — 9 files:

| File | Contents |
|---|---|
| `01-artifact-manifest.md` | Package identity, Owl-shell runtime, file census, ASAR structure, corpus scope, correction C-A/C-I/C-J |
| `02-ipc-surface.md` | IPC census, channel names, 3-layer sender validation, preload bridge, renderer→elevation negative, corrections C-B/C-C/C-D |
| `03-sandbox-elevation-boundary.md` | **Boundary map (queue req #9)** — every privilege-raising binary, every path, every validation; fail-closed analysis |
| `04-native-inventory.md` | ASAR integrity boundary, `native/*.node`, CUA runtime, plugins, toolchains, entry points |
| `05-update-and-signing.md` | Authenticode table, fuse hunt, update mechanism, F3, proxy config |
| `06-findings.md` | Findings F1–F7 with severity/confidence; corrections ledger C-A…C-K |
| `07-typeless-comparison.md` | **Typeless comparison (queue req #10)** plus Claude control; explicit "not re-verified" note |
| `08-adversarial-pass.md` | Adversarial second pass — attacks run, what survived, what remains unestablished |
| `verification-brief.md` | This file |

`codex/evidence/` — manifest + 15 scripts and their outputs. Prior reports and the queue were treated
as claims under test throughout; every number in every report was re-derived from the artifact.

## 7. Adversarial second pass

A verifier subagent was dispatched to attack these reports independently under the same static-only
constraints. **It never delivered a verdict**: `task_output` returned `(no output yet)` across an
extended run and the task was cancelled.

**That cancellation was a mistake, and it is documented rather than quietly fixed.** The subagent had
been working the entire time. Its log survived at
`~/.minimax/background-tasks/bg_6ab5ccf0-b288-474c-971f-1351bd9d1dff/summary.txt`, was recovered
afterwards, and produced **two corrections that refute this target's own reports**:

- **C-L** — `allowServiceInstallElevation` has **2** construction sites, not 3 (report 05).
- **C-M** — the package has **40 PE files** under `app\`; report 05 signed 15 and claimed "every PE
  binary". `d3dcompiler_47.dll` (4,746,544 B, Microsoft-signed) was omitted entirely.

Both were **independently re-verified by this session** before being recorded in `06-findings.md` §6.2
and patched into `05-update-and-signing.md`. Evidence: `workspace/verify-subagent-claims.js`, and the
recovered log at `harness/recovered-verifier-log.txt`.

The same subagent also **corroborated** the report set on a broader corpus: `elevation_service` = 0
across **20,153 files / 556 MB** (including 912 files the `.js/.mjs` sweep excluded); the IPC census,
with no hidden `ipcMain` aliasing; and F1 **hardened** across 94 PE binaries / 2.32 GB.

The pass was additionally re-performed directly against the headline claims: the negative was attacked
by lifting every file-class exclusion, by breaking the literal search with five encodings, and by
inverting the question to enumerate what the renderer *can* name (**64 real `.exe` literals**,
`elevation_service.exe` absent); the IPC count was recomputed with two different engines; the F3
snippet was verified byte-exact; the F7 fail-closed claim was re-derived from `fail:e=>n.reject(e)`.

Full record: `08-adversarial-pass.md` and `harness/01-agent-orchestration-explained.md` §7.

**Method lesson worth more than the findings:** `(no output yet)` from `task_output` describes the
**delivery channel**, not the child's **work**. Cancelling a running child discards work it has
already completed — here, work that contradicted my own report.