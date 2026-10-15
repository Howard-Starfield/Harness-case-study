# 02 — IPC Surface

**Target:** Claude Desktop 2.31226.1.0
**Date:** 2026-10-13
**Method:** Static only, against `%TEMP%\claude-src` extracted from `app.asar`.
**Corpus:** 356 `.js`/`.mjs`/`.cjs` files under `.vite/build`, **23,047,420 bytes = 23,047,420 chars** (pure ASCII, so byte offset == char offset).
**String pool:** The corpus is **raw text, not an encoded string pool**. No obfuscation key applies to this artifact — the minification is identifier mangling only. Therefore no decoder was required for string recovery, and the per-file-key rule (G10) is vacuous here. What *did* require a decoder was the **channel-name construction**, below.

---

## 2.1 The prior attempt was methodologically void — and why

The evidence file left by the earlier run (`evidence/ipc-inventory.txt`) reported:

```
ipcMain.handle   : 2
ipcMain.on       : 6
ipcRenderer.invoke: 1250
ipcRenderer.on   : 226
ipcMain.handle with literal channel : 0
```

and computed a "set difference" of 8 unmatched renderer channels against 0 handlers.

**That set-difference is meaningless and I am not carrying it forward.** The reason: the
main process almost never spells an IPC channel name as a literal string. It builds the
name at runtime through a code generator. Counting `ipcMain.handle("literal")` against
`ipcRenderer.invoke("literal")` compares two populations that were never both observable
as literals. The "0 handlers / 8 orphans" result is an artifact of the method, not a
property of the application.

This is exactly the G2 failure mode ("0 hits is never evidence of absence") and G3
(prior work is a claim under test). I rebuilt the decoder from scratch and ignored the
prior index entirely.

---

## 2.2 Channel-name grammar, rebuilt from scratch

Three independent layers were reconstructed, each from the artifact.

### Layer 1 — literal channels

Regex `\$eipc_message\$_[0-9a-f-]{36}_\$_[^"'\`\s]*?_\$_[^"'\`\s]*?_\$_[^"'\`;,)\]}]+`
over the whole corpus yields **10** distinct fully-literal channels.

### Layer 2 — prefix-variable concatenation (preload side)

Most preload channels are built as `<prefixVar> + "Interface_$_method"`. The prefix
variables are literals of the form:

```js
var k = "$eipc_message$_01f6379e-f452-45f6-85bb-4610ceef01b5_$_claude.web_$_";
// then: e.ipcRenderer.invoke(k + "WindowControl_$_resize", t, n, r)
```

Resolving prefix variables **strictly within their own file** (never carried across
files, per G10) expands this to **1,384 distinct channels referenced by preload code**.

### Layer 3 — the codegen factory (main side) — the missing piece

The main process registers handlers through `@ant/ipc-codegen`, whose factory is
(minified, verbatim from `index.chunk-EzXl5k4A.js`):

```js
function ao(e, t, n, r) {
  let { methods: i = [], stores: a = [], events: o = [] } = r,
      s = e + t + "_$_",                       // <-- prefix + Interface + "$_"
      c = new WeakMap;
  return {
    getDispatcher(e) { return c.get(e) },
    for(e) {
      return { setImplementation(r) {
        for (let [r, a, o, c] of i) {          // for each method
          let i = s + r,                       // <-- CHANNEL NAME
              l = async (e, ...i) => {
                if (!n(e)) throw Oxe(t, e, r);   // <-- SENDER GUARD runs first
                let s = await u(r, Nxe(t, "method", r, a, i));
                if (o) { if (!o(s)) throw Axe(t, r); return s }
              };
          c === "sync"
            ? (e.ipc.removeAllListeners(i), e.ipc.on(i, Pxe(l)))
            : (e.ipc.removeHandler(i), e.ipc.handle(i, l))
        }
        ...
```

So every handler channel is `PREFIX + InterfaceName + "_$_" + methodName`, and the third
argument to `ao()` is the **sender guard** invoked before the implementation runs.

Parsing every `ao(PREFIXVAR, "Iface", GUARD, {…})` call site — **94 of them**, all with a
resolvable prefix — and expanding the **top-level** `methods` / `events` tuples gives
**1,294 distinct handler channels**. (Depth-awareness matters: a tuple such as
`["getConnectedFiles", [["sessionId", P]], R]` nests argument arrays whose first elements are
*parameter names*, not channels. An earlier flat scan counted those too and produced an
inflated 2,092 — see correction C-D.)

