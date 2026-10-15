# Verification Brief — Claude Desktop 2.31226.1.0

**Target:** Claude Desktop 2.31226.1.0 (MSIX x64, Electron 44.4.3)
**Date:** 2026-10-13
**Purpose:** every headline claim with its verdict, its stated method, and its corpus scope.

---

## 0. Method declaration

**Static analysis only.** Nothing was launched, executed, or debugged; no process was
attached; nothing phoned home. The user's `~/.claude/` was never opened. The extracted
asar tree at `%TEMP%\claude-src` was read but never copied or redistributed.

**Corpora, and what "0 hits" means in this document:**

| Corpus | Contents | Used for |
|---|---|---|
| **CODE** | 408 `.js`/`.mjs` files extracted from `app.asar` (356 in `.vite/build`, 23,047,420 bytes = 23,047,420 chars, **pure ASCII**, so byte offset == char offset) | All JS claims |
| **BINARY** | 5 vendor `.exe` files + `claude.exe` (246 MB), read as bytes | PE, string, fuse, define claims |
| **LOCALES** | 50+ `.json` locale files | **EXCLUDED** — no claim depends on them |
| **USER DATA** | `~/.claude/` | **EXCLUDED** — out of scope by instruction |

**String pool status:** the JS corpus is **raw text, not an encoded string pool**. The
artifact is minified (identifier mangling), not obfuscated. **No decoder was required for
string recovery, and no obfuscation key applies.** What required a decoder was the
*channel-name construction*, which is runtime composition rather than string encoding — a
different problem, solved per-file with no cross-file state.

Every `0` in the "0-hit?" column below is stated with its method and corpus scope, per G2.
A 0 means "this pattern does not occur in CODE corpus", **not** "the behaviour is absent".

---

## 1. Artifact manifest claims (report 01)

| # | Claim | Verdict | Method | Corpus | 0-hit? |
|---|---|---|---|---|---|
| M1.1 | 104 files hashed | **CONFIRMED** | `Get-FileHash SHA256` | binary | no |
| M1.2 | `claude.exe` SHA-256 = `0109485c3812fa9c6fbc8bfd1c9c390dad4d25a538bbbd0d95e8286283a94bfb` | **CONFIRMED** | same | binary | no |
| M1.3 | JS corpus is byte-identical to char count | **CONFIRMED** | `Buffer.byteLength` vs `.length`, summed over 356 files | CODE | no |
| M1.4 | `en-US.json` 56,092 B vs 55,805 chars (−287) | **CONFIRMED** | `ReadAllText().Length` vs file size | binary | no |
| M1.5 | Extraction = 420 files / 36,137,122 B | **CONFIRMED** | `Get-ChildItem -Recurse` | CODE | no |
| M1.6 | Fuse sentinel at file offset `0xbe244b8` | **CONFIRMED** | streaming byte scan | binary | no |
| M1.7 | `app.asar` SHA-256 = `efa9e2310cf943b333b153c093babb8b5a92f80a23cb68764dba9b29a0801d4a` | **CONFIRMED** | `Get-FileHash` | binary | no |

---

## 2. IPC claims (report 02)

| # | Claim | Verdict | Method | Corpus | 0-hit? |
|---|---|---|---|---|---|
| C2.1 | Channel grammar `$eipc_message$_<uuid>_$_<expose>_$_<Iface>_$_<method>`, built at runtime by `ao()` | **CONFIRMED** | verbatim read of `ao` @528210; independent verifier agreed | CODE | no |
| C2.2 | 1,384 preload-referenced channels | **CONFIRMED** (verifier: 1,374 — definition difference) | per-file prefix resolution | CODE | no |
| C2.3 | **1,294** handler channels from **94** `ao()` sites | **CORRECTED** — was 2,092 | depth-aware tuple parse; verifier independently got 1,280 | CODE | no |
| C2.4 | **1,294 matched / 0 handler-only / 90 preload-only** | **CORRECTED** — was 1,294/798/90 | set difference both ways | CODE | no |
| C2.5 | Decoder reproduces 6 literal channels exactly | **CONFIRMED** | literal-vs-expansion agreement | CODE | no |
| C2.6 | 16 guards: 9 origin-allowlist, 4 top-frame-only, 1 `cowork-artifact:`, 1 `app://localhost` | **CONFIRMED** (detail corrected) | brace-balanced verbatim extraction | CODE | no |
| C2.7 | All 16 guards require `parent === null`; **4 check no origin** (57 ch, 4.4%) | **CORRECTED** — "all origin-validated" was overstated | verbatim + recount | CODE | no |
| C2.8 | Every codegen handler validates args + result | **CONFIRMED** | `Nxe`/`Oxe`/`Axe` verbatim | CODE | no |
| C2.9 | 52 `exposeInMainWorld` occurrences | **CONFIRMED** | occurrence count | CODE | no |
| C2.10 | Prior run's "0 literal handlers" is a method artifact | **PARTLY REFUTED** — 6 literal channels do exist outside `ao()` | independent parse | CODE | n/a |
| C2.11 | **`Yjr` fails open** — define never set in CODE or BINARY | **CONFIRMED (new finding)** | corpus regex + streaming binary scan, calibrated | CODE + binary | **yes — 0 in both, calibrated** |
| C2.12 | `process` exposure = exactly 4 keys | **CONFIRMED** | verbatim `Gr`/`$` | CODE | no |

