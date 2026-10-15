# Codex 26.1007 — Report 07: Direct Comparison vs Typeless

**Queue requirement #10.** Codex and Typeless are the same class of product — an Electron/Chromium chat client with agentic tool execution and a local sandbox — so the security postures are directly comparable. Claude Desktop (Target 1) is included as the in-study control that already has a verified result.

---

## 7.1 Headline comparison

| Dimension | **Typeless** | **Codex 26.1007** | **Claude Desktop** (control) |
|---|---|---|---|
| IPC shape | **Raw passthrough** (`on`/`send`/`invoke`) | **Allowlist**, 24 registrations / 17 channels | **Allowlist**, 1,294 handler channels |
| Sender validation | none observed | webContents-id allowlist + `x1e` + top-frame check | top-frame + build-state-matched origin |
| Sandbox failure mode | **Fails OPEN** → `--no-sandbox` | **Fails CLOSED** → rejects, 5-min cooldown | not applicable (Hyper-V guest) |
| Renderer→elevation reachability | not established | **No** — 0 refs / 14,816 JS files | n/a (no elevation service) |
| Renderer sandbox flags | `--no-sandbox` reachable | **6/6 `sandbox:!0`, zero `sandbox:!1`** | 16/16 `sandbox:true`, zero `false` |
| `nodeIntegration` | — | 22 occurrences, all `!1` | 17 × `!1` |
| `contextIsolation` | — | 13 occurrences, all `!0` | 17 × `!0` |
| `webSecurity` / `no-sandbox` | reachable | **0 / 0** | 0 / 0 |
| Approval gate location | renderer-side | **native app-server** (`codex.exe` Rust) | renderer + native |
| Code signing | — | 12/12 Valid, `CN="OpenAI OpCo, LLC"`, sha384, EV | 6/6 Valid, `CN="Anthropic, PBC"` |
| Electron fuse hardening | — | **no fuse wire exists** (F1) | 9 fuses decoded |

**The one-line summary:** on the specific question this queue was built around — *can an unprivileged
renderer reach a privilege-raiser, and does the sandbox fail open* — Codex is **materially stronger
than Typeless on both counts**. It fails closed on sandbox setup, and the renderer has no reference to
the elevation service. Codex's weaknesses are elsewhere: no fuse hardening (F1), native code outside
the ASAR (F2), and a tolerated HRESULT on the update-elevation path (F3).

## 7.2 Where Codex is clearly better

**Sandbox failure mode — the decisive difference.** Typeless's GPU-crash handler fell open to
`--no-sandbox`, converting a crash into a sandbox bypass. Codex's equivalent failure (setup timeout)
converts a hang into a **rejected promise** plus a hard 5-minute refusal to retry the same mode in
the same process. There is no flag-flipping fallback anywhere on this path. Full state machine in
report 03 §3.5.

**Approval gate placement.** Codex's approval requests
(`item/commandExecution/requestApproval`, `item/fileChange/requestApproval`,
`item/permissions/requestApproval`) are **notifications emitted by the Rust app-server**. A renderer
cannot bypass a gate that lives on the other side of a process boundary — it can decline to *display*
the prompt, but it cannot make the gate return "allowed". Claude Desktop's `localExecConsent` has the
same property and was verified in Target 1 (C-D4). Typeless's posture on this point is not
established in this study.

**Permission narrowing fails closed.** Codex's automation path throws
`No compatible automation permissions satisfy the managed requirements` rather than falling back to a
weaker profile when no combination satisfies managed constraints.

**No renderer-side file I/O.** All `fs/*` operations are mediated by `codex.exe` (57-method typed
JSON-RPC protocol), so path policy is enforced in one auditable native place instead of being
re-implemented in a preload.

**Signing.** 12/12 PE binaries validly signed by a single EV-issued OpenAI certificate, sha384RSA,
countersigned, with `SignatureKind: Store` on the MSIX package.

## 7.3 Where Codex is weaker than Claude Desktop

**F1 — no Electron fuse wire.** Claude Desktop has 9 fuses read directly from `claude.exe`: `RunAsNode`
disabled, `NODE_OPTIONS` disabled, `--inspect` disabled, cookie encryption enabled, ASAR integrity
validation enabled, `OnlyLoadAppFromAsar` enabled. Codex has **none**, despite declaring
`@electron/fuses ^1.8.0` as a dependency. This is the single largest gap versus the control. The
`ValidateIntegrityOrDie` code path is present, so enforcement *may* exist by another route — **unproven**.

