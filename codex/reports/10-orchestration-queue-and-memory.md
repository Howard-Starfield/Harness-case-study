# Codex 26.1007.2314.0 — Orchestration: the talking orb, request queueing, memory, and reply routing

**Report 10 of 11 — Target 2 (Codex desktop, MSIX `OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0`)**
Scope: security-posture and architecture of the orchestration path. Static analysis only.
Analysis date: 2026-10-13.

---

## 0. Method, corpora, and what a number here means

| Corpus | Path | Files | Bytes | Chars |
|---|---|---|---|---|
| MAIN | `.vite/build` | 34 | 10,333,165 | 10,250,479 |
| RENDER code | `webview` (non-locale) | 14,524 | 156,392,827 | see §1 note |
| RENDER locale | `webview` (translation bundles) | 258 | 227,096,998 | see §1 note |

Counts are **occurrences in raw decoded JS text**, not line counts, because the bundles are minified into very few very long lines. Every count below names its file and byte offset in the form `file @offset`.

**"0 hits" is never evidence of absence.** Each negative claim below is paired with a positive control run over the same corpus.

---

## 1. Correction C-P — the renderer voice census was 82% translation text

The first renderer scan reported `voice` 15,854 occurrences across 293 files. That number is real but badly misleading: it is dominated by **translation bundles**.

Splitting the renderer corpus by filename (`/^[a-z]{2,3}(-[A-Za-z]{2,4})?-[0-9a-f]{8,}\.js$/i` → 258 locale bundles, 227,096,998 bytes = 59% of renderer bytes):

| Probe | CODE | code files | LOCALE | locale files |
|---|---|---|---|---|
| `voice\w+` | 2,901 | 162 | 12,953 | 131 |
| `dictation\w*` | 957 | 46 | 3,622 | 63 |
| `microphone\w*` | 623 | 39 | 2,459 | 63 |
| `audio(s)?` | 1,440 | 149 | 2,527 | 131 |

**Rule adopted going forward: no renderer-wide count is quoted in these reports without the code/locale split.** Evidence: `voice-render4.txt`.

## 2. Correction C-Q — `AudioContext` 51 vs 24 was a case-flag artefact

Two independent renderer scans disagreed: `/\b(?:webkit)?AudioContext\b/g` → **24**, the same pattern with `i` → **51**. Reconciled per-file: the difference is exactly **27 case-insensitive-only extras**, concentrated in `app-initial` (15) and `mathlive.min` (8). These are the lowercase option-string `"audiocontext"` (MathLive exposes a config key by that name), not API call sites.

**The API-use figure is 24, not 51.** Evidence: `voice-render4.txt` §AudioContext RECONCILIATION.

---

## 3. What the "talking orb" actually is

The orb is **not** a separate agent process. It is a *presentation layer* over the ordinary thread system, with three distinct surfaces:

**(a) The mascot overlay** — a physics-driven draggable avatar in a frameless always-on-top window.
`main-BklS_2Y2.js @1444585` dispatches overlay events:

```
avatar-overlay-open-state-changed
avatar-overlay-drag-start / -move / -end / -release
```

with `usesOrbPhysics`, `throwWithVelocity(id, velocityX, velocityY, shouldBounce)`, `startDrag` / `moveDrag` / `endDrag(id, state, altKey)`. `main @443011` adds `OrbPicker` and a `quickChat` object carrying `restingWidth`, `hasOrbPicker`, `nearestStashEdge`, `stashedEdge`, `workArea` — i.e. the orb can be **stashed to a screen edge** and still accept a quick chat.

**(b) The floating voice orb** — `voice-static-orb` is an explicit `data-testid` in `voice-session-82332de4a122.js`, alongside `voiceFloatingOrb.*` settings-modal strings and `voiceFloatingOrb.stillConnecting`.

**(c) The orb character runtime** — a self-contained animated-character bundle under
`webview/assets/orbit-character-a46c99f7e8749621/runtime/orbit-characters.mjs` (2 `getUserMedia` sites), with a single-threaded variant alongside it.

Security note: the overlay is a **renderer window with camera/microphone access** (`avatar-overlay-native-page-c254d4864d6b.js`, 343,699 bytes, `getUserMedia=3`, `RTCDepPeerConnection=3`, `requestAnimationFrame=10`). It is not a sandboxed helper.

