# Codex 26.1007 — Report 02: IPC Surface

**Question under test:** is Codex's IPC a raw passthrough (Typeless's shape) or a validated allowlist (Claude's shape)?
**Answer:** a **small, bounded, sender-validated allowlist** — 24 main-side registrations across 17 named channels. It is not a passthrough, and it is an order of magnitude smaller than Claude Desktop's.

Corpus: MAIN 34 files / 10,333,165 B; RENDER 14,782 files / 383,489,825 B. Occurrence counts, raw text.
Evidence: `evidence/round5.js` → `round5.txt`, `evidence/round4.js` → `round4.txt`, `evidence/census.js` → `codex-census.json`.

---

## 2.1 Registration census (corrected)

| Shape | Occurrences | Files |
|---|---:|---|
| `ipcMain.handle` | **7** | `bootstrap-487kJHw_.js`, `main-BklS_2Y2.js` |
| `ipcMain.on` | **17** | `bootstrap-487kJHw_.js`, `main-BklS_2Y2.js` |
| `ipcMain.handleOnce` | 0 | — |
| `ipcMain.removeHandler` | 1 | `main-BklS_2Y2.js` |
| `ipcMain.removeAllListeners` | 0 | — |
| `ipcRenderer.send` | 10 | `browser-page-preload.js`, `preload.js` |
| `ipcRenderer.invoke` | 11 | `browser-page-preload.js`, `preload.js` |
| `ipcRenderer.sendSync` | 8 | `browser-page-preload.js`, `preload.js` |
| `ipcRenderer.postMessage` | 2 | `preload.js`, `sandbox-preload.js` |
| `webContents.send` | 1 | `main-BklS_2Y2.js` |

**24 main-side registrations total.** There is no dynamic channel-name registration: every
`ipcMain.handle`/`ipcMain.on` call site is visible in the corpus.

### Correction C-D — a first pass produced a fake number

The initial census script reported `34` for all six IPC shapes. That was a method defect, not a
finding: the counter incremented once per **file** per shape instead of counting **matches**, and
every shape happened to appear in the same 34 MAIN files. The uniform value was the tell. Corrected
figures are above. Any Codex IPC number from before this correction should be discarded.

## 2.2 Channel names

Only **one** channel is a plain string literal:

```
codex_desktop:check-for-updates      (bootstrap-487kJHw_.js)
```

The other **17 distinct channels** in `main-BklS_2Y2.js` are minified constants passed as `g.<name>`:

```
g.pt  g.Ct  g.jt  g.wt  g.St  g.xt  g.Et  g.Ft  g.vt
g.Ot  g.Tt  g.kt  g.Dt  g.Mt  g.Nt  g.zt  g.At
```

Plus `t.createKey(...)` in `bootstrap-487kJHw_.js`, which belongs to Sentry's parameterized telemetry
transport (`window.__SENTRY_IPC__[namespace]`), not to application IPC.

Because the constants are bound at runtime, I report the **count** (17) as verified and the
**names** as unresolved — resolving `g.jt` to its literal would require reconstructing the minifier's
binding table across chunk boundaries. I am not going to guess them.

**Surface size comparison:** Codex 17 named channels + 1 literal vs Claude Desktop's 1,294 handler
channels. The difference is architectural, not a measurement difference: Claude ships a codegen'd
handler registry (`ao(PREFIX,"Iface",GUARD,{methods,events})`), Codex ships a handful of fixed
main↔preload channels and routes everything else over a typed protocol to a native app-server.

## 2.3 Sender validation — present, and it fails closed

Codex does real sender validation, in three independent layers.

**Layer 1 — registered webContents allowlist.**
```js
isTrustedIpcSender(e,t){
  return e.id!=null && !this.registeredWebContentsIds.has(e.id) ? !1
         : x1e({sender:e, senderFrame:t, moduleDir:this.options.moduleDir})
}
```
A `webContents` whose id is not in the registered set is rejected outright; otherwise the sender is
further validated by `x1e` against sender + frame + module dir. (`main-BklS_2Y2.js` @3729570)

**Layer 2 — the trust check gates each handler.**
```js
_.ipcMain.handle(g.jt, async(n,r,i)=>{ if(!t(n)) return {id:null}; … })
_.ipcMain.handle(g.wt, async(n,i)=>{ if(!F(n)) return; … })
f.ipcMain.handle(`codex_desktop:check-for-updates`, async e=>{ this.options.isTrustedIpcEvent(e) && await this.checkForUpdates() })
```
Untrusted senders get a **deny-shaped return**, not a throw and not a silent no-op. The third example
is the strongest form: the privileged action is inside the `&&`, so it is simply never reached.

**Layer 3 — top-frame check on the synchronous site-annotation path.**
```js
function kCe(e,t,n,r,i){
  let a={enabled:!1, siteAnnotationFeaturesEnabled:!0, siteAnnotationPermissionGranted:!1,
         isAgentControllingBrowser:!1, isAnnotationModeActive:!1};
  if(e.senderFrame==null || e.senderFrame!==t.mainFrame){ e.returnValue=a; return }
  let o=e.senderFrame.url, s=r(t,o);
  …
}
```
(`main-BklS_2Y2.js` @1515466) A sub-frame cannot use the main frame's authority, and the fallback
value is **deny-shaped** (`enabled:!1`). This is the same structural guarantee Claude's guards
provide, reached by a different implementation.

**Payload validation is present too** — `_.ipcMain.handle(g.St, …)` runs a Zod schema
(`ywe.safeParse`) and logs `Invalid browser sidebar runtime message received` before returning.
`_.ipcMain.on(g.xt, (e,t)=>{ if(!_r(t)){…}})` validates on the event path as well.

**Census of validation needles (MAIN):** `senderFrame` 6 · `frame.url` 4 · `isMainFrame` 52 ·
`webContents.id===` 14 · `event.sender` 0 · `sender.frame` 0 · `topFrame` 0.

## 2.4 The preload bridge

Only **3** `contextBridge.exposeInMainWorld` calls exist, all in `preload.js` (6,909 B):

```js
e.contextBridge.exposeInMainWorld(`codexWindowType`, T)
e.contextBridge.exposeInMainWorld(`electronBridge`, z)
e.contextBridge.exposeInMainWorld(`__SENTRY_IPC__`, window.__SENTRY_IPC__)   // inside try/catch
```

The renderer gets a single `electronBridge` object plus a window-type tag. `preload.js` also carries
a `MessagePort` handshake (`connect-app-host`) for a chunked host protocol
(`codex-host-chunked-message-v1`, with `start`/`chunk`/`end` kinds and validated `transferId` /
`sequence`). `sandbox-preload.js` (2,102 B) is the minimal sandboxed-renderer preload.

Because `contextIsolation` is on everywhere and only one bridge object is exposed, the renderer's
capability set is the bridge's method list — not ambient `ipcRenderer`.

## 2.5 Renderer cannot reach elevation_service.exe

This is the queue's headline question. Full results:

| Needle | MAIN | RENDER | Total |
|---|---:|---:|---:|
| `elevation_service` | **0** | **0** | **0** |
| `ShellExecuteEx` | 0 | 0 | 0 |
| `sandbox-service` | 0 | 0 | 0 |
| `codex-windows-sandbox` | 3 | 0 | 3 |
| `sandbox-setup` | 4 | 0 | 4 |
| `command-runner` | 4 | 0 | 4 |
| `elevator` | 0 | **1** | 1 |
| `elevat` (any) | 10 | 3,220 | 3,230 |

Method: literal regex over **raw text**, MAIN + RENDER, both `.js` and `.mjs`, excluding locale
`.json`. Calibration control needles `__dirname` and `ipcRenderer` both returned > 0 in the same
sweep, so the scanner demonstrably reads these files (`evidence/main-sites.txt`).

### Corrections C-B and C-C — two counts in the raw census are false

**C-B — `runas` in MAIN = 7 is entirely false positives.** All seven are the substring inside
`runAsync` (`runAsync:async e=>{…}`) in a data-migration table in `main-BklS_2Y2.js`. The true
MAIN count of `runas` as an elevation verb is **0**. The census also reports `runas` = 131 in RENDER;
that figure is **case-insensitive** (`/runas/gi`). Re-measured
(`evidence/runas-discrepancy.js` → `runas-discrepancy.txt`, **correction C-N**):

| Pattern | MAIN | RENDER | Total |
|---|---:|---:|---:|
| `/runas/g` case-sensitive | 0 | 121 | 121 |
| `/runas/gi` case-insensitive | 7 | **131** | 138 |
| `/\brunas\b/gi` word-bounded | 0 | **5** | 5 |

The 121-vs-131 gap is a regex **flag** difference, not a counting error. The defensible figure is the
word-bounded one: **5**, all non-elevation — 116 of the substring hits are the Latvian word for *run*
in `lv-LV` locale strings ("Runas terapija", "Runas burbulis"), `is-IS` adds `runasamskip`/`runaspjall`,
and `bat-54ba94408a32.js` adds one entry in a Windows command-vocabulary list. **Elevation-verb `runas`
across the entire JS corpus: 0.** Neither 121 nor 131 should be quoted as evidence of elevation.

**C-C — the single renderer `elevator` hit is an emoji table.** In
`webview/assets/browser-e8c5f9aed22b.js` @167390, inside a shortcode→emoji dataset:
`{n:[`lift`,`hoist`,`elevator`,`accessibility`], u:`1f6d7`, a:`13`}`. It is not an elevation
reference. Adjusted: renderer elevation-verb references = **0**.

## 2.6 What the MAIN `elevat` occurrences actually are

All 10 MAIN `elevat` hits are accounted for; none is a renderer→elevation path.

| File @ char | What it is |
|---|---|
| `bootstrap` @21484, @24418 | `allowServiceInstallElevation` — the **updater**'s service-install flag |
| `bootstrap` @51532, @51807 | `allowServiceInstallElevation:!0` passed to the MSIX/updater constructor |
| `bootstrap` @458984, @459037 | `hasDoNotDeElevateSwitch` — a **telemetry field** |
| `src` @296101, @296114 | `timedOutWindowsSandboxSetup` loop over `` [`elevated`,`unelevated`] `` |
| `src-CP7XXlpZ` @50412 | `allowElevatedChromeDecryption` — browser-profile import option |
| `worker.js` @861735 | `allowElevatedChromeDecryption` — same option in the worker schema |

Three distinct privilege themes, none of which is a renderer-initiated elevation call:

1. **Auto-update service install** — main process only, gated by `isTrustedIpcEvent`. Detailed in
   report 05.
2. **Windows sandbox setup** — driven by a typed request to the native app-server. Detailed in
   report 03.
3. **`allowElevatedChromeDecryption`** — a *browser profile import* option for reading Chrome's
   protected credential store, i.e. asking Windows DPAPI for a credential the user may be prompted
   to unlock. It is not process elevation and is not an elevation-service call.

**Correction D-Q:** `do-not-de-elevate` appears exactly once, inside a
`windows_runtime_framework_identity_unavailable` telemetry payload. Codex **reads** the switch but
only records it for logging; the de-elevation behaviour itself lives in Chromium (`chrome.dll`),
which is out of scope.

## 2.7 Verdict

An unprivileged renderer **cannot** reach `elevation_service.exe` by name from JavaScript: zero
literal references across 14,816 JS files in both corpora, no dynamic channel that accepts a program
name, and a sender-validated bridge as the only renderer capability. The elevation service is invoked
by the Chromium browser process, not by the app's JS. See report 03 for the full boundary map.

This is a **negative result stated with its scope**: raw-text literal search over JS, excluding
locale `.json` and excluding the native binaries' own string tables (which do contain the service
name, as documented in report 03).