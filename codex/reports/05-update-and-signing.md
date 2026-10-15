# Codex 26.1007 — Report 05: Update & Code Signing Posture

---

## 5.1 Authenticode — 60/60 PE binaries Valid (package-wide)

> **Correction C-M, now CLOSED.** An earlier draft claimed to cover "every PE binary in the package"
> while signing a **hardcoded list of 15**. Re-run by **magic-byte enumeration** over the whole
> package, the true figure is **60 PE files**, and the answer is stronger than the original claim:
> **60 Valid, 0 NotSigned, 0 Unknown.** The cancelled verifier's guess of 92 was also wrong; 40 is the
> count under `app\` alone. Evidence: `evidence/signing-all-pe.ps1` → `signing-all-pe.txt`.

**Method:** enumerate every file under the package root by **MZ magic bytes** (not by extension, not
by a hardcoded list), then `Get-AuthenticodeSignature` each one.

```
PE files found : 60
Valid          : 60
NotSigned      : 0
Other/Unknown  : 0
```

**Two signers:**

| Count | Signer | Thumbprint |
|---:|---|---|
| **59** | `CN="OpenAI OpCo, LLC"` | `0C6C3CA94B5A2DDA98357A1176470AB7B85ADF8F` |
| **1** | Microsoft Windows | `BAC13DF18B37E808208A39D3A54CCE975FAC8C1D` |

The single Microsoft-signed file is `d3dcompiler_47.dll` (4,746,544 B) — the standard DirectX shader
compiler redistributable that ships inside essentially every Chromium/Chrome-based application.

> **Downgrade of a flagged "finding."** The cancelled verifier reported this as *"a Microsoft-signed
> binary inside an OpenAI MSIX"* and *"two significant gaps."* **It is not a finding.** Microsoft
> redistributable DLLs in a Chromium app directory are entirely normal; the MSIX signature chain
> already covers the file, and OpenAI correctly does not re-sign someone else's DLL. Recorded here so
> the flag is closed rather than left hanging.

The OpenAI certificate details (unchanged from the first pass):

```
Subject     : CN="OpenAI OpCo, LLC", O="OpenAI OpCo, L…"
Issuer      : CN=Microsoft ID Verified CS AOC CA 03, O=Microsoft Corporation, C=US
NotAfter    : 10/09/2026 16:21:37
Algorithm   : sha384RSA
Timestamp   : CN=Microsoft Public RSA Time Stamping …
```

sha384, EV/ID-Verified issuance, countersigned. MSIX `SignatureKind: Store`, package `Status: Ok`.
**No unsigned PE binary exists anywhere in the package.**

### Correction C-F — "3 unsigned binaries" would have been wrong

`Get-AuthenticodeSignature` returns `UnknownError` on three files when they are passed in directly.
That is a **parser** outcome, not a signing outcome: the file is not a PE image. Magic-byte check
(`evidence/magic.js` → `magic.txt`):

```
codex                  294,451,848 B  ELF 64-bit LE  ET_DYN  x86-64  SYSV
codex-code-mode-host    74,036,112 B  ELF 64-bit LE  ET_DYN  x86-64  SYSV
rg                      5,408,904 B  ELF 64-bit LE  ET_DYN  x86-64  SYSV
codex.exe              334,121,776 B  PE (MZ)
codex-command-runner.exe  8,204,592 B  PE (MZ)
```

They are Linux x86-64 ELF binaries shipped as WSL companions. Reporting them as "unsigned" would have
been a method error, not a finding. Their Windows counterparts (`codex.exe`, `rg.exe`) are validly
signed. **The magic-byte enumeration in the corrected census excludes these files by construction**,
which is why they no longer pollute the results.

| Binary | Status | Signer |
|---|---|---|
| `Codex.exe` | **Valid** | `CN="OpenAI OpCo, LLC"` |
| `ChatGPT.exe` | **Valid** | `CN="OpenAI OpCo, LLC"` |
| `elevation_service.exe` | **Valid** | `CN="OpenAI OpCo, LLC"` |
| `elevated_tracing_service.exe` | **Valid** | `CN="OpenAI OpCo, LLC"` |
| `chrome.dll` | **Valid** | `CN="OpenAI OpCo, LLC"` |
| `chrome_elf.dll` | **Valid** | `CN="OpenAI OpCo, LLC"` |
| `codex.exe` | **Valid** | `CN="OpenAI OpCo, LLC"` |
| `codex-code-mode-host.exe` | **Valid** | `CN="OpenAI OpCo, LLC"` |
| `codex-windows-sandbox-service.exe` | **Valid** | `CN="OpenAI OpCo, LLC"` |
| `codex-windows-sandbox-setup.exe` | **Valid** | `CN="OpenAI OpCo, LLC"` |
| `codex-command-runner.exe` | **Valid** | `CN="OpenAI OpCo, LLC"` |
| `rg.exe` | **Valid** | `CN="OpenAI OpCo, LLC"` |
| `codex` | `UnknownError` | — |
| `codex-code-mode-host` | `UnknownError` | — |
| `rg` | `UnknownError` | — |

Every valid signature shares one certificate:

```
Subject     : CN="OpenAI OpCo, LLC", O="OpenAI OpCo, L…"
Issuer      : CN=Microsoft ID Verified CS AOC CA 03, O=Microsoft Corporation, C=US
NotAfter    : 10/09/2026 16:21:37
Thumbprint  : 0C6C3CA94B5A2DDA98357A1176470AB7B85ADF8F
Algorithm   : sha384RSA
Timestamp   : CN=Microsoft Public RSA Time Stamping …
```

sha384, countersigned, MSIX `SignatureKind: Store`, package `Status: Ok`. Strong posture. Note the
cert is an **EV/ID-Verified** issuance ("ID Verified CS AOC CA 03"), not a plain DV certificate.

### Correction C-F — "3 unsigned binaries" would have been wrong

`Get-AuthenticodeSignature` returns `UnknownError` on those three. That is a **parser** outcome, not a
signing outcome: the file is not a PE image. Magic-byte check (`evidence/magic.js` → `magic.txt`):

```
codex                  294,451,848 B  ELF 64-bit LE  ET_DYN  x86-64  SYSV
codex-code-mode-host    74,036,112 B  ELF 64-bit LE  ET_DYN  x86-64  SYSV
rg                      5,408,904 B  ELF 64-bit LE  ET_DYN  x86-64  SYSV
codex.exe              334,121,776 B  PE (MZ)
codex-command-runner.exe  8,204,592 B  PE (MZ)
```

They are Linux x86-64 ELF binaries shipped as WSL companions. Reporting them as "unsigned" would have
been a method error, not a finding. Their Windows counterparts (`codex.exe`, `rg.exe`) are all validly
signed.

## 5.2 Electron fuses — no wire exists in this package

Claude Desktop had 9 fuses decoded. Codex has **none**.

Method (`evidence/round7.js`, `evidence/round8.js`, `evidence/round9.js`): search for the
`@electron/fuses` sentinel `dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX`, then validate that the bytes
immediately preceding it form a v1 wire (`uint32 version == 1`, `uint32 length` 1–32).

### Correction C-G — the first "absent" result was a false negative

Scanning only `ChatGPT.exe` and `Codex.exe` returns **no sentinel at all**. Reporting that as "fuses
absent" would have been wrong, because this package does not put the Electron runtime in the exe — see
report 01 §1.2. The calibration sweep over `app\*.exe`/`*.dll` found the sentinel in **`chrome.dll` at
`0x10e22af0`**, while the same sweep positively located `Electron`, `Chrome/`, `node::` and `v8::`
markers in `chrome.dll`. The scan works; the first sweep was simply looking in the wrong file.

### Correction C-H — and that was *also* not a fuse wire

The bytes preceding the sentinel in `chrome.dll` read `uint32 = 1917811060`, `uint32 = 6646084` — not
`version=1`, not a plausible length. Hex context shows why:

```
69 6e 67 20 61 6c 67 6f 72 69 74 68 6d 20 69 6e 20 56 61 6c 69 64 61 74 65 49 6e 74 65 67 72 69 74 79 4f 72 44 69 65 00
64 4c 37 70 4b 47 64 6e 4e 7a 37 39 36 50 62 62 6a 51 57 4e 6b 4d 48 58 42 5a 61 42 39 74 73 58
```

= `"…ing algorithm in ValidateIntegrityOrDie"` + `\0` + the sentinel + `\x01\x09` + `"01"`.

The sentinel is a **substring of an error-message string** belonging to Chromium's ASAR
`ValidateIntegrityOrDie` code path — not a fuse wire.

### The validated result

A package-wide sweep of **34 PE/`.node` candidates** (every `.exe`/`.dll`/`.node` under `app/` to
depth 3, plus the large Chromium binaries explicitly):

```
TOTAL sentinel occurrences: 1
TOTAL valid fuse wires    : 0
```

**Finding F1 — no Electron fuse wire exists in the Codex package.** Unlike Claude Desktop, there is
no demonstrable fuse-level hardening: no `RunAsNode` disable, no `NODE_OPTIONS` disable, no
`--inspect` disable, no `EnableEmbeddedAsarIntegrityValidation`, no `OnlyLoadAppFromAsar`.

**What this does and does not mean.** It does **not** follow that those protections are off. Two
things in the artifact point the other way: the `ValidateIntegrityOrDie` code path is present and
compiled in, and `app.asar.unpacked/` exists as a directory, which is what an ASAR-integrity-aware
packaging step produces. This Chromium-based "owl" shell may enforce these controls through a
mechanism other than the Electron fuse wire, or not at all.

**I cannot resolve that statically, and I am not going to assert either way.** Resolving it needs one
of: disassembly of `chrome.dll`'s fuse-reading path, or a runtime probe setting `ELECTRON_RUN_AS_NODE`
— and runtime probing is out of scope under the static-only rule. This is the **largest residual
unknown in the target** and is carried as such into `verification-brief.md`.

## 5.3 Update mechanism

Two updaters, selected by build:

```js
if (n != null) {                       // MSIX/Store build
  let e = process.arch===`x64`||process.arch===`arm64`,
      i = new Mn({storeProductId, storeUpdateManifestUrl, buildVersion:…, packageIdentity:t,
                  checkIntervalMs: e?0:o, checkOnInitialize:!e, …});
  c = e ? new Nn({checkIntervalMs:o, storeUpdater:i,
                   msixFallbackUpdater: new wn({allowServiceInstallElevation:!0,
                                                manifestUrl:n.storeUpdateManifestUrl,
                                                packageIdentity:t, packagePublisher:r,
                                                checkIntervalMs:0, checkForUpdatesOnInitialize:!1, …})})
        : i
} else
  c = new wn({manifestUrl:i, allowServiceInstallElevation:!0, buildVersion:…, …})