---

## 4. Does an `.md` file record what needs to be done?

**Yes — three distinct `.md` mechanisms exist. None of them is a task/todo list.**

### 4.1 `AGENTS.md` — persistent project instructions (4 occurrences, 2 files)

| Site | What it does |
|---|---|
| `main @845055` | On project import, writes `AGENTS.md` with **`mode: 292`** (decimal 292 = `0o444` = **read-only**) |
| `main @845267` | Same path, backup/publish/rollback transaction (`backedUp`, `published` flags) |
| `main @1140926` | On Claude Cowork import, appends heading `## Claude Cowork Migration` (marker `## Imported Claude Cowork project instructions`); idempotent via `mD()` |
| `src @30740` (`Zt`) | Resolves `$CODEX_HOME/AGENTS.md`, `mkdir -p` parent, **creates it empty if missing**, returns the path |
| `src @30740` (`Qt`) | Reads sibling **`AGENTS.override.md`**; returns `{path, contents, hasOverride}` |

So: `AGENTS.md` is *always read, created if absent, and written read-only*. `AGENTS.override.md` is an unchecked sibling override.

### 4.2 `automations/<id>/memory.md` — the actual "don't repeat work" record

`main @188712` contains the literal instruction shipped to the model:

> `Automations: use the memory file at $CODEX_HOME/automations/<automation_id>/memory.md (create it if missing).`
> `Read it first (if present) to avoid repeating recent work, especially for "changes since last run" tasks.`
> `Memory is important: some tasks must build on prior work, and others must avoid duplicating prior focus.`

`main @208892` echoes the path into every automation run preamble:
`Automation memory: $CODEX_HOME/automations/${a.id}/memory.md` alongside `Automation ID`, `Last run`.

`src @1065893` (`zF`, duplicate-automation) **copies** the source `memory.md` into the new automation's directory when the target has none or has no bound account.

**This is the closest thing in Codex to "an `.md` that records what needs to be done"** — but it is scoped to *automations* (scheduled tasks), not to live conversation.

### 4.3 `memoryPipeline` — server-side memory feature flags

`src @886926` / `src @890141` / `src @890214` push config keys into the thread-start payload:

```
memories.version
memories.dual_write
memories.generate_memories
memories.use_memories
```

Set from `e.inputs.memoryPipeline.{version,dualWrite}` and from a `{generateMemories, useMemories}` object. `dual_write` implies a migration is in progress. These are **server-side features negotiated at thread start**, not local files.

### 4.4 What does NOT exist

| Searched | Result in MAIN (34 files) |
|---|---|
| `TODO.md`, `tasks.md`, `todo.md` | 0 |
| `MEMORY.md` | 0 |
| A local task-graph / todo store keyed to a thread | not found |

`memory.md` (4 occurrences, 3 files) and `memory.md/json` (4) are **all** accounted for by §4.2 — the automation memory file. There is no other `.md` task record.

> **Answer:** Codex records standing instructions in `AGENTS.md` (+`AGENTS.override.md`) and scheduled-task history in `automations/<id>/memory.md`. It does **not** maintain a per-session markdown to-do list. Pending conversational work is tracked in **structured thread state**, not markdown — see §5 and §7.

---

## 5. How requests are queued

There is an explicit, user-switchable follow-up queue.

**Mode setting** — `main @739391`:
```js
async readFollowUpQueueMode(){
  ... await n.getEffective(r.H.followUpQueueMode.key) === `queue`
      ? `queue` : `send-now`
}
```
Two values only: **`queue`** or **`send-now`**. Anything other than the literal `queue` falls through to `send-now` — fail-open toward immediate send.

**Ownership + broadcast** — `main @723802`: a thread has exactly one `owner` client (`e.getStreamRole(n)?.role === 'owner'`), and the session service broadcasts `threadQueuedFollowUpsChanged({...,hostId})` to all windows, re-broadcast on `thread-queued-followups-changed`.

**Send locks** — `main @1421647` / `@1421826`: two IPC methods, keyed by a triple:

```js
"queued-follow-up-send-lock-acquire": async ({conversationId, messageId, lockId})
    => ({acquired: this.queuedFollowUpSendLocks.tryAcquire({conversationId, messageId, lockId})}),
"queued-follow-up-send-lock-release": async ({conversationId, messageId, lockId, sent})
    => this.queuedFollowUpSendLocks.release({conversationId, messageId, lockId, sent})
```

