# 01 — Artifact Manifest

**Target:** Claude Desktop 2.31226.1.0 (MSIX, x64)
**Package root:** `C:\Program Files\WindowsApps\Claude_2.31226.1.0_x64__pzs8sxrjxfjjc\`
**Date:** 2026-10-13
**Method:** Static only. Nothing was launched, executed, or debugged. No user data
directories (`~/.claude/`) were opened.

---

## 1.1 How this manifest was produced

| Property | Value |
|---|---|
| Method | `Get-FileHash -Algorithm SHA256` over each file, plus `Get-ChildItem -Recurse -File` for enumeration |
| Scope | Package root files, `app\*`, `app\resources\*`, `app\resources\app.asar.unpacked\**`, `app\resources\ion-dist\*` |
| Files hashed | **104** |
| Char counts | Computed via `[System.IO.File]::ReadAllText()` for text-like extensions only; binaries left blank |
| Obfuscation | Not applicable — this is a signed MSIX containing a standard Electron `app.asar` |
| Full data | `../evidence/manifest.tsv` |

### Note on the MSIX read method

`C:\Program Files\WindowsApps` denies directory listing but permits traversal into a
known package folder. Enumeration therefore started **inside** the package root, not at
`WindowsApps`. This is why the manifest is complete for the package contents but cannot
enumerate sibling Claude versions.

---

## 1.2 Principal artifacts

| Path | Bytes | SHA-256 (full) |
|---|---:|---|
| `app\claude.exe` | 246,402,896 | `0109485c3812fa9c6fbc8bfd1c9c390dad4d25a538bbbd0d95e8286283a94bfb` |
| `app\resources\app.asar` | 44,590,401 | `efa9e2310cf943b333b153c093babb8b5a92f80a23cb68764dba9b29a0801d4a` |
| `app\resources\cowork-svc.exe` | 13,605,200 | `a2c071ded0b44cce3a0b9a34511a60b0d1c72bc99b77b5c984f07bb2c6cf98c2` |
| `app\resources\claude-ssh-askpass.exe` | 2,648,912 | `e72c941bfd07400dd05367df81362de23fbc7ee80f8edb53d455ba13680e77b8` |
| `app\resources\claude-ssh-broker.exe` | 2,599,248 | `e6a3a0b8ee7b6919465d9b6a7942c7fa94fa60e9278274cde1b0011b18013316` |
| `app\resources\claude-ssh-proxy.exe` | 1,976,144 | `b0a356c08ff48796680ee488e266dc77232564d980d954463e6509bac1b2d9a7` |
| `app\resources\chrome-native-host.exe` | 1,130,832 | *(see manifest.tsv)* |
| `app\resources\smol-bin.x64.vhdx` | 37,748,736 | *(see manifest.tsv)* |
| `AppxManifest.xml` | 11,421 | `d744ed1b9bcac00fd2cea6cd63af6b66ae902d93298fec2cb19aa67ac0bd0685` |
| `AppxSignature.p7x` | 10,547 | `88d2e326df352ce177d9d1c567ac03b98d6188458c85a367897e6719452f509e` |
| `app\version` | 6 | `16b920d4bf144f494b7e66fc70a82bfadb1f036710dacca982917044be1aa83e` |

---

## 1.3 Byte count vs char count (G9)

Byte count ≠ char count is **demonstrated**, not assumed, in this artifact:

| File | Bytes | Chars | Delta | Cause |
|---|---:|---:|---:|---|
| `app\resources\en-US.json` | 56,092 | 55,805 | −287 | multi-byte UTF-8 (accented/typographic chars) in locale data |
| `app\resources\ion-dist\custom-3p-gated-imports.json` | 35 | 35 | 0 | pure ASCII |
| `app\resources\ion-dist\scc.json` | 151 | 151 | 0 | pure ASCII |
| `AppxManifest.xml` | 11,421 | 11,418 | −3 | BOM / line-ending bytes |
| `app\version` | 6 | 6 | 0 | `44.4.3` + newline |

The **JS corpus is byte-identical to char count** (23,047,420 = 23,047,420), which is a
meaningful fact rather than a coincidence: the minified `.vite/build` tree is pure ASCII,
so byte offsets and character offsets coincide there. This is why byte-offset arithmetic
used in the sandbox analysis is safe — but only within that tree.

---

## 1.4 Extracted corpus

`app.asar` was extracted to `%TEMP%\claude-src` (read-only analysis; **not copied or
redistributed**, per G7).

| Metric | Value |
|---|---:|
| Files extracted | **420** |
| Total bytes | **36,137,122** |
| `.js`/`.mjs`/`.cjs` in `.vite/build` | **356** |
| `.js`/`.mjs` in whole tree | **408** |
| `package.json` version | `2.31226.1` |
| `package.json` main | `.vite/build/index.pre.js` |
| `package.json` name | `@ant/desktop` |

### Vendor dependency signal (from `package.json`)

Security-relevant dev/prod dependencies, read directly from the shipped manifest:

- `@ant/ipc-codegen` — the IPC code generator that defines the channel scheme (see report 02)
- `@ant/security`, `@ant/dist-guards`, `@ant/managed-config`
- `@ant/cowork-win32-service` — the Windows service behind `cowork-svc.exe`
- `@ant/claude-ssh`, `@ant/ssh-askpass` — SSH trust boundary
- `@electron-forge/plugin-fuses` + `@electron/fuses ^2.1.3` — fuse flipping at build time
- `@electron-forge/publisher-gcs` — Google Cloud Storage as the release bucket
- `@anthropic-ai/claude-agent-sdk 0.3.295` — agent SDK (agentic tool execution surface)
- `node-pty 1.2.0-beta.14` (optional) — PTY allocation
- `playwright-core 1.57.0` — browser automation

---

## 1.5 Excluded, with reason (stated, not silently dropped)

| Item | Reason |
|---|---|
| `~/.claude/` (5 files, `settings.json` only) | **User data.** Contains the user's own conversation/memory data. Explicitly out of scope; never opened. The single known content is `{"autoUpdatesChannel": "latest"}`, recorded in queue.md. |
| `LICENSES.chromium.html` (20.5 MB) | Upstream Chromium, not vendor code |
| `*.pak`, `icudtl.dat`, `resources.pri` | Upstream Chromium resources |
| `dxcompiler.dll`, `vk_swiftshader.dll`, `d3dcompiler_47.dll`, `dxil.dll`, `vulkan-1.dll`, `ffmpeg.dll` | Upstream Chromium/Electron graphics + media libs |
| 50+ locale `.json` files | Only `en-US.json` examined, for the byte/char demonstration. No claim is made about locale content. |

---

## 1.6 Claims in this report

| # | Claim | Method | Verifiable from |
|---|---|---|---|
| M1.1 | 104 files hashed | `Get-FileHash SHA256` | `evidence/manifest.tsv` |
| M1.2 | `claude.exe` SHA-256 = `0109485c…` | same | `evidence/manifest.tsv` |
| M1.3 | JS corpus is byte==char (pure ASCII) | `Buffer.byteLength` vs `.length` summed over 356 files | `evidence/decode-ipc.js` stdout |
| M1.4 | `en-US.json` byte≠char by 287 | `ReadAllText().Length` vs file size | `evidence/manifest.tsv` |
| M1.5 | Extraction = 420 files / 36,137,122 B | `Get-ChildItem -Recurse -File` | reproducible command |
| M1.6 | Fuse sentinel present at file offset `0xbe244b8` | byte scan for `dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX` | `evidence/fuses2.js` |