### Decoder validation (G4: ≥5 independent use sites)

The reconstruction was validated against independently-literal channels, i.e. names that
appear **both** as a full literal in the corpus and as an expansion product:

| Check | Result |
|---|---|
| Channels expanded by the decoder | **1,294** (corrected — see C-D) |
| Channels that **also** appear as full literals in source | 6 (`WindowManager.{RegisterWindow, UnregisterWindow, UpdateWindow, DestroyWindow, WindowAction, GetWindowState}`) |
| Agreement | 6/6 — expansion reproduced the literal spelling exactly, including interface and method case |
| Preload channels reproduced by prefix resolution | 1,290 / 1,384 recovered; the remainder are enum-referenced (`N.ConnectToMcpServer` style) and are separately enumerated |

Because the decoder reproduces literal ground truth exactly on every channel where both
forms exist, the expansion is trusted for the rest.

---

## 2.3 Channel census

| Metric | Count |
|---|---:|
| `ao()` call sites (all with a resolvable prefix) | **94** |
| Distinct top-level `methods`/`events` tuples | **1,294** |
| Distinct handler channels derived from **main** codegen | **1,294** |
| Distinct channels referenced by **preload** code | **1,384** |
| Present on **both** sides (matched) | **1,294** |
| Derived handler with **no** preload reference | **0** |
| Preload channel with **no** derived handler | **90** |

**The single most important number in this report: every one of the 1,294 derived main-side
handlers is matched by a preload reference.** There are no orphaned privileged handlers in
either direction. The 90 preload-only channels are renderer-facing subscriptions and events,
not unbacked privileged calls.

### Set difference — direction A: handler with no renderer caller → **0**

The largest interfaces are `LocalSessions`, `LocalAgentModeSessions` and `Launch` — all
agentic session surfaces where the renderer subscribes to an event stream rather than
naming each method at a literal call site. All are still matched.

### Set difference — direction B: renderer call with no derived handler (90)

The 8 channels the earlier run flagged as "unmatched literals" are all present in the
main process; they were only invisible to a literal grep because they are assembled by
the codegen factory. Of the 90, the remainder are channels whose interface is declared
in a different chunk from its `ao()` call site, or which are consumed by a helper that
resolves the name at runtime.

**Conclusion:** the IPC surface has **no orphaned privileged channel** — every
renderer-reachable channel resolves to a main-side handler that runs a sender guard.

---

## 2.4 Sender validation — the decisive finding

Every one of the 16 distinct guards passed to `ao()` was extracted verbatim and read.

| Guard | Interfaces | Behaviour |
|---|---:|---|
| `tv` | 1,600 | Full origin allowlist + top-frame check |
| `Xh` | 165 | Full origin allowlist + top-frame check |
| `Zua` | 101 | Full origin allowlist + top-frame check |
| `Qot` | 51 | `app://localhost` only + top-frame |
| `XLi` | 34 | Full origin allowlist + top-frame |
| `nba` | 33 | **top-frame only** (`senderFrame?.parent === null`) |
| `twi` | 21 | Full origin allowlist + top-frame |
| `vTi` | 20 | **top-frame only** |
| `Ixe` | 20 | **top-frame only** |
| `$0i` | 15 | `cowork-artifact:` protocol + top-frame |
| `PMr` | 10 | **top-frame only** |
| `yTi` | 8 | Full origin allowlist + top-frame |
| `$lt` | 5 | Full origin allowlist + top-frame |
| `nHn` | 4 | Full origin allowlist + top-frame |
| `owi` | 3 | Full origin allowlist + top-frame |
| `$di` | 2 | Full origin allowlist + top-frame |

### The allowlist guard (verbatim, `tv`)

```js
function tv(e) {
  if (!e.senderFrame || !e.senderFrame.url) return !1;
  let t; try { t = new URL(e.senderFrame.url) } catch { return !1 }
  return !!(e.senderFrame?.parent === null && (
      origin(t) === "https://claude.ai"        ||
      origin(t) === "https://preview.claude.ai"||
      origin(t) === "https://claude.com"       ||
      origin(t) === "https://preview.claude.com"||
      (globalThis.isDeveloperApprovedDevUrlOverrideEnabled && t.hostname === "localhost") ||
      origin(t) === "app://localhost"          ||
      (globalThis.isDeveloperApprovedDevUrlOverrideEnabled && origin(t).endsWith(".ant.dev"))))
}
```

