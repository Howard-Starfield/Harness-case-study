# Codex 26.1007 — Report 01: Artifact Manifest

**Target:** `C:\Program Files\WindowsApps\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0`
**Method:** static only. Nothing was launched, no binary was executed, no DLL was loaded, no process was attached.
**Date of pass:** 2026-10-13 (second run; Target 1 = Claude Desktop)

---

## 1.1 Package identity

| Field | Value | Source |
|---|---|---|
| MSIX name | `OpenAI.Codex` | `Get-AppxPackage` |
| MSIX version | `26.1007.2314.0` | `Get-AppxPackage` |
| Publisher | `CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B` | `Get-AppxPackage` |
| PackageFullName | `OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0` | `Get-AppxPackage` |
| SignatureKind | `Store` | `Get-AppxPackage` |
| Install status | `Ok` | `Get-AppxPackage` |
| `package.json` version | `26.1007.21434` | `app.asar` root |
| `owl-app.ini` AppVersion | `26.1007.21434` | `app\resources\owl-app.ini` |

**Two version schemes coexist (correction C-I).** The MSIX package version is `26.1007.2314.0`; the
in-app version reported by `package.json` and `owl-app.ini` is `26.1007.21434`. These are not the
same number in different formatting — `2314.0` and `21434` do not correspond. Any update-identity or
bug-report comparison must state which scheme it is using. The queue's artifact map carries the MSIX
scheme, which is the correct one for package provenance.

## 1.2 Runtime identity — this is not a stock Electron app

| Evidence | Value |
|---|---|
| `app\resources\owl-electron-app.json` | `"runtimeName": "owl"`, `"packagedFrom": "D:\codex-apps-workspace\codex\codex-apps\electron\out\Codex-win32-x64"`, `runtimeArchiveSha: 7b8fe683…` |
| `app\owl-shell-runtime.json` | `{"schemaVersion":1,"platform":"win32","arch":"x64","msixPackageDependencies":[]}` |
| `app\155.0.8059.40.manifest` | assemblyIdentity `155.0.8059.40`, manifest for `chrome_elf.dll` |
| Binary layout | `chrome.dll` 329 MB + `chrome_elf.dll` + `elevation_service.exe` + `elevated_tracing_service.exe` |

Codex ships a **Chromium 155 shell called "owl"** with Chromium's DLL split-out layout, not a
single-file Electron bundle. `chrome.dll` contains all three of `Electron`, `Chrome/`, `node::` and
`v8::` markers, so the Electron embedder layer is present — it is simply compiled into the Chromium
DLL rather than into a monolithic app executable. `ChatGPT.exe` (4,781,872 B) is a thin launcher and
carries none of those markers itself.

This layout difference is the root cause of correction C-G below and of the fuse result in
report 05. Any analysis that assumes "the exe holds the Electron runtime" is wrong for this package.

## 1.3 File census

Full SHA-256 + byte + char manifest: `evidence/manifest.tsv` (**3,337 files**).

**Top-level `app\resources` inventory** (outside `app.asar`): **3,301 files, 1,837,324,271 bytes**.

| Path | Bytes | Notes |
|---|---:|---|
| `app.asar` | 567,399,024 | 20,988 entries |
| `codex.exe` | 334,121,776 | Rust, Windows |
| `codex` | 294,451,848 | Rust, **Linux x86-64 ELF** (WSL companion) |
| `codex-code-mode-host.exe` | 74,712,368 | Rust |
| `codex-code-mode-host` | 74,036,112 | Linux ELF |
| `codex-windows-sandbox-service.exe` | 55,824,688 | Rust — **absent from the queue's map (C-I)** |
| `codex-windows-sandbox-setup.exe` | 17,725,744 | Rust |
| `codex-command-runner.exe` | 8,204,592 | Rust |
| `rg.exe` / `rg` | 4,352,304 / 5,408,904 | Windows / Linux ELF |
| `THIRD_PARTY_NOTICES.txt` | 3,296,339 | |
| `masque-proxy-origins.txt` | 38 | `https://codex-portals.api.openai.com` |

