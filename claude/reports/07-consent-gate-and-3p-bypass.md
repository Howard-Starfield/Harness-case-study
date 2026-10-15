# 04 — Local-Exec Consent Gate and the Third-Party Bypass

**Target:** Claude Desktop 2.31226.1.0
**Primary evidence:** `.vite/build/index.chunk-CxVFbWaN.js`, 9,300 bytes, **read in full**
(not sampled, not grepped).
**Method:** static only. No consent prompt was triggered; no decision path was executed.

---

## 4.1 What the gate protects

The chunk registers four consent kinds through one module, handling two distinct operations:
authorising a **direct MCP server** to connect or disconnect, and granting a connector
**permission to be used inside a chat turn**.

```js
var l = function(e){ return e.Allow="allow", e.Cancel="cancel", e }({});
S = {
  connect:      { height:220, modal:true,  takesFocus:true,  timeoutMs:6e5,  guardsCancel:false },
  disconnect:   { height:300, modal:true,  takesFocus:true,  timeoutMs:6e5,  guardsCancel:false },
  apply:        { height:400, modal:false, takesFocus:false, timeoutMs:Infinity, guardsCancel:true },
  "chat-grant": { height:220, modal:true,  takesFocus:true,  timeoutMs:1.2e5, guardsCancel:false }
}
```

## 4.2 Defences that are actually present

This gate is unusually careful. Each of the following was read directly from the chunk.

**Fail-closed on every path.** `timeout` is mapped to a cancellation, never to an approval:

```js
case "cancelled": case "timeout": return { ok:false, cancelled:true };
```

A prompt that never gets answered does not unlock anything.

**Single-flight.** All consent prompts serialise through one queue:

```js
w = new t.SJ({ concurrency: 1 })
```

Overlapping prompts cannot be used to confuse the user about what they are approving.

**Input-protection window.** A decision arriving within 500 ms of the window becoming visible
and focused is **discarded**, for both directions where it matters:

```js
choose(n){
  let i = Date.now() - d;                       // d set on ready-to-show and on focus
  if ((n === l.Allow || r.guardsCancel) && i < 500) {
    warn("choice arrived before input-protection window elapsed; ignoring");
    return;                                     // ignored outright
  }
  ...
}
```

`d` initialises to `Infinity`, so any decision arriving before `ready-to-show` computes
`Date.now() - Infinity`, which is below 500, and is rejected. There is no way to pre-arm an
approval.

**Consent window is itself locked down.** It is created with the same hardened flags as
everything else and its escape routes are closed immediately:

```js
new BrowserWindow({
  width:460, height:r.height, parent:n, modal:r.modal, show:!1, frame:!1,
  resizable:!1, minimizable:!1, maximizable:!1, fullscreenable:!1,
  webPreferences:{ preload:A(), sandbox:!0, nodeIntegration:!1, contextIsolation:!0 }
});
u.webContents.setWindowOpenHandler(() => ({ action:"deny" }));
u.webContents.on("will-navigate", n => { n.preventDefault(); warn("blocked navigation in consent window"); });
```

**No hang.** Closing is bounded — a 5 s grace before `destroy()` if `close()` stalls.

**Grants are revocable and cache-busting.** `clearAllDirectMcpChatGrants()` clears both the
grant set and the in-flight de-duplication set, and bumps a generation counter so a
superfluous cached answer cannot satisfy a later, different prompt.

## 4.3 The `apply` kind is the weak path

Comparing the four kinds, `apply` — which shows the user a **configuration review** — receives
the weakest settings on every axis:

| | `connect` / `disconnect` / `chat-grant` | `apply` |
|---|---|---|
| `modal` | `true` | **`false`** |
| `takesFocus` | `true` | **`false`** |
| `timeoutMs` | 10 min / 2 min | **`Infinity`** |
| presented via | `show()` + `focus()` | `showInactive()` + `flashFrame(true)` + dock bounce |

It is also the one kind whose payload is **not** a fixed enum but a serialised structure:

```js
case "apply": return { kind:e.kind, targets: JSON.stringify(e.targets) };
```

**Assessment.** This is a UX and attention-management weakness, not a bypass. The user still
must click Allow, the 500 ms guard still applies, and timeouts failing "open" is irrelevant
here because the window simply waits. The concrete risk is that an unattended
`apply`-style configuration prompt can sit on screen indefinitely, non-modal and without
focus, while a user clicks through something else. The `connect` path — the one that grants a
server live tool access — is the *better*-protected of the two.

## 4.4 The finding: consent is skipped entirely in third-party deployment mode

Two functions short-circuit before any prompt is shown:

