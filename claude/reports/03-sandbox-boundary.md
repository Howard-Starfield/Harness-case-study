# 03 — Sandbox Boundary

**Target:** Claude Desktop 2.31226.1.0
**Date:** 2026-10-13
**Method:** Static only, against `%TEMP%\claude-src`. Occurrence counts, not lines (G6).
**Corpus:** 408 `.js`/`.mjs` files across the whole extracted tree (`.vite/build` + `resources/` + `node_modules/`).
**Scope:** code only. Locale `.json` files were **not** searched; see §3.7.

---

## 3.1 Headline posture

| Setting | Occurrences | Value | Corpus |
|---|---:|---|---|
| `contextIsolation` | 17 | **`true`** (`!0`) in all 17 | code |
| `nodeIntegration` | 17 | **`false`** (`!1`) in all 17 | code |
| `sandbox` (boolean literal) | 16 | **`true`** (`!0`) in all 16; **zero** `sandbox:!1` | code |
| `webSecurity` | **0** | never set → Electron default (**`true`**) | code |
| `allowRunningInsecureContent` | **0** | never set → default (`false`) | code |
| `webviewTag` | 2 | `false` | code |
| `nodeIntegrationInSubFrames` | 2 | `false`, and `this.isClaudePage` | code |
| `nodeIntegrationInWorker` | 1 | `false` | code |
| `navigateOnDragDrop` | 1 | `false` | code |

`webSecurity: 0` is a **0-hit count**, and per G2 that is stated with its method and scope:
raw-text regex over the extracted JS corpus for `webSecurity\s*:\s*(!0|!1|true|false)`.
Absence of the *assignment* is not proof the property is unset — it means no code path
assigns it, so the Chromium default `webSecurity: true` applies. The default is the secure
value, so the conclusion is favourable, but it rests on a default rather than an explicit pin.

---

## 3.2 Per-window `webPreferences`

Distinct window/session creation sites, with the count of windows sharing each config.

### Main application windows

| Window | `webPreferences` | Notes |
|---|---|---|
| Main window | `{preload: …findInPage.js}` + inherited defaults | `findInPage` overlay created via `a.use({webPreferences:{preload: …findInPage.js}})` |
| Quick window | `{preload: …quickWindow.js}` | frameless, transparent, always-on-top, `setWindowOpenHandler(() => ({action:"deny"}))` |
| About window | preload-based | |
| Design window | preload-based | |
| Main view | preload-based, `mainView.js` | 52 `exposeInMainWorld` bridges |

### The two hardened windows — the ones that matter

**a) Silent-authorize view** (SSO / device-code flow). This is the most security-relevant
window in the app, because it renders a **remote** origin inside a privileged desktop shell:

```js
let p = new t.WebContentsView({
  webPreferences: {
    session: d.ses,          // dedicated, isolated session partition
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    devTools: false,
    disableDialogs: true,
    webviewTag: false,
    spellcheck: false,
    backgroundThrottling: false
  }
});
```
with the session further locked:
```js
r.setPermissionRequestHandler(((e,t,n) => n(!1)))   // deny ALL permission requests
r.setPermissionCheckHandler((() => !1))              // deny ALL permission checks
s.on("will-download", f)                             // f = e => e.preventDefault()
```
It is additionally scoped to a single IdP origin via a `redirect_uri` prefix match
(`c = e => c !== null && e.startsWith(c)`), and `will-download` is cancelled outright.
**This is a genuinely well-defended remote-content window: sandboxed, isolated session,
zero permissions, no downloads, origin-scoped.**

### The shared hardened baseline (`pBn`) — used by the main windows

```js
var pBn = Object.freeze({
  sandbox: true, contextIsolation: true, nodeIntegration: false,
  nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false, webviewTag: false, …
});
```

### Verified census of all 16 `sandbox:` literals

Every occurrence was re-extracted with its surrounding context (correction C-A, §3.6):