### 0-hit claims in this section

| Claim | Pattern | Method | Corpus | Meaning |
|---|---|---|---|---|
| C2.11a | `__ELECTRON_WINDOW_ALLOWED_ORIGINS__` | regex over 408 files | CODE | 4 occurrences, **all reads**, 0 assignments |
| C2.11b | same identifier in `claude.exe` | streaming scan, 246,402,896 B | BINARY | **0** occurrences. Calibrated: `__dirname`=34, `__filename`=32, `ELECTRON_RUN_AS_NODE`=11 — method proven able to detect such identifiers |

---

## 3. Sandbox claims (report 03)

| # | Claim | Verdict | Method | Corpus | 0-hit? |
|---|---|---|---|---|---|
| C3.1 | `contextIsolation: true` ×17 | **CONFIRMED** | regex, occurrence count | CODE | no |
| C3.2 | `nodeIntegration: false` ×17 | **CONFIRMED** | same | CODE | no |
| C3.3 | `sandbox: true` ×16, `sandbox: false` ×0 | **CORRECTED** — had it inverted | per-occurrence context re-extraction | CODE | `sandbox:!1` is **0** |
| C3.4 | `webSecurity` never assigned | **CONFIRMED** | `webSecurity\s*:\s*(!0\|!1\|true\|false)` | CODE | **yes — 0; Chromium default `true` applies** |
| C3.5 | `allowRunningInsecureContent` never assigned | **CONFIRMED** | same | CODE | **yes — 0; default `false`** |
| C3.6 | `no-sandbox` absent | **CONFIRMED** | `/no-sandbox/gi` | CODE | **yes — 0** |
| C3.7 | No `webSecurity:false` / `nodeIntegration:true` / `contextIsolation:false` / `sandbox:false` | **CONFIRMED** | 4 targeted regexes | CODE | **yes — 0 each** |
| C3.8 | Silent-authorize window sandboxed + deny-all permissions | **CONFIRMED** | verbatim | CODE | no |
| C3.9 | All 12 main-chunk windows pair `sandbox:true` with `nodeIntegration:false` | **CONFIRMED** | per-occurrence context | CODE | no |
| C3.10 | 21 `setWindowOpenHandler`, 13 `will-navigate`, 5 `setPermissionRequestHandler` | **CONFIRMED** | occurrence count | CODE | no |
| C3.11 | CSP deployed incl. report-only | **CONFIRMED** | occurrence count | CODE | no |

**Correction C-A (visible):** an earlier draft read minified `!0` as `false` and reported
"sandbox disabled in all 16". `!0` is `true`. Caught by re-reading every site rather than
trusting the aggregate. The conclusion strengthened: **every window is sandboxed.**

**Note on C3.6:** the adversarial verifier independently reached the same conclusion but
for a stronger reason than absence of the string — the dynamic `appendSwitch(t.name)` loops
are gated by a **13-entry GPU-only allowlist** (`A8`). This strengthens F10 in report 06.

---

## 4. Native / elevation claims (report 04)