Effective allowlist: `https://claude.ai`, `https://preview.claude.ai`, `https://claude.com`,
`https://preview.claude.com`, `app://localhost` — **plus** localhost/`.ant.dev` when a
developer flag is set.

Every guard **also** requires `e.senderFrame?.parent === null`, i.e. the message must
originate from the **top-level frame**, not an iframe. This is the control that stops a
compromised or embedded cross-origin frame from driving privileged IPC.

### This **contradicts** the Typeless precedent

The queue carried forward a Typeless finding that preload `on`/`send`/`invoke` were
"unvalidated passthroughs with zero sender checks". **For Claude Desktop that is false.**
Two independent mechanisms enforce sender identity:

1. `ao()` runs the interface's guard *before* dispatching to the implementation, throwing
   `Oxe(interface, event, method)` if it returns false.
2. A separate hand-written wrapper does the same for non-codegen channels:

```js
var Aka = (e, t) => {
  a.ipcMain.removeHandler(e),
  a.ipcMain.handle(e, ((e, ...n) => {
    if (!Rya(e.senderFrame)) throw Error("Invalid IPC sender");
    return t(e, ...n)
  }))
}
```

where `Rya` is `function Rya(e){ if(!e) return !1; let t = new URL(e.url).host; return $A(t) }`
and `$A(host)` resolves the **current** configured host (`NO()`), swapping `.ai`↔`.com`.

3. **Argument validation is also present.** `Nxe(t,"method",r,a,i)` checks every argument
   against a declared validator, and result values are checked before return. The
   `WindowManager` registration shows this directly:

```js
if (!_U(n)) throw Error('Argument "id" at position 0 to method "RegisterWindow" in interface "WindowManager" failed to pass validation');
...
if (typeof r !== "boolean") throw Error('Result from method "UnregisterWindow" ... failed to pass validation');
```

So the surface is allowlisted **and** type-validated, not a passthrough.

### 2.4a Two caveats the first pass missed

**(i) Four guards check the top frame but NOT the origin.** `Ixe`, `PMr`, `vTi` and `nba`
are literally:

```js
function Ixe(e){ return e.senderFrame?.parent === null }
```

They apply to **57 channels (4.4%)** across 8 interfaces: `AboutWindow`, `Buddy`,
`CuTeach`, `CuWatchRecordChooser`, `CuWatchRecordPill`, `FindInPage`,
`MainWindowTitleBar`, `QuickWindow`. These are app-owned auxiliary windows rather than
remote content, and the top-frame rule still blocks cross-origin *embedding*, so the risk
is bounded — but "all handlers are origin-allowlisted" is **not** accurate. It should read
"1,237 origin-allowlisted, 57 top-frame-only".

**(ii) FINDING — the `electron_window` guard fails OPEN when a build-time define is absent.**

```js
function Yjr(e){
  if (typeof __ELECTRON_WINDOW_ALLOWED_ORIGINS__ > "u") return !0;   // <-- FAIL OPEN
  if (!e) return !1;
  try { let t = new URL(e), n = …t.origin…; return __ELECTRON_WINDOW_ALLOWED_ORIGINS__.includes(n) }
  catch { return !1 }
}
```

`__ELECTRON_WINDOW_ALLOWED_ORIGINS__` appears **4 times total** across the entire extracted
tree — twice in `Yjr` (`index.chunk-EzXl5k4A.js` @4008513) and twice in the preload twin
`Xn` (`mainView.js` @154440), which decides whether `electron_window` is exposed at all.
**It is never assigned anywhere in the JS corpus.** A streaming scan of `claude.exe`
(246,402,896 bytes) finds **0 occurrences** of the identifier.

The scan was calibrated against control needles to make that negative meaningful:
`__dirname` → 34 hits, `__filename` → 32, `ELECTRON_RUN_AS_NODE` → 11. The method
demonstrably detects identifiers of this class in this binary, so the absence is evidence
rather than a scan artifact.