This is a **per-message mutex** so two windows cannot both flush the same queued follow-up. Commit failures are logged, not thrown: `Failed to broadcast committed queue update`.

**Queue mutation ops** (from the follower table, `src @8660`):
`thread-follower-set-queued-follow-ups-state`, `thread-follower-remove-queued-message`, `thread-follower-clear-queued-messages`.

MAIN-wide occurrence counts: `queued/queue*` 241, `enqueue*` 184, `followUp` 81, `interrupt*` 172, `steer*` 77.

---

## 6. Streaming and chunking

**Wire protocol is a delta stream, not message-per-token RPC.** Event names present in MAIN:

| Event | Occurrences |
|---|---|
| `item/agentMessage/delta` | 16 |
| `item/reasoning/textDelta` | 6 |
| `outputDelta` | 32 |
| `turn/diff/updated` | 5 |
| `turn/started` | 27 |
| `turn/completed` | 31 |
| `chunk*` | 181 |

**Transport is itself chunked.** The main process owns a `chunkedMessageSender` with two priority lanes — visible in the dictation handler at `main @704721`:

```js
t.responsePriority === `critical`
  ? this.options.chunkedMessageSender.sendCritical(e, g.bt, i)
  : this.options.chunkedMessageSender.sendInlineMessageForView(e, i)
```

So deltas are re-chunked into an outbound priority queue before reaching the renderer. `responsePriority: 'critical'` is a distinct, elevated lane.

---

## 7. How a reply is routed to the right thread or task

Three independent mechanisms, at three different granularities.

### 7.1 Interrupting/steering an in-flight turn — `targetTurnId`

`conversation-turn-mutations-szl89rld.js` defines the steering message:

```js
var yn = `Interrupted before the steer was accepted.`;
function bn(e, t, n, {attachments: r=[], clientUserMessageId: i=null,
                     shouldStripImageDisplayPlaceholderLines: a=false,
                     targetTurnId: o=null, targetTurnStartedAtMs: s=null} = {}) {
  return { type: `steeringUserMessage`, id: e,
           targetTurnId: o, targetTurnStartedAtMs: s,
           status: `pending`,
           serverUserMessageId: null,
           clientUserMessageId: i, input: t, attachments: r, ... };
}
```

Routing is **not** by "current thread" — it is by an explicit **`targetTurnId` plus `targetTurnStartedAtMs`** pair. `targetTurnStartedAtMs` is a race guard: if the turn restarted between click and delivery, the steer is rejected rather than misrouted. The literal `Interrupted before the steer was accepted.` is that guard firing.

Acceptance path `@35647`: `status: 'pending'` → `'accepted'`, stamping `serverUserMessageId` / `serverClientUserMessageId`, reordering the item list, and emitting `{type:'steered', id}`.

Helper `Pn({turn, targetTurnId, input, clientUserMessageId, modelProvider})` builds it.

### 7.2 Cross-window follower priority — `src @8660`

Every thread-affecting broadcast has a numeric priority. Higher wins.

| Event | Priority |
|---|---|
| `thread-follower-edit-last-user-turn` | **2** |
| `thread-follower-command-approval-decision` | 1 |
| `thread-follower-file-approval-decision` | 1 |
| `thread-follower-permissions-request-approval-response` | 1 |
| `thread-follower-submit-user-input` | 1 |
| `thread-follower-submit-mcp-server-elicitation-response` | 1 |
| `thread-follower-set-queued-follow-ups-state` | 1 |
| `thread-follower-remove-queued-message` | 1 |
| `thread-follower-clear-queued-messages` | 1 |
| `thread-queued-followups-changed` | 2 |

`ke(e,t,n)` bumps any `thread-follower-*` event by +1 when a caller is present. **Editing the last user turn outranks everything else** — the queue is explicitly subordinate to direct text edits.

### 7.3 Voice → task delegation (see Report 11 §6)

The voice orb can create and address **other Codex tasks**. `avatar-overlay-native-page-c254d4864d6b.js` carries the full lifecycle vocabulary: `realtimeVoice.taskCreated`, `.taskCreatedWithTitle`, `.taskReturned`, `.taskUpdate.{running,completed,interrupted,failed,stopped,notFound,generic}`, plus the routing tokens `to-task`, `from-task`, `thread-created`, `thread-message`. The UI copy is explicit:

> *"Title shown when realtime voice creates another Codex task"*
> *"Title shown when another Codex task sends a progress update to realtime voice"*
> *"Body shown when realtime voice delegates work to another Codex task"*

**So the answer to "does it send the reply to the right subagent, or do all the work itself" is: both, explicitly.** The orb holds a voice conversation, and *delegates* implementation work to separate Codex tasks, tracking each one's lifecycle. Per-dot conversations (`avatarOverlay.transcript.openOrbitThread.dot`) mean each orb dot is independently addressable.

---

## 8. Memory persistence

| Layer | Mechanism | Where |
|---|---|---|
| Project instructions | `AGENTS.md`, read-only on write (`mode: 292`) | per project root |
| Instruction override | `AGENTS.override.md`, sibling, `hasOverride` flag | `$CODEX_HOME` |
| Automation history | `automations/<id>/memory.md`, copied on duplicate | `$CODEX_HOME` |
| Conversation history | Server-side `aeon`/durable threads; `requestedHistoryMode` | remote |
| Feature memory | `memories.{version,dual_write,generate_memories,use_memories}` | server config at thread start |
| Ephemeral opt-out | `O.ephemeral = true` when a request flag is set | thread start |

Notably `src @890141` branches on `w === 'durable' && T === 'aeon'` to attach a `serviceName` and apps/network config — a distinct persistence tier from ordinary threads.

---

## 9. Findings

| ID | Sev | Finding |
|---|---|---|
| **F10** | low | `AGENTS.md` is written with `mode: 292` (`0o444`). Intentional immutability is a good default, but it means a user cannot correct Codex's generated project instructions in place; they must be regenerated or replaced via the import transaction. |
| **F11** | low | `readFollowUpQueueMode()` fails **open** toward `send-now`: any value that is not exactly the string `queue` results in immediate send. A corrupted or unknown setting silently drops queued ordering rather than preserving it. |
| **F12** | info | `AGENTS.override.md` is read with no validation that its content is safe or in scope; it is a sibling-file override of the project's instruction set. |
| **F13** | info | Queued-follow-up send locks are advisory within one process only (`tryAcquire` keyed by `{conversationId,messageId,lockId}`). Multi-process protection is not evidenced. |

---

## 10. What this report does NOT establish

1. **No runtime verification.** Nothing was launched; every claim is static. Whether `targetTurnStartedAtMs` actually rejects a stale steer in practice is untested.
2. **Server-side behaviour is inferred from client config keys.** `memories.*` are negotiation keys; what the server stores is not observable here.
3. **No local task/todo markdown was found**, and I state that as *"not found in this artifact"* — not as proof none exists server-side.
4. The `.wasm` / `.data` assets are excluded from the `.js|.mjs|.cjs` corpus. Report 11 §2 inventories them separately.

---

## 11. Evidence index

| File | Contents |
|---|---|
| `evidence/voice-disc.txt` | MAIN discovery census (34 files / 10,333,165 B / 10,250,479 chars) |
| `evidence/voice-deep.txt` | `AGENTS.md`, `memory.md`, `memoryPipeline`, Orb, voice-mode, dictation, followUp, steer contexts with offsets |
| `evidence/voice-audio.txt` | Full dictation connect-info handler, `getBackendRequestAuth`, microphone state machine |
| `evidence/voice-render.txt` | Renderer scan A (13-pass, independent) |
| `evidence/voice-render3.txt` | Renderer scan B (single-pass, independent) |
| `evidence/voice-render2.txt` | **Aborted intermediate run (120 B, incomplete).** Killed by PowerShell's native-stderr handling under `$ErrorActionPreference='Stop'`, not by node. Kept rather than deleted so the run sequence is auditable. Superseded by scan B, which moved progress logging to stdout. |
| `evidence/voice-render4.txt` | **C-P** code/locale split + **C-Q** AudioContext reconciliation |
| `evidence/voice-chunks.txt` | Per-chunk API census + literals for 18 voice-related renderer chunks |
| `evidence/voice-local.txt` | Local-model extension inventory, wasm inventory, engine-name scan, char counts |

Scripts that produced them are alongside as `.js`; both renderer scans and the reconciler are independent re-derivations of each other.