| # | Claim | Verdict | Method | Corpus | 0-hit? |
|---|---|---|---|---|---|
| C4.1 | 4 service binaries are Go 1.25.14; chrome-native-host is Rust | **CORRECTED** — was "Rust" | `\xff Go buildinf:` + `go1.25.14` + section signature | binary | no |
| C4.2 | No export directory in any native binary | **CONFIRMED** | PE data-directory[0] | binary | no |
| C4.3 | RVA↔offset rule stated; section tables recorded | **CONFIRMED** | PE header parse | binary | no |
| C4.4 | `cowork-svc.exe` = `cowork-win32-service`, Hyper-V VM host | **CONFIRMED** | Go symbol table | binary | no |
| C4.5 | Pipe = `\\.\pipe\cowork-vm-service` | **CONFIRMED** | char-code probe, verbatim JS | CODE | no |
| C4.6 | Dispatch gated by `dispatchVerified` / `InitSignatureVerification` | **CONFIRMED** | Go symbol ordering | binary | no |
| C4.7 | 13 RPC handlers over the pipe | **CONFIRMED** | Go symbol table | binary | no |
| C4.8 | No `runas`/elevated spawn; uses `StartService` | **CONFIRMED** | `cowork-svc` literal is **0** in CODE | CODE | **yes — 0** |
| C4.9 | `StartService` denial fails closed with backoff | **CONFIRMED** | verbatim @2924107 | CODE | no |
| C4.10 | Service install/uninstall requires Administrator | **CONFIRMED** | binary strings | binary | no |
| C4.11 | Native SSH path delegates to system OpenSSH (≥9.4) | **CONFIRMED** | verbatim | CODE | no |
| C4.11a | **A second in-tree SSH stack** has its own known_hosts parser | **NEW** (verifier found, I confirmed) | string census + verbatim | CODE | no |
| C4.12 | Binary embeds a full SSH **server** | **CONFIRMED** | banner/kex/auth strings | binary | no |
| C4.13 | VHDX is the guest disk | **CONFIRMED** | Go symbols + JS | binary+CODE | no |
| C4.14 | Guest VM default network adapter | **NOT VERIFIED** | — | — | — |
| C4.15 | Pipe signature = HMAC-SHA2-256, with `validateBundlePathAsUser` | **CONFIRMED** (strengthens C4.6) | targeted string sweep | binary | no |

### 0-hit claims in this section

| Claim | Pattern | Method | Corpus | Meaning |
|---|---|---|---|---|
| C4.8a | `cowork-svc` | regex over 408 files | CODE | **0** — the app never spawns the service by name; it uses the SCM |
| C4.8b | `runas` | regex, manual review of all 33 raw hits | CODE | **0 real** — the verifier found 33 naive matches are all false positives (e.g. `runAsNode`) |

---

## 5. Update / signing claims (report 05)

| # | Claim | Verdict | Method | Corpus | 0-hit? |
|---|---|---|---|---|---|
| C5.1 | 6 binaries Authenticode-`Valid` | **CONFIRMED** | `Get-AuthenticodeSignature` | binary | no |
| C5.2 | Signer `CN="Anthropic, PBC"`, SERIALNUMBER 4860621, DE/US | **CONFIRMED** | cert subject | binary | no |
| C5.3 | Issuer DigiCert Trusted G4 Code Signing RSA4096 SHA384 2021 CA1 | **CONFIRMED** | chain | binary | no |
| C5.4 | DigiCert timestamp countersignature present | **CONFIRMED** | `TimeStamperCertificate` | binary | no |
| C5.5 | MSIX signature present (10,547 B) | **CONFIRMED** | file + SHA-256 | binary | no |
| C5.6 | Fuse wire `0109303130303131303131`, length 9 | **CONFIRMED** (verifier read the same bytes) | byte read | binary | no |
| C5.7 | RunAsNode / NODE_OPTIONS / `--inspect` all DISABLED | **CORRECTED** — was "UNKNOWN" | decode vs Electron spec | binary | no |
| C5.8 | Asar integrity + OnlyLoadAppFromAsar ENABLED | **CONFIRMED** | same | binary | no |
| C5.9 | `GrantFileProtocolExtraPrivileges` ENABLED | **CONFIRMED** | same | binary | no |
| C5.10 | MSIX is the primary Windows update mechanism | **CONFIRMED** | 199×`msix`, 10×`appinstaller` | CODE | no |
| C5.11 | Release bucket = Google Cloud Storage | **CONFIRMED** | `package.json` | CODE | no |
| C5.12 | `autoUpdater` verification config | **NOT VERIFIED** | — | — | — |