`app\` also holds `Codex.exe` (20,272 B launcher stub), `ChatGPT.exe`, `chrome.dll`,
`chrome_elf.dll`, `elevation_service.exe`, `elevated_tracing_service.exe`, `owl-shell-runtime.json`.

## 1.4 ASAR structure

Parsed with a purpose-written reader (`evidence/asar.js`), **validated against the known-good
Claude asar (478 entries) before use** after its first header-offset attempt failed. Layout
confirmed: `u32` `4` at offset 0, `headerSize` at 4, `headerSize-4` at 8, `jsonStringSize` at 12,
JSON header at offset 16, `dataBase = 8 + headerSize`.

| Field | Value |
|---|---:|
| Entries | 20,988 |
| `headerSize` | 5,829,680 |
| `dataBase` | 5,829,688 |
| Extracted | 20,980 files / 566,146,084 bytes |

The 8-entry gap between 20,988 index entries and 20,980 extracted files is exactly the
`app.asar.unpacked` set — see **C-E** and report 04.

## 1.5 Corpus scope (every count in every Codex report inherits this)

Two corpora are kept separate throughout, because the main process and the renderer are different
trust domains.

| Corpus | Path | Files | Bytes |
|---|---|---:|---:|
| **MAIN** | `.vite/build` | 34 | 10,333,165 |
| **RENDER** | `webview/**` (`.js`/`.mjs`/`.cjs`) | 14,782 | 383,489,825 |
| Scanned total | | **14,816** | **393,822,990** |

Byte/char accounting (rule G9): **393,822,990 bytes / 350,841,377 chars**; `byte == char` is
**false**, with **1,948 files** containing multi-byte UTF-8. All counts are occurrence counts over
raw text, **not** an encoded string pool; locale `.json` files are excluded from code counts and
stated separately when used.

MAIN is small and legible: `main-BklS_2Y2.js` 3,824,365 B; `worker.js` 2,381,605 B;
`src-BJv5Mk7n.js` 1,591,361 B; `browser-page-preload.js` 527,604 B; `bootstrap-487kJHw_.js` 461,537 B;
`preload.js` 6,909 B; `sandbox-preload.js` 2,102 B.

### Correction C-A — my own renderer file count was wrong

An earlier note in this study recorded the renderer corpus as "**20,119 `.js`/`.mjs` files,
545,939,185 bytes**". That is **refuted**. 20,119 counted *all* files under `webview/` regardless of
extension; it is not a JavaScript count. The same measurement error in the other direction was caught
once more by checking: `webview/assets` alone is 19,961 files / 540,845,826 B of **mixed** content.

Correct figures, re-derived from the filesystem with no extension assumptions
(`evidence/recount.js`, `evidence/recount.txt`):

- Whole extracted tree: **20,980 files / 566,146,084 bytes**
- JS-family in whole tree: **15,045 files / 396,959,178 B** (`.js` 15,027 + `.mjs` 18 + `.cjs` 0)
- MAIN 34 + RENDER 14,782 = 14,816; the remaining **229** JS files are in `node_modules`
- `webview/assets`: 19,961 files / 540,845,826 B — **all extensions**, not JS

The counts that follow in later reports use 14,782.

## 1.6 Out of scope (stated, not silently dropped)

- **`~/.codex/`** — the user's own conversation and memory data. Never opened.
- **`chrome.dll` (329 MB)** and `.pak` locale tables — upstream Chromium. Re-deriving Chromium
  internals is not the objective; they are touched only for the fuse sentinel and for provenance.
- **`~/.claude/`** — same rule, and out of scope for this target entirely.

## 1.7 Build-path disclosure (informational)

`owl-electron-app.json` leaks an internal build path:
`D:\codex-apps-workspace\codex\codex-apps\electron\out\Codex-win32-x64`, plus `runtimeArchiveSha`.
No secrets, no credentials, no key material. Recorded for provenance only.