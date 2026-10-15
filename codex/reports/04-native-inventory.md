# Codex 26.1007 — Report 04: Native Inventory & Entry Points

Security-posture scope only: which native code loads into privileged processes, what lives outside the
integrity-checked container, and which binaries are agent payloads.

---

## 4.1 The ASAR integrity boundary

`app.asar` is **567,399,024 B** / 20,988 entries. Files stored *outside* it:
**3,301 files / 1,837,324,271 B**.

Most of that volume is `codex.exe` (334 MB) plus the CUA runtime, but the posture-relevant fact is
this: **`app.asar.unpacked/` contains 8 executable native binaries that are not in the ASAR payload.**

| File | Bytes | What it is |
|---|---:|---|
| `node_modules/node-pty/build/Release/pty.node` | 1,809,712 | ConPTY pseudoterminal binding |
| `node_modules/node-pty/build/Release/conpty.node` | 1,837,360 | ConPTY binding |
| `node_modules/node-pty/build/Release/conpty_console_list.node` | 858,416 | console enumeration |
| `node_modules/node-pty/build/Release/winpty.dll` | 1,272,624 | **legacy WinPTY DLL** |
| `node_modules/node-pty/build/Release/winpty-agent.exe` | 1,393,456 | **separate agent process** |
| `node_modules/better-sqlite3/build/Release/better_sqlite3.node` | 3,115,312 | SQLite |
| `…/@serialport/bindings-cpp/build/Release/bindings.node` | 877,872 | serial port |
| `…/node-hid/build/Release/HID.node` | 1,884,464 | HID device access |

### Correction C-E — "0 native `.node` modules" was a method artifact

The asar index lists these 6 `.node` entries with sizes, but a walk of the *extracted tree* found
**0**. That looked like a contradiction and it is not: ASAR marks these files `unpacked`, so their
bytes are not in the `app.asar` payload at all and a payload-only extraction cannot produce them. They
are in `app.asar.unpacked/` on disk. Reporting "the app ships no native modules" from the extracted
tree would have been wrong by 6 modules plus a DLL and an EXE.

### Finding F2 — native code outside the ASAR integrity boundary

Eight native binaries — including the **PTY stack that backs every terminal command the agent runs** —
sit outside `app.asar`. Any integrity validation scoped to the ASAR container does not cover them.

**Severity: low, and the mitigation is real.** These files live under `C:\Program Files\WindowsApps`
inside an MSIX package that is (a) ACL-protected so a standard user cannot write there and (b)
covered by the `Store` package signature. So the realistic attacker model requires either
Administrator rights or a Store-signing compromise, both of which already win outright. The value of
the finding is architectural, not exploitability: it identifies the exact set of binaries where an
ASAR-scoped integrity control would stop applying.

I have **not** tested whether ASAR integrity validation is even enabled for this package — see the
fuse result in report 05, which is inconclusive.

## 4.2 In-package native addons (`app\resources\native\`)

Five `.node` modules, all outside the ASAR like the above:

| Module | Bytes | Role |
|---|---:|---|
| `windows-updater.node` | 1,888,560 | **`stagePackage` / `activateStagedPackage`** — the auto-update path |
| `windows-account.node` | 1,363,248 | Windows account enumeration |
| `remote-control-device-key.node` | 1,122,608 | remote-control device key |
| `hid-topology-watcher.node` | 1,126,192 | HID topology |
| `computer-use-app-icons.node` | 170,288 | computer-use icons |

`windows-updater.node` is the one that matters for privilege: it is the native half of the Path A
elevation flow in report 03 §3.4. Its internal validation is not statically readable.

## 4.3 Computer-Use runtime (`cua_node/`)

A second, independent Node runtime is shipped outside the ASAR:

| Path | Bytes |
|---|---:|
| `cua_node/bin/node.exe` | 93,381,936 |
| `cua_node/bin/node_repl.exe` | 34,053,680 |
| `@oai/sky/bin/windows/swift/x64/codex-computer-use-swift.exe` | 56,534,320 |
| `@oai/cua/bin/windows/codex-computer-use.exe` | 1,551,152 |
| `@oai/sky/bin/windows/codex-computer-use.exe` | 1,551,152 |
| `swift/x64/MSVCP140.dll`, `VCRUNTIME140.dll`, `VCRUNTIME140_1.dll` | 731,024 combined |
| `libvips-42.dll` + `libvips-cpp` + `sharp-win32-x64-0.35.4.node` | ~19.5 MB |