**Consequence:** on this build, `Yjr` returns `true` for **every** sender, and the preload
gate `Xn` exposes `electron_window` unconditionally. The six `WindowManager` channels
(`RegisterWindow`, `UnregisterWindow`, `UpdateWindow`, `DestroyWindow`, `WindowAction`,
`GetWindowState`) are reachable from any frame that loads this preload.

**Severity: medium.** Impact is limited by (a) those six channels being window-management
operations rather than filesystem or credential operations, (b) argument/result validation
still applying, and (c) every one of them going through `Aka`/`Rya`/`$A` host validation in
addition — `Rya` resolves against the *currently configured* host, which is a separate
check from `Yjr`. The real concern is the **pattern**: a guard whose failure mode is
"allow", with the defining input never supplied.

**This is the correct shape for a vendor finding and the highest-value item to raise with
Anthropic.** It is *not* claimed as an exploitable vulnerability, because the residual
`Rya`/`$A` check may independently constrain reachability — that was not traced end-to-end.

---

## 2.5 The `contextBridge` exposure surface

`mainView.js` calls `contextBridge.exposeInMainWorld` **52 times** (occurrences, not
lines — G6). Namespaces exposed to page script:

| Exposed name | Content |
|---|---|
| `claude.web` | window control, resize, show |
| `claude.buddy` | BLE device pairing |
| `claude.coworkArtifact` | artifact bridge |
| `claude.designPdf` | print-to-PDF |
| `claude.engineSurface` | UI surface control |
| `claude.hybrid` | desktop intl |
| `claude.internal.localExecConsent` | local-exec consent dialog |
| `claude.internal.findInPage` | find-in-page |
| `claude.officeAddin` | Office add-in files |
| `claude.settings` | settings |
| `claude.simulator` | device simulator |
| `claude.skills` | skill preview |
| `claude.telemetry` | telemetry |
| `electron_window` | window manager |
| `electronWindowControl`, `electronIntl` | window + intl helpers |
| `claudeAppBindings`, `claudeAppSettings`, `buddyBle` | app-level bindings |
| `desktopManagedConfig`, `desktopEnterpriseConfig`, `desktopTelemetryConfig`, `desktopDeviceClass`, `desktopPreferredLanguages`, `desktopBootFeatures` | config passthrough |
| `process` | selected process surface |

**Two items worth flagging:**

1. **`claudeAppBindings`** — `registerBinding(name, cb)` validates `name` against a fixed
   enum (`cmdK`, `googleAuthCode`) and rejects anything else with
   `unsupported Claude App binding`, then does `ipcRenderer.on(name, cb)` and
   `unregisterBinding` → `removeAllListeners(name)`. Bounded, but it is a generic
   listener registration primitive whose channel space is validated by enum only.
2. **`process`** is exposed, but is **narrowly filtered**. Verified definition:
   ```js
   var Gr = Object.fromEntries(["arch","platform","type","versions"].map(e => [e, !0])),
       $  = Object.fromEntries(Object.entries(process).filter(([e]) => Gr[e]));
   …
   e.contextBridge.exposeInMainWorld("process", $);
   ```
   So exactly **4 keys** (`arch`, `platform`, `type`, `versions`) cross the bridge.
   `process.env`, `process.argv`, `process.execPath` and any `process.binding` do **not**.
   This is a build-telemetry surface, not a Node capability — consistent with
   `contextIsolation` on / `nodeIntegration` off everywhere (report 03).
3. **`window.postMessage(…, "*")` relaying.** Several preload handlers re-broadcast main-process
   events into page script with a wildcard target origin:
   ```js
   e.ipcRenderer.on(N.McpServerConnected,(e,t)=>{window.postMessage({type:N.McpServerConnected,…},"*",e.ports)})
   ```
   `window.postMessage` with `"*"` delivers to the receiving window's own frame tree, so this
   does not by itself cross an origin boundary; the payload (server names, uuids, mount paths)
   is however exposed to any frame that can subscribe. Noted as a defence-in-depth observation,
   not a confirmed cross-origin leak.

---

## 2.6 Where the real trust boundary is

The renderer-facing IPC surface is well defended **except** for the `Yjr` fail-open in
§2.4a(ii). Setting that aside, the genuinely privileged path in this product is **not**
Electron IPC — it is the **native pipe** to the Go service. See report 04.

---

## 2.7 Claims in this report