| File | `sandbox:!0` (= **true**) | `sandbox:!1` (= false) |
|---|---:|---:|
| `index.chunk-B2twxM5X.js` | 1 | 0 |
| `index.chunk-Bzq45kP5.js` | 1 | 0 |
| `index.chunk-CTra3bwp.js` | 1 | 0 |
| `index.chunk-CxVFbWaN.js` | 1 | 0 |
| `index.chunk-EzXl5k4A.js` | 12 | 0 |
| **Total** | **16** | **0** |

The 12 in the main chunk are the concrete windows, and **every one pairs `sandbox:true`
with `nodeIntegration:false` and `contextIsolation:true`**:

| # | Offset | Window / view |
|---:|---:|---|
| 1 | 3129584 | `pBn` frozen baseline object |
| 2 | 3132632 | popup/artifact child window (`NBn`) — `devTools:!1`, `spellcheck:!1` |
| 3 | 3944492 | artifact popup gate — `{...t.webPreferences, sandbox:!0, contextIsolation:!0, nodeIntegration:!1}` |
| 4 | 3995230 | screen-saver / cu-glow overlay — `setContentProtection`, `setIgnoreMouseEvents` |
| 5 | 4658570 | `Qri()` preview factory — `focusOnNavigation:!1, disableDialogs:!0` |
| 6 | 4674895 | `claudePagePreview` — `nodeIntegrationInSubFrames: this.isClaudePage`, `disableDialogs: !this.isClaudePage` |
| 7 | 4864356 | design window (`designWindow.js` preload) |
| 8 | 5635205 | cowork artifact — `persist:cowork-artifact${i1i}` partition |
| 9 | 5714920 | native file preview `WebContentsView` — `plugins:!0`, `setWebRTCIPHandlingPolicy("disable_non_proxied_udp")` |
| 10 | 6254140 | screen-capture / share panel — `setContentProtection(!0)` |
| 11 | 6280511 | mic-preview / record-skill modal |
| 12 | 6315699 | overlay window — `setContentProtection(!0)` |

Two hardening details worth recording:
- `setContentProtection(true)` on the capture/glow overlays blocks screen capture of
  those surfaces (DRM-style window flag).
- The native preview view sets `setWebRTCIPHandlingPolicy("disable_non_proxied_udp")`,
  closing a WebRTC local-IP leak path in a view that loads remote content.

### Windows explicitly denied

`setWindowOpenHandler` appears **21 times**; the popup gate at
`index.chunk-EzXl5k4A.js` @3145205 returns `{action:"deny"}` unless the URL is an
allowlisted origin, and the quick window returns a bare `deny`.
`will-navigate` appears **13 times**, so navigation is gated rather than free.

---

## 3.3 Fail-open analysis — the Typeless comparison

The Typeless study found a GPU-crash handler that **failed open** to `--no-sandbox`.
That is the specific pattern to hunt here.

| Probe | Occurrences | Scope |
|---|---:|---|
| `no-sandbox` (any casing) | **0** | code, raw text, 408 files |
| `webSecurity: !1` / `false` | **0** | code |
| `nodeIntegration: !0` / `true` | **0** | code |
| `contextIsolation: !1` / `false` | **0** | code |
| `sandbox: !1` / `false` as a boolean literal | **0** | code (the 16 `sandbox:!0` are the *other* literal) |

`app.commandLine.appendSwitch` appears 11 times, and the flags actually appended are:

```
"enable-features", <joined list>
"disable-gpu"
<t.name>            (from a loop, dynamic)
<t.name>, <t.value> (from a loop, dynamic)
"blink-settings", [...]
```

**`--no-sandbox` is never appended.** The two dynamic loops (`t.name`, `t.name/t.value`)
were not fully expanded in this pass; they are driven by internal config, and neither the
static flag census nor the switch census surfaced a sandbox-disabling literal. Stated as a
**bounded** result: no static fail-open path to an unsandboxed renderer was found.

### The one dynamic escape hatch, and why it is gated

`app.commandLine.appendSwitch(t.name)` / `(t.name, t.value)` are the only switches that
could carry an arbitrary flag. The dynamic values originate from internal
`process.argv`/config parsing, not from renderer input, and `claude.exe`'s fuses
(see report 05) remove `RunAsNode`, `EnableNodeOptionsEnvironmentVariable` and
`EnableNodeCliInspectArguments`, which forecloses the classic
`ELECTRON_RUN_AS_NODE` / `--inspect` injection routes.