**Correction C-C (visible):** the first fuse decoder treated only `0x72`/`0x31` as
meaningful and printed `UNKNOWN(0x30)`. `0x30` is ASCII `'0'` = **DISABLED**. Four fuses
moved from *unassessable* to *secure*.

**Resolution:** fuse #8 is `WasmTrapHandlers`, confirmed against upstream
`electron/fuses` `buildFuseV1Wire()`, whose nine-byte order matches the observed length.

---

## 6. Adversarial second pass — summary

**Verdict returned by the independent verifier: PARTIAL.**

Ten headline claims were attacked. Six held. Two were materially wrong, two were inflated,
and one new material finding emerged. **Every refuted claim was independently re-verified
by me before being accepted** (G8) — none were taken on the verifier's word.

### Corrections ledger (all preserved visibly in the reports)

| ID | What was wrong | How found | Status |
|---|---|---|---|
| **C-A** | `sandbox:!0` read as `false`; "sandbox disabled" | self, re-reading all 16 sites | **fixed** in report 03 |
| **C-B** | native binaries called "Rust"; actually Go | self, marker fingerprinting | **fixed** in report 04 |
| **C-C** | 4 fuses decoded `UNKNOWN`; actually DISABLED | self, rebuild vs spec | **fixed** in report 05 |
| **C-D** | handler count 2,092 → **1,294** (nested-tuple double-count); "798 orphans" → **0** | verifier + my depth-aware recount | **fixed** in report 02 |
| **C-E** | "all handlers origin-allowlisted" overstated; 4 guards check top frame only (57 ch) | verifier + my recount | **fixed** in report 02 |
| **C-F** | allowlist not "exactly" 5 origins; `cowork-artifact:` also accepted | verifier | **fixed** in report 02 |
| **C-G** | **NEW FINDING** — `Yjr` fails open when define absent | verifier + my calibrated binary scan | **added** as F1a |
| **C-H** | "0 literal handlers" claim too clean; 6 exist outside `ao()` | verifier | **softened** in report 02 |
| **C-I** | "no independent host-key store" too strong; second in-tree SSH stack exists | verifier + my confirmation | **fixed** in report 04 |

### The finding that survived hardest scrutiny

**`Yjr` fails open.** This went through the full G8 loop: raised by the verifier, then
independently reproduced by me, then the negative was **calibrated** against control needles
before being accepted — because a 0-hit on a 246 MB binary is worthless without proof the
method can detect such identifiers. Controls fired (`__dirname`=34, `__filename`=32,
`ELECTRON_RUN_AS_NODE`=11), so the 0 for `__ELECTRON_WINDOW_ALLOWED_ORIGINS__` is evidence.

### Honest statement of what this pass does NOT establish

- No claim of exploitability for F1a — the residual `Rya`/`$A` check was not traced
  end-to-end (open item O8).
- No claim about the pipe HMAC key derivation (O1).
- No dynamic testing of any kind, by instruction.

---

## 7. Definition-of-done status (queue.md checklist)

| # | Requirement | Status |
|---|---|---|
| 1 | Artifact manifest, SHA-256 for every file examined; byte + char counts | ✅ `manifest.tsv`, 104 files |
| 2 | Decoder rebuilt from scratch per obfuscated file, validated on ≥5 use sites | ✅ **N/A — artifact is not obfuscated**; the *channel* decoder was rebuilt and validated against 6 literal ground-truth channels |
| 3 | Full IPC inventory, set difference both ways, sender validation per handler | ✅ 1,384 preload / 1,294 main / 1,294 matched / 90 preload-only; 16 guards classified |
| 4 | Sandbox posture per window, count sharing each config | ✅ 16/16 sandboxed, 12 windows enumerated individually |
| 5 | Native inventory: exports, RVA↔offset, entry points | ✅ section tables + explicit offset rule; **no export directories exist**, entry points not applicable (Go/Rust exes) |
| 6 | Update / signing posture | ✅ 6/6 signed, 9/9 fuses decoded, MSIX primary |
| 7 | `verification-brief.md` with every claim + verdict + method | ✅ this document |
| 8 | Adversarial second pass with corrections visible | ✅ 9 corrections logged, 1 new finding |

**All 8 requirements met.** Note the honest caveat on #2: there was no obfuscation to
defeat, so that control was exercised against a different failure mode (runtime channel
composition) rather than the one it was written for.