**F4 — devtools preference on agent-browsed content.** Claude's windows are uniformly `devTools:!1`.
Codex's browser-webview hardening function sets `t.devTools=!0` **unconditionally**:

```js
function cU(e,t){
  delete e.allowpopups; delete e.disablewebsecurity; delete e.webpreferences;
  t.sandbox=!0; t.devTools=!0;
  t.nodeIntegration=!1; t.nodeIntegrationInSubFrames=!1; t.nodeIntegrationInWorker=!1;
  t.contextIsolation=!0; t.webSecurity=!0; t.allowRunningInsecureContent=!1;
  t.webviewTag=!1; t.plugins=!1;
  Object.assign(t,{disablePopups:!0})
}
```

This same function hardens almost everything correctly — it force-sets `sandbox:true`,
`contextIsolation:true`, `nodeIntegration:false` in sub-frames *and* workers, `webSecurity:true`,
`webviewTag:false`, `plugins:false`, and defensively **deletes** `disablewebsecurity` from the
caller's options. `devTools:true` is the one value it sets that weakens posture, and it does so for
the windows that render **agent-navigated arbitrary web content**.

Note the nuance: `allowDevtools(e){ return isInternal(e) }` gates the devtools **menu item** to
internal builds, so the menu is hidden in production. But that gate does not touch the
`webPreferences.devTools` value, which is set to `true` regardless of build flavor.

**Severity: low.** DevTools is a local, user-gesture-gated developer tool, not a remote attack
surface; nothing in the corpus suggests a renderer can open it without a keyboard/menu action. It is
an inconsistency between the hardening function's evident intent and one of its values.

## 7.4 Where Codex is weaker than Typeless

**F3 — tolerated HRESULT on the update-elevation path.** Claude's equivalent
(`installPreparedUpdate` / `stagePackage`) **fails closed**: a non-matching error discards the staged
update and rethrows. Codex deliberately swallows one specific HRESULT
(`0x80073D28`) and proceeds to record the update as staged and ready. Typeless is not implicated in
the source material available here, so no direct comparison is offered — but between the two products
*in this study* that have this code path, Codex is the more tolerant one.

## 7.5 Same class, different answers

The most interesting result is that two products in the same class answered the queue's headline
question **oppositely**, and that the difference is structural rather than incidental:

- **Typeless** has a raw-passthrough IPC and a fail-open sandbox fallback → a renderer is close to the
  privileged surface, and any crash is a bypass.
- **Codex** has a 17-channel sender-validated IPC, a native-process approval gate, and a fail-closed
  sandbox setup → the renderer is deliberately far from every privileged surface, and failure removes
  capability rather than adding it.

The shared mistake is not "no validation" but **letting a degraded state change the security
posture**. Typeless degraded toward *less* sandboxing. Codex's `cU` webview function degrades toward
*more* devtools. Both are small relative to their overall posture, but both are the same shape of
error: a fallback path that silently picks a weaker configuration instead of failing.

## 7.6 Claims carried across from Target 1 that remain open

These are open for Codex too and were **not** resolved in this report:

| Open item (from Target 1) | Status for Codex |
|---|---|
| Can a 3p deployment introduce an MCP connector the admin never configured? | **Not examined.** Codex has `mcpServer/*` protocol methods and 10 bundled plugins; whether external/unvetted MCP servers can be added without an admin gate is untested. |
| Does `Rya`/`$A` independently constrain Claude's `Yjr` fail-open? | N/A — different codebase, no analogous construct found. |
| Pipe HMAC key derivation | N/A — Codex uses JSON-RPC to a child process, not a named pipe. Its process boundary is stdio, not an IPC endpoint. |
| Guest VM default network adapter | **Partially relevant.** Codex's sandbox uses a Windows Firewall rule (`INetFwPolicy2`/`INetFwRule3`) rather than a VM; the firewall rule's *default* direction and scope were not read. |

## 7.7 One Typeless comparison the queue asked for that I cannot make

The queue frames Typeless as the comparison target for "sandbox fails open." I have verified
Codex's behaviour directly and in detail. I have **not** independently re-verified Typeless in this
run — the Typeless column is carried from the queue's prior characterisation. Where this report says
Typeless "fails open," that is a queue claim being repeated, not a claim this run tested. Any
decision resting on the Typeless side of this table should re-derive it from the Typeless artifact
first.