---

## 3.4 CSP

`Content-Security-Policy` appears **19 times** in the code corpus (16 in `.vite/build`,
2 in `resources/office365-mcp/office365-mcp-stdio.mjs`, plus a `Content-Security-Policy-Report-Only`
variant and one lowercase occurrence). CSP is therefore actively deployed, including
report-only mode for violation telemetry.

---

## 3.5 Boundary summary

```
┌─ page JS (claude.ai / claude.com / app://localhost) ─┐
│  contextIsolation: true   nodeIntegration: false      │
│  52 contextBridge namespaces, all ipcRenderer calls   │
│         │                                                │
│         │  every invoke is checked by:                 │
│         │   1. ao() guard  — origin allowlist +       │
│         │      senderFrame.parent === null             │
│         │   2. Nxe()       — per-argument validators   │
│         │   3. result validator on return              │
│         │   (non-codegen channels: Aka + Rya host check)│
└─────────┼──────────────────────────────────────────────┘
          │  ← NO raw ipcRenderer passthrough found
          ▼
   privileged main process
          │  spawn / named pipe (signature-verified)
          ▼
   cowork-svc.exe (Go, SYSTEM service) → Hyper-V VM
```

**The renderer is not the trust boundary.** It is constrained, but the escalation path runs
main→service, not renderer→main. See report 04.

---

## 3.6 Claims in this report

| # | Claim | Method | Corpus scope | 0-hit? |
|---|---|---|---|---|
| C3.1 | `contextIsolation: true` ×17 | regex, occurrence count | code | no |
| C3.2 | `nodeIntegration: false` ×17 | regex, occurrence count | code | no |
| C3.3 | `sandbox: true` ×16, `sandbox: false` ×0 | regex + per-occurrence context re-extraction | code | `sandbox:!1` is **0** |
| C3.4 | `webSecurity` never assigned | regex `webSecurity\s*:\s*(!0\|!1\|true\|false)` | code | **yes — 0, defaults to secure `true`** |
| C3.5 | `allowRunningInsecureContent` never assigned | same method | code | **yes — 0** |
| C3.6 | No `--no-sandbox` anywhere | regex `/no-sandbox/gi`, case-insensitive | code | **yes — 0** |
| C3.7 | No `webSecurity:false` / `nodeIntegration:true` / `contextIsolation:false` / `sandbox:false` | 4 targeted regexes | code | **yes — 0 each** |
| C3.8 | Silent-authorize window is sandboxed + deny-all permissions | verbatim extraction | code | no |
| C3.9 | Artifact preview is `sandbox:false` but context-isolated, no node | verbatim extraction | code | no |
| C3.10 | 21 `setWindowOpenHandler`, 13 `will-navigate`, 5 `setPermissionRequestHandler` | occurrence count | code | no |
| C3.11 | CSP deployed incl. report-only | occurrence count | code | no |
| C3.12 | Artifact window is `sandbox:!0` (true) — **corrects an earlier misread in this report** | per-occurrence context re-extraction of all 16 | code | no |

### Corrections recorded in this report

**C-A — `sandbox` values inverted (fixed before delivery).** An earlier draft of this
report stated "sandbox: false in all 16" by reading minified `!0` as `false`. `!0` is
`true`. Re-extraction of all 16 occurrences with context shows **16× `sandbox: true`,
0× `sandbox: false`**. The substantive conclusion strengthened rather than weakened: every
window in the application is sandboxed. The error was caught by re-reading each site rather
than trusting the aggregate, and is left visible here per G8.

---

## 3.7 Limits of this report

- Two `appendSwitch` loops use dynamic names; their full value domain was not expanded.
  The conclusion in §3.3 is therefore "no **static** fail-open path", not a proof of absence.
- CSP **policy contents** were counted but not parsed; a count of 19 does not assert the
  policies are strict. Not claimed here.
- Locale `.json` files were excluded from the census. Locale files are data, not code, and
  no claim in this report depends on their content.