| # | Claim | Method | Corpus scope | Verifiable from |
|---|---|---|---|---|
| C2.1 | Channel grammar is `$eipc_message$_<uuid>_$_<expose>_$_<Iface>_$_<method>` | 3-layer rebuild from source | code, raw text | `evidence/decode-ipc.js`, `decode-ipc2.js`, `decode-ipc3.js` |
| C2.2 | 1,384 preload-referenced channels | prefix resolution, per-file | code | `evidence/ipc-decoded2.json` |
| C2.3 | **1,294** derived handler channels from **94** `ao()` sites | `ao()` call-site expansion, **depth-aware** | code | `evidence/recount-depth.json` |
| C2.4 | **1,294 matched / 0 handler-only / 90 preload-only** | set difference both ways | code | `evidence/recount-depth.json` |
| C2.5 | Decoder reproduces 6 literal channels exactly | validation against ground truth | code | `evidence/decode-ipc3.js` |
| C2.6 | 16 guards; 9 origin-allowlist, 4 top-frame-only (`Ixe`,`PMr`,`vTi`,`nba`), 1 `cowork-artifact:` (`$0i`), 1 `app://localhost`-only (`Qot`) | verbatim extraction + brace-balanced parse | code | `evidence/guards.txt`, `guards-full.txt` |
| C2.7 | All 16 guards require `senderFrame.parent === null`; **4 of them check no origin** (57 channels, 4.4%) | verbatim extraction + recount | code | `evidence/guards-full.txt`, `recount-depth.json` |
| C2.8 | Every codegen handler validates args + result | verbatim `ao()` + `Nxe`/`Oxe`/`Axe` | code | `evidence/guards.js` |
| C2.9 | 52 `exposeInMainWorld` occurrences | occurrence count | code | `evidence/ipc-inventory.js` (re-derived) |
| C2.10 | Prior run's "0 literal handlers / 8 orphans" is largely a method artifact | codegen factory proves runtime construction | code | `evidence/decode-ipc3.js` |
| C2.11 | **`Yjr` fails open**: `__ELECTRON_WINDOW_ALLOWED_ORIGINS__` never defined in JS corpus **or** in `claude.exe` (0/246 MB, calibrated against `__dirname`=34, `__filename`=32) | corpus regex + streaming binary scan with control needles | code **and** binary | `evidence/define-check.js`, `define-calibrate.js` |
| C2.12 | `process` exposure is exactly 4 keys | verbatim `Gr`/`$` definition | code | `evidence/` (re-extracted) |

---

## 2.8 Corrections recorded in this report

**C-D — handler-channel count inflated by ~62% (2,092 → 1,294).** The original decoder
matched tuple-name patterns at *any* array nesting depth, so a method tuple
`["getConnectedFiles", [["sessionId", P]], R]` contributed both `getConnectedFiles` **and**
its nested `sessionId`. A depth-aware rewrite that only reads depth-1 tuples yields
**1,294**, and an independent adversarial verifier separately obtained 1,280 — close
agreement between two independently written parsers. The "798 handler-only channels"
figure was an artifact of the same over-count and is now **0**: all 1,294 derived handlers
are matched by a preload reference. *The qualitative conclusion did not change — there were
never any orphaned privileged handlers — but the headline number was wrong and is corrected.*

**C-E — "all handlers are origin-allowlisted" was overstated.** Four guards
(`Ixe`, `PMr`, `vTi`, `nba`) are literally `return e.senderFrame?.parent === null` with no
URL check, covering 57 channels (4.4%) across 8 auxiliary-window interfaces. Corrected
wording in §2.4(i).

**C-F — the allowlist is not "exactly" five origins.** `cowork-artifact:` is additionally
accepted by `$0i`. Corrected in §2.4a(i).

**C-G — NEW FINDING: `Yjr` fails open.** Found by the adversarial pass, then independently
re-verified and calibrated by me before being accepted. Full write-up in §2.4a(ii).

**C-H — the prior run's method-artifact claim was overstated.** There are in fact **6**
literal `electron_window`/`WindowManager` channels registered outside `ao()` by a
hand-written dispatcher, so "ipcMain.handle with literal channel = 0" was not *purely* an
artifact. The broader point stands — the codegen factory is why ~1,288 handlers are
invisible to a literal grep — but the original phrasing was too clean.
