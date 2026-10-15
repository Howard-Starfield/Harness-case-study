# 05 — Update Channel and Code Signing

**Target:** Claude Desktop 2.31226.1.0
**Date:** 2026-10-13
**Method:** Static only. Signatures read via `Get-AuthenticodeSignature` (a read-only
certificate-chain query — it does not execute or modify the target). Fuse bytes read by
scanning `claude.exe` for the Electron fuse sentinel.

---

## 5.1 Code signing — all binaries validly signed

| File | Status | Signer |
|---|---|---|
| `app\claude.exe` | **Valid** | `CN="Anthropic, PBC", O="Anthropic, PBC", L=San Francisco, S=California, C=US` |
| `app\resources\cowork-svc.exe` | **Valid** | same |
| `app\resources\claude-ssh-broker.exe` | **Valid** | same |
| `app\resources\claude-ssh-askpass.exe` | **Valid** | same |
| `app\resources\claude-ssh-proxy.exe` | **Valid** | same |
| `app\resources\chrome-native-host.exe` | **Valid** | same |

Certificate chain details for `claude.exe`:

| Field | Value |
|---|---|
| Subject | `CN="Anthropic, PBC", SERIALNUMBER=4860621, …, OID.1.3.6.1.4.1.311.60.2.1.3=US` |
| Issuer | `CN=DigiCert Trusted G4 Code Signing RSA4096 SHA384 2021 CA1, O="DigiCert, Inc."` |
| Validity | 2025-10-13 → 2026-10-20 |
| SHA-1 thumbprint | `0D7581D2C51C59DF686C3000C70BF543F9F6C6CB` |
| **Countersignature** | `CN=DigiCert SHA256 RSA4096 Timestamp Responder 2026 1` |

The countersignature matters: it means the signature remains verifiable **after** the
certificate expires, so an expired leaf does not cause Windows to reject the binary.
This is EV-certificate-grade practice.

Package-level signing is also present: `AppxSignature.p7x` (10,547 B,
SHA-256 `88d2e326df352ce177d9d1c567ac03b98d6188458c85a367897e6719452f509e`) is the MSIX
signature, and the `AppxManifest.xml` declares the package identity.

---

## 5.2 Electron fuses — re-derived with corrected encoding

`claude.exe`, fuse sentinel `dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX` found at
**file offset `0xbe244b8` (199,378,104)**. `fuseVersion = 1`, `fuseLength = 9`.

Wire bytes: `01 09 30 31 30 30 31 31 30 31 31`

Decoding rule (Electron FuseV1 wire format is ASCII):
`'0'`(0x30) = DISABLED, `'1'`(0x31) = ENABLED, `'r'`(0x72) = REMOVED

| # | Fuse | Byte | State | Assessment |
|---:|---|:--:|---|---|
| 0 | `RunAsNode` | `0` | **DISABLED** | ✅ blocks `ELECTRON_RUN_AS_NODE` / argv injection |
| 1 | `EnableCookieEncryption` | `1` | ENABLED | ✅ session cookies encrypted at rest |
| 2 | `EnableNodeOptionsEnvironmentVariable` | `0` | **DISABLED** | ✅ blocks `NODE_OPTIONS=--require` injection |
| 3 | `EnableNodeCliInspectArguments` | `0` | **DISABLED** | ✅ blocks `--inspect` debugger attach via argv |
| 4 | `EnableEmbeddedAsarIntegrityValidation` | `1` | **ENABLED** | ✅ asar tamper-detection active |
| 5 | `OnlyLoadAppFromAsar` | `1` | **ENABLED** | ✅ cannot be redirected to a loose directory |
| 6 | `LoadBrowserProcessSpecificV8Snapshot` | `0` | **DISABLED** | ✅ no stale V8 snapshot reuse |
| 7 | `GrantFileProtocolExtraPrivileges` | `1` | ENABLED | ⚠️ `file://` retains extra privileges |
| 8 | `WasmTrapHandlers` | `1` | ENABLED | ✅ Wasm trap handlers compiled in (upstream default) |

Fuse #8 was resolved against the **upstream `@electron/fuses` source**, not guessed.
`buildFuseV1Wire()` in `electron/fuses/src/index.ts` emits exactly nine bytes in this order:

```
RunAsNode, EnableCookieEncryption, EnableNodeOptionsEnvironmentVariable,
EnableNodeCliInspectArguments, EnableEmbeddedAsarIntegrityValidation,
OnlyLoadAppFromAsar, LoadBrowserProcessSpecificV8Snapshot,
GrantFileProtocolExtraPrivileges, WasmTrapHandlers
```

This matches the observed `fuseLength = 9` exactly, which independently corroborates
index 7 = `GrantFileProtocolExtraPrivileges` and closes the table at index 8.
Source: <https://github.com/electron/fuses/blob/main/src/index.ts>

**Correction C-C — fuse decoder mis-decoded 4 fuses as "UNKNOWN".** The prior tool in
`evidence/fuses.js` treated only `0x72` and `0x31` as meaningful and printed
`UNKNOWN(0x30)` for the rest. In the Electron wire format `0x30` is ASCII `'0'`, which
means **DISABLED**. The rebuilt reader (`evidence/fuses2.js`) decodes all 9 correctly.
This correction changes four fuses from "unknown" to **DISABLED** — i.e. from
*unassessable* to *secure*. Left visible per G8.