`codex-computer-use-swift.exe` at 56.5 MB is a **Swift** binary — the only non-Rust/non-C++/non-Chromium
language in the package, and a second computer-use implementation alongside the CUA one. Both are
agent control surfaces.

**Minor posture note:** the Swift binary ships **its own copies of the MSVC runtime**
(`MSVCP140.dll`, `VCRUNTIME140.dll`, `VCRUNTIME140_1.dll`) rather than relying on the system
redistributable. This is a common packaging choice that avoids "missing VC++ runtime" failures, but
it also means a DLL in the package directory sits in the process's search path. Not a finding on its
own; recorded for completeness.

`cua_node` also carries `classic-level` prebuilds for **10 platforms** (android-arm/arm64, darwin,
linux-arm/armv6/armv7/armv8/x64/musl, win32-ia32/x64) — dead weight on a Windows package, and a
reminder that the bundle is cross-platform, not Windows-tuned.

## 4.4 Plugin system

`app\resources\plugins\openai-bundled\` — 10 bundled plugins: browser, chrome, code-review,
codex-app-tools, computer-use, deep-research, latex, unified-computer-use, visualize (plus the
signature tree). Each carries a native `classic-level` prebuild set, and `plugins/openai-bundled/
plugins/chrome/extension-host/windows/x64/extension-host.exe` (879,408 B) is a Chrome extension host.

### Finding F6 — one public key shared by all ten plugins

`app\resources\plugin-signatures\openai-bundled\` holds 10 plugin directories. Each contains:

- `plugin.signature.json` — 523 B
- `plugin.tar.gz`
- `public-key.der` — 294 B

**All ten `public-key.der` files share one SHA-256** (`1be9c028…`). There is a single publisher key
for the entire bundled-plugin set, plus a `receipt.json` (1,550 B).

This is architecturally normal for a first-party bundle — one vendor, one key — and it is the
*expected* configuration. It is recorded because the interesting question is not "are they
different" but "what happens when a key is reused for third-party or user-installable plugins."
If a user-installable plugin were ever signed under this same root, vendor and third-party trust
would collapse into one identity. The bundled tree gives no evidence that happens; I did not find or
test a third-party plugin path, and I am **not** claiming the key is misused. Recorded as an
architectural property to revisit if plugin scope ever widens.

## 4.5 Tooling payloads

`app\resources\tectonic\tectonic.exe` (55,059,760 B) — TeX typesetting, invoked by the `latex` plugin.
`rg.exe` (4,352,304 B) — ripgrep, mapped to the friendly name `ripgrep` in
`application-network-startup-CfAQmSYg.js`:

```js
var Ft=[`codex-code-mode-host.exe`,`codex-windows-sandbox-setup.exe`,`codex-command-runner.exe`],
    It=new Map([[`codex.exe`,`codex`],[`codex-code-mode-host.exe`,`code-mode-host`],
                [`codex-windows-sandbox-setup.exe`,`sandbox-setup`],
                [`codex-command-runner.exe`,`command-runner`],[`rg.exe`,`ripgrep`]])
```

This is the app's own binary registry. Note `codex-windows-sandbox-service.exe` is **absent** from it
— the map names four tools plus ripgrep, not the sandbox service. The service is presumably launched
by `codex.exe`, not by the Electron main process. Consistent with `sandbox-service` = 0 occurrences in
both JS corpora.

## 4.6 Entry points

| Entry | Path | Notes |
|---|---|---|
| `package.json` `main` | `.vite/build/early-bootstrap.js` | first JS executed |
| Launcher | `app\Codex.exe` (20,272 B) → `ChatGPT.exe` | thin stubs; no Electron/Chromium markers |
| Actual runtime | `app\chrome.dll` | Chromium 155 + Electron layer |
| Native app-server | `resources\codex.exe` (Rust) | 57-method JSON-RPC target |
| Build flavor | `codexBuildFlavor: prod` | from `package.json` |
| MSIX identity | `codexWindowsPackageIdentity: OpenAI.Codex` | AppContainer-capable |
| AppContainer core | `codexWindowsAppContainedCore: "1"` | ships a contained core |
| Publisher | `codexWindowsPackagePublisher: CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B` | |

`shouldIncludeWindowsAppContainedCore` returns true for every shipping flavor including `Prod`, and
`shouldIncludeWindowsSandboxService` is true for `Nightly` and `Prod` — so the sandbox service is
confirmed present in the production build, not a dev-only extra.

`allowDevtools(e){ return isInternal(e) }` — the **devtools menu item** is internal-builds-only. See
finding F4 in report 06 for the important caveat about what that does *not* cover.