```

On x64/arm64 MSIX builds the Store updater is primary and an **MSIX-fallback updater** carries
`allowServiceInstallElevation:!0`. The flag is hardcoded true at **both construction sites** — there is
no user-facing setting and no build-flavor gate on it.

> **Correction C-L (added after the adversarial re-verification):** an earlier draft of this report
> said the flag is hardcoded true at **three** construction sites. That was wrong. There are
> **4 total mentions** of `allowServiceInstallElevation` in MAIN, of which **2 are constructions**
> (`bootstrap-487kJHw_.js` @51513 — the MSIX-fallback updater; @51788 — the non-x64/arm64 updater)
> and **2 are reads** (@21465 passing the flag into `activateStagedPackage`, @24399 in the `catch`).
> The *conclusion* — the flag is always true and never user-configurable — is unaffected; only the
> site count was wrong. Found by the re-verification subagent, whose finding was lost when the task
> was cancelled and recovered from disk. Evidence: `workspace/verify-subagent-claims.js` → `.txt`.

Entry point is sender-gated:

```js
f.ipcMain.handle(`codex_desktop:check-for-updates`,
                 async e => { this.options.isTrustedIpcEvent(e) && await this.checkForUpdates() })
```

Install path re-checks `this.options.allowed()` before staging and again before completing.

## 5.4 Finding F3 — the staging path swallows an elevation HRESULT

```js
let a = { buildVersion:t, packagePath:i.packagePath, length:i.length, sha256:i.sha256 };
try {
  await this.options.nativeAddon.stagePackage(a.packagePath)
} catch (e) {
  if (!this.options.allowServiceInstallElevation
      || !(e instanceof Error)
      || !(`hresult` in e)
      || e.hresult !== 2147958056)
    throw await this.discardPreparedUpdate(), e
}
let o = this.getStageStatePath();
await fs.writeFile(`${o}.tmp`, JSON.stringify(a, null, 2))
await fs.rename(`${o}.tmp`, o)
… return `update-ready`
```

The HRESULT:

```
decimal    2147958056
hex        0x80073D28
facility   7          severity 1 (error)
win32 code 15656 (0x3D28)
```

When `stagePackage()` fails with exactly `0x80073D28` and elevation is allowed, **the error is
discarded and staging is recorded as successful**, then the app reports `update-ready`.

**What I can and cannot claim.**

- **Claimed (static, direct):** the error path exists, matches one specific HRESULT, and proceeds to
  write stage state and report `update-ready`.
- **Not claimed:** that this is exploitable, or that the staged bytes are invalid. `stagePackage` is
  implemented in `native/windows-updater.node`; its internal behaviour on this HRESULT is **not
  readable statically**. Whether the package is left correctly staged, partially staged, or not
  staged at all determines the real impact.
- **The HRESULT name is unverified.** I attempted a lookup in the installed Windows SDK
  (`C:\Program Files (x86)\Windows Kits\10\Include` — present but `winerror.h` absent) and a web
  lookup (tool failure). So `0x80073D28` is reported **as a hex value only**; I am not attaching a
  name like "operation cancelled by user", because I could not verify it. Facility 7 / code 0x3D28 is
  not a common system Win32 code, which suggests it may be application- or Chromium-defined — that
  would make "elevation was declined" a plausible reading and equally make it a wrong guess.

**Severity: medium, pending native confirmation.** The shape — a tolerated HRESULT on the
privilege-acquiring branch of an updater, followed by recording success — is the kind of pattern that
deserves a runtime test rather than a static verdict. Symmetry note: Claude Desktop's analogous
service-install path **fails closed** (`if(!allowServiceInstallElevation … ) throw await
this.discardPreparedUpdate(), e`). Codex's is deliberately tolerant.

## 5.5 Proxy configuration

`app\resources\masque-proxy-origins.txt` — 38 B, one line:

```
https://codex-portals.api.openai.com
```

MASQUE (RFC 9298, HTTP/3 proxy tunnels) is configured for a single allowlisted origin. One origin,
no wildcard. Nothing else in the package references it from JS. Recorded for completeness; no
finding.

## 5.6 Third-party component inventory

`THIRD_PARTY_NOTICES.txt` — 3,296,339 B, present and populated. `package.json` dependencies include
`node-pty ^1.1.0`, `ssh-config ^5.2.0`, `better-sqlite3`, `@electron/fuses ^1.8.0`,
`@worklouder/device-kit-oai`.

Two notes:

1. **`ssh-config ^5.2.0` is present** — the same dependency Claude Desktop ships. Claude's
   adversarial pass found a second in-tree SSH stack with its own `known_hosts` parser (correction
   C-I there). Whether Codex has a parallel implementation is **not established** by this report; I
   did not trace Codex's SSH surface. Carried as an open item.
2. **`@electron/fuses ^1.8.0` is a declared dependency, yet no fuse wire exists** (finding F1). The
   dependency being present without its effect being present is exactly the discrepancy worth
   recording, and it is consistent with the "owl" shell having replaced the Electron binary that the
   build step would normally flip.