```js
async function j(e,t,r,i={showConsentWindow:R}){          // connect / disconnect
  if (e.type==="3p")
    return { verdict:{ decision:"allowed", resolvedName:r }, pool:e.activeConnectorPool() };
  ...
}

function P(e,t,n={showConsentWindow:R}){                   // chat-grant
  if (e.type==="3p") return !0;
  ...
}
```

`decision:"allowed"` is returned unconditionally and no dialog is constructed. This is the
single most consequential behaviour in the chunk.

### What `3p` means — verified, not assumed

The first reading of `"3p"` could easily have been wrong, so it was pinned down against the
rest of the main chunk (6,888,482 bytes) where `W().type` is the deployment-mode accessor.
265 occurrences of the literal `"3p"` were located with context. The semantics are consistent
and unambiguous:

| Evidence | Offset | Meaning |
|---|---:|---|
| `if (W().type==="3p") return { unavailableReason:"Feedback submission is not available when using a third-party API provider." }` | 5,249,575 | 3p = third-party **inference provider** |
| `dha(e){ return eFe(e ?? {}, { scope:"3p" }) }` | 6,169,539 | 3p is a managed-config **scope** |
| `W().type==="3p" ? new SessionRetentionEngine : startHipaaSessionRetention` | 6,627,080 | HIPAA retention applies only to 1p |
| `W().type!=="3p" && … session.defaultSession.webRequest …` | 6,617,759 | network request instrumentation is 1p-only |
| `function rIa(e){ return e.entrypoint===eG("1p") && e.entrypointCopied===!0 ? eG("3p") : e.entrypoint }` | 6,488,582 | explicit 1p↔3p entrypoint transition |

**`3p` is the enterprise "bring your own inference provider" deployment mode** — Bedrock,
Vertex, or a customer gateway — as opposed to `1p`, Anthropic's own API. It is corroborated by
a large managed-config surface whose keys are scoped `["3p"]`: `inferenceBedrockAwsCliPath`,
`inferenceBedrockRegion`, `inferenceBedrockBaseUrl`, `inferenceCredentialHelper`,
`inferenceGatewayOidc`, `inferenceIdpAuthFlow`, and more. The value `"hybrid"` also appears as
a separate mode.

### Assessment

**This is very likely deliberate, and the design is coherent** — but it is a real trust
boundary and should not be filed as "no issue":

1. In 3p mode the connector set comes from `adminConnectorSource()` — administrator-supplied
   configuration, not user-discovered. Prompting a user to approve each item an admin already
   declared would be noise.
2. The nearest analogous feature is *explicitly* admin-gated rather than silently open:
   ```js
   function V1i(){ if (W().type==="3p" && !kc(K())) return "disabled-by-admin"; … }
   ```
   for `coworkMcpWriteToolsAlwaysAllowEnabled`. The codebase does distinguish "admin says no"
   from "user asks", which suggests 3p behaviour is a considered branch.

**The concern is the asymmetry, not a defect in any one line.** The local-exec consent dialog
is the app's primary "something wants to act on my machine — approve it?" control. It is
present and carefully built for 1p, and absent for 3p. Related 3p behaviour compounds the
picture:

```js
W$i = {
  approvalLifetimeDays: lBr, approvalLifetimeStoodIn: uBr,
  recordsApprovalTime: () => W().type==="3p",      // scheduled-task approvals pre-recorded
  restrictionsApply:   () => _v()
}
```

So in 3p mode, scheduled-task approval times are *recorded rather than requested*. Whether
that is acceptable is a policy decision for a security owner, not one I can settle from the
binary — but it should not be discovered by accident.

**What would settle it.** Confirmation of whether a 3p deployment can introduce a connector
the administrator never configured — for example one registered by a plugin, a DXT extension
(`@ant/dxt-registry` is a declared dependency), or an MCP server supplied by a skill. If the
3p connector pool is strictly admin-authored, the bypass is sound. If it is extensible by any
installed component, then in 3p mode **no local-exec consent prompt exists at all**. Carried
to `verification-brief.md` as the highest-priority open question for this target.

## 4.5 Not yet examined

`cowork-svc.exe` (13.6 MB), `claude-ssh-broker.exe`, `claude-ssh-proxy.exe`,
`claude-ssh-askpass.exe` and `smol-bin.x64.vhdx` are unpacked, full-trust or service binaries
whose IPC surfaces have not been analysed. Two of them are registered as app execution
aliases and can be invoked by name from any process. Deferred to report 05.

---

*Next: [05 — Native Binaries & Trust Boundaries](./05-native-and-trust.md)*
*Back: [01](./01-artifact-manifest.md) · [02](./02-ipc-surface.md) · [03](./03-sandbox-boundary.md)*