**Overall:** the fuse posture is strong. Three of the classic Electron local-privilege-
escalation vectors (`RunAsNode`, `NODE_OPTIONS`, `--inspect`) are all **disabled**, and
asar integrity validation plus `OnlyLoadAppFromAsar` are both **enabled**, meaning a
patched `app.asar` or a swapped app directory will not load.

The one fuse worth attention is #7, `GrantFileProtocolExtraPrivileges = ENABLED`. This
grants `file://` URLs additional capabilities. Given the app loads local artifact HTML
through `file://` paths (artifact windows, `loadFile`), this is deliberate and expected
for the feature set — but it does mean local file content is treated as more privileged
than a web origin would be. This is the one setting where a reviewer should form their
own view.

---

## 5.3 Update channel

Three update mechanisms are present. Distribution is **MSIX on Windows**; the other two are
cross-platform code paths.

| Mechanism | Evidence | Role on Windows |
|---|---|---|
| **MSIX / App Installer** | 199 × `msix`, 15 × `MSIX`, 20 × `Msix`, 10 × `appinstaller` | **Primary** |
| `autoUpdater` / Squirrel | 51 × `autoUpdater`, 17 × `AutoUpdater`, 19 × `squirrel`, 2 × `Squirrel` | Cross-platform fallback |
| Release metadata | 31 × `releases`, 46 × `releaseS` | Feed consumption |

Publishing is `@electron-forge/publisher-gcs` — Google Cloud Storage as the release bucket.

### Signature verification of updates

The MSIX path inherits **Windows' own package-signing enforcement**: an MSIX update is
applied by the OS installer, which requires a valid Authenticode signature chaining to a
trusted root and matching the package identity in `AppxManifest.xml`. That is enforced by
Windows, not by application code, which is a stronger guarantee than an in-app check.

The Squirrel/autoUpdater path is the one that would need application-level verification.
**Not verified in this pass:** whether `autoUpdater` is configured with
`verifyUpdateCodeSignature`, and what its feed URL is. The strings confirm the code path
exists; they do not confirm its verification configuration. Stated as open.

### The `autoUpdatesChannel` setting

`~/.claude/settings.json` is recorded in the queue as containing
`{"autoUpdatesChannel": "latest"}`. That file was **not opened** in this engagement — it is
user data and out of scope. The value is carried forward from the queue as a prior claim,
not re-derived here.

Corresponding application-side channels observed in the corpus include `latest`, and the
release-selection code is what consumes this value. Whether `latest` implies
`allowDowngrade`, and what the failure behaviour is when the feed is unreachable, was not
traced. Open.

---

## 5.4 Claims in this report

| # | Claim | Method | Verifiable from |
|---|---|---|---|
| C5.1 | All 6 examined binaries Authenticode-`Valid` | `Get-AuthenticodeSignature` | live query, repeatable |
| C5.2 | Signer is `CN="Anthropic, PBC"`, SERIALNUMBER 4860621, DE/US | certificate subject | live query |
| C5.3 | Issuer DigiCert Trusted G4 Code Signing RSA4096 SHA384 2021 CA1 | chain | live query |
| C5.4 | `claude.exe` carries a DigiCert timestamp countersignature | `TimeStamperCertificate` | live query |
| C5.5 | MSIX package signature present (`AppxSignature.p7x`, 10,547 B) | file + SHA-256 | `manifest.tsv` |
| C5.6 | Fuse sentinel at file offset `0xbe244b8` | byte scan | `evidence/fuses2.js` |
| C5.7 | `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments` all DISABLED | fuse decode | `evidence/fuses2.js` |
| C5.8 | `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar` both ENABLED | fuse decode | `evidence/fuses2.js` |
| C5.9 | `GrantFileProtocolExtraPrivileges` ENABLED | fuse decode | `evidence/fuses2.js` |
| C5.10 | MSIX is the primary Windows update mechanism | 199 × `msix` + 10 × `appinstaller` in code | `evidence/sandbox-update.txt` |
| C5.11 | Release bucket is Google Cloud Storage | `package.json` `@electron-forge/publisher-gcs` | `package.json` |
| C5.12 | `autoUpdater` verification config **not** determined | — | open item |

### Corrections recorded in this report

**C-C — four fuses mis-decoded as UNKNOWN.** See §5.2. Corrected to DISABLED by rebuilding
the decoder against the Electron wire specification. Left visible per G8.

---

## 5.5 Open items for this section

1. `autoUpdater` feed URL and whether `verifyUpdateCodeSignature` is set — **not verified**.
2. `~/.claude/settings.json` not read (user data, out of scope); `autoUpdatesChannel: latest`
   is a prior claim, not re-derived.
3. ~~Fuse #8 has no name~~ — **RESOLVED**: fuse #8 is `WasmTrapHandlers`, ENABLED.
   Confirmed against upstream `electron/fuses` `buildFuseV1Wire()`, whose nine-byte order
   matches the observed `fuseLength = 9`. See §5.2.
4. CSP policy **contents** (19 occurrences counted in report 03) were not parsed.
