# Why you see a todo list, a subagent thread, and a report-back loop

**What you observed:** when you send a message, the agent builds a list of todos, sometimes spawns
subagents in new threads, and then they trade messages back and forth until the task is finished.

**Short answer:** that is not the model "talking to itself." The **runtime creates real child
sessions** with isolated context, and the loop is a *deliberate result-delivery protocol* with
rate-limiting and an anti-storm design. The model contributes only two things: the decision to
delegate, and the prompt for the child. Everything else — creating the session, freezing its tools,
packaging the result, waking the parent — is harness code.

This document combines (a) published source-level documentation, (b) observed runtime state on this
machine, and (c) a concrete incident from this very session where the loop broke and lost work.

---

## 1. The loop, step by step

```
you: "do X"
   │
   ├─▶ todowrite(...)                    ← visible progress snapshot (a DISPLAY, not a queue)
   │
   ├─▶ task({description, prompt, agent_name, run_in_background})
   │      │
   │      └─▶ runtime: host.agentRoutes.createSession({
   │              sessionType:'branch', sessionKind:'task',
   │              parentSessionId, visibility:'hidden',
   │              title: description,
   │              purpose:'local-task:<turn>:<toolCall>' })
   │          │
   │          ├─▶ child gets its OWN context window (no parent history)
   │          ├─▶ child's tool/skill capability list is FROZEN at creation
   │          ├─▶ child inherits parent cwd + the SAME permission gate
   │          └─▶ nesting DISABLED: child cannot spawn its own subagent
   │
   │      ◀── returns a receipt, NOT a result
   │
   ├─▶ parent continues working in parallel          ← this is the whole point
   │
   └─◀── child reaches terminal state
          └─▶ runtime steers a `<background-task-finished>` wake-up into the parent
                 └─▶ parent calls task_output(task_id) to read it
                        └─▶ parent decides: done, or task_append(...) to send more work
                               └─▶ cycle again
```

The critical design point is in the middle: **`task()` returns an admission receipt, not a
completion.** The tool contract is explicit — *"A started task is not a completed result."* That is
what lets the parent keep working instead of blocking.

## 2. Why it exists — the four problems it solves

### 2.1 Context isolation
> "The child has no parent conversation history. Provide a self-contained prompt."

A subagent starts from a **clean context window**. This is the core economic argument: if a task needs
to sweep 20,000 files, the parent needs the *conclusion*, not 400,000 tokens of file dumps. The child
burns its context privately; the parent receives a summary. In this session that is exactly how the
Codex corpus census ran — 14,816 files and a full occurrence census were produced in a child, and the
parent received a count table, not the corpus.

### 2.2 Honest parallelism
`run_in_background:true` returns immediately so the parent can do disjoint work meanwhile. Used
deliberately here: the corpus census, the package-wide fuse hunt, and the corpus recount all ran
concurrently with report writing.

### 2.3 A capability ceiling, enforced by the runtime
The child is not just a prompt — it is a *sandboxed role*:

| Role | May do | May **not** do |
|---|---|---|
| `mavis` | everything | — |
| `explore` | read-only investigation | create/edit files; **cannot spawn subagents** |
| `worker` | produce changes | **cannot spawn subagents** (delegation ceiling) |
| `verifier` | review and try to **disprove** findings | edit files; **cannot spawn subagents** |

Nesting is blocked **by policy, not a depth counter** — a task-child surface has `task`,
`task_append`, `todowrite` and `ask_user` hard-blocked. This is what guarantees termination: the
delegation tree has bounded depth, so the report-back loop cannot recurse indefinitely.

### 2.4 An adversarial second opinion
`verifier`'s own configured persona on this machine reads: *"Skeptical, independent, and
evidence-driven. Try to disprove a result before accepting it."* The harness ships a role whose entire
purpose is to attack the parent's conclusions — and §7 is the story of that role working.

## 3. Observed runtime evidence on this machine

### 3.1 The agent roster — 4 built-ins, all preinstalled
`mavis agent list --include-primary` returned exactly four agents, **all sharing
`createdAt: 1791701449551`** and `creationSource: 3` (built-in):

| Agent | `agentConfigDir` | Role |
|---|---|---|
| `mavis` | `~/.minimax/agents/mavis/` | orchestrator / primary |
| `explore` | `~/.minimax/agents/explore/` | read-only search |
| `worker` | `~/.minimax/agents/worker/` | bounded production |
| `verifier` | `~/.minimax/agents/verifier/` | acceptance checks |

That they were created at the *same millisecond* is the proof they are built into the runtime rather
than created on demand.

### 3.2 Every subagent is a real session, not a prompt
`session list` shows subagents as first-class sessions carrying:

- their own `sessionId` (e.g. `mvs_beb1e17bc9e64c71a81135ec3e5a25e9`)
- `parentSessionId` pointing at the parent
- **`purpose: "local-background-task:bg_<uuid>"`** — the background-task ID is embedded in the
  session's purpose string, which is literally the join between the two subsystems
- `workspaceDir` inherited from the parent
- **`variant: "thinking"`** — subagents get the thinking variant enabled automatically, even when the
  parent session is not running it

That `purpose` field is the smoking gun: the child is a **session**, addressed by the runtime, and the
task ID is a foreign key into the background-task store.

### 3.3 The background-task store is on disk
`~/.minimax/background-tasks/bg_<uuid>/` — **3,940 files** here, each with `output.log` +
`summary.txt`. `task_output` reads from this store. This is why results survive the child's death —
and it is exactly how §7's lost findings were recovered.

### 3.4 The scratchpad is shared, the context is not
Parent and child sessions shared a `scratchpadPath`
(`~/.minimax/scratchpads/mvs_4cfad0ae…/scratchpad.md`) while holding **separate conversation
contexts**. The isolation boundary is the *context window*, not the filesystem.

### 3.5 Concurrency is capped, and you can see the cap working
Per-session child-agent concurrency is **4**; exceeding it returns `SUBAGENT_CONCURRENCY_LIMIT`. In
`session list`, several `worker` sessions appear with `createdAt == updatedAt` and `status: idle` —
sessions created and immediately finished without doing work, which is the signature of an admission
rejected by the cap.

## 4. Reconciliation — published docs vs. what I observed

Honest reporting: two fields differ between the public write-up and this build.

| Field | Published description | Observed here |
|---|---|---|
| `purpose` | `local-task:<turn>:<toolCall>` | `local-background-task:bg_<uuid>` |
| `visibility` | `'hidden'` | `visible` in `session list` |

Both are most likely version drift (the public study describes an earlier build). Neither changes the
architecture. I am flagging them rather than smoothing them over.

**Everything load-bearing matched**, and I confirmed it directly:

- exactly 3 subagent role ceilings (`explore`, `worker`, `verifier`) — matches `agent list` exactly
- delegation tools blocked on child surfaces — matches my own observation that `explore` has no
  `task_output` and is instructed not to use background bash
- result delivery is receipt-first — matches the tool contract I was given
- context is not shared — matches the instruction I had to follow when writing subagent prompts

## 5. What the todos are (and are not)

The todo list is **not** the orchestrator. It is a snapshot rendered for the user:

> `todowrite`: *"Replace the visible session task list with a complete snapshot."*
> *"Updating the list does not complete the work."*

Two properties matter:

- It is **whole-state replacement**, not a delta. Every call overwrites the visible list.
- It is **derived state**. The runtime does not schedule from it; it is a UI surface so a human can
  watch progress. The scheduling is the `task` subsystem's business.

That is also why the system keeps reminding the model to reconcile the todo list before a final
answer — it is a *reporting* obligation, not an execution one.

## 6. Why the loop is rate-limited

The background-delivery path has explicit anti-storm protection: a cap of **3 wake-ups per 60-second
window**, with retry backoff **1s → 2s → 5s**, then widening to **60s → 300s**. This exists precisely
because N background tasks finishing at once would otherwise stampede the parent with N wake-up turns.

This is the mechanism that makes the pattern *safe* rather than merely *possible*.

---

## 7. An incident worth reading: I broke the loop and lost real findings

This is the most concrete evidence I have, because it happened in this session.

I dispatched a `verifier` subagent to adversarially attack the Codex reports. It **produced no output
for an extended period** — every `task_output` call returned `(no output yet)`. I concluded it was
stalled and **cancelled it**, then wrote in `08-adversarial-pass.md`:

> "A verifier subagent was dispatched… It produced no output across an extended run and was cancelled
> without returning a verdict. **No independent verdict is claimed.**"

That was honest about what I knew — and it was **wrong about what existed**. The subagent had been
working the whole time. Its `summary.txt`, sitting on disk at
`~/.minimax/background-tasks/bg_6ab5ccf0-b288-474c-971f-1351bd9d1dff/summary.txt`, contains 27
progress lines. Its closing entry:

> "Rather than keep polling, I'll run the decisive MAIN-only probe directly (34 files, instant) while
> that job finishes on its own."

I killed it mid-investigation. And it had **already found four things**:

| Its finding | Status when I recovered it |
|---|---|
| `elevation_service` = 0 across **20,153 files / 556 MB**, including 912 files my `.js/.mjs`-only sweep excluded (33 `.wasm`, 2 `.data`, 5 `.mts`) | **Corroborates** my finding, on a broader corpus |
| IPC census holds up; the `sendInputEvent`/`sendSync` hits were substring artifacts; no hidden `ipcMain` aliasing | **Corroborates** the C-D fix |
| F1 fuse claim **confirmed and hardened** — and it noted the Electron wire layout may place data *after* the sentinel, testing both offsets across 94 PE binaries / 2.32 GB | **Strengthens** my negative |
| **`allowServiceInstallElevation` has 2 construction sites, not 3** | **REFUTES** my report 05 |
| **92 PE files, not 15** — and `d3dcompiler_47.dll` is Microsoft-signed | **REFUTES** my "every PE binary" claim |

**I verified the two refutations myself. Both are real defects in my report 05.** They are now recorded
as corrections **C-L** and **C-M** in `codex/reports/06-findings.md`, patched into
`codex/reports/05-update-and-signing.md`, and `08-adversarial-pass.md` now carries a retraction
header rather than a silent edit. The recovered log is preserved verbatim at
`codex/evidence/recovered-verifier-log.txt`.

### What actually went wrong

The failure was not in the harness. It was in **how I read the tool**.

`task_output` returning `(no output yet)` is a statement about the *delivery channel*, not about the
child's *work*. The contract says the background path returns a receipt immediately and that results
arrive later as a separate wake-up event. **`(no output yet)` on the read path is expected, not a
stall signal.** I treated "the reader is empty" as "the writer is dead" and destroyed a healthy
investigation — including a result that contradicted my own report.

This is the single most transferable lesson I have from this whole study, and it is a direct
demonstration of the pattern you asked about:

- The **loop is the product.** Parent → child → report → parent.
- Cancelling a child **destroys work that has already been done**, because the child cannot report
  what you killed before it could finish.
- The artifact survives on disk even when the delivery does not — which is how these findings were
  recovered at all.

---

## 8. Sources

**Primary — source-level study of this specific runtime** (third-party, cites file/line in the
minimax-AI source tree):
- <https://github.com/CodeAlex52/inside-minimax-code/blob/main/docs/subagents.md> — "Subagent"
  chapter. Establishes: real child sessions rather than LLM-calling-LLM; the
  `createSession → patch → submit turn` path; the shared/not-shared table; role ceilings; foreground
  vs background delivery; rate-limiting; and the closing argument that the model supplies only the
  delegation decision and the child's prompt.

**Official:**
- <https://github.com/MiniMax-AI/minimax-code> — repository (architecture documentation).
- <https://agent.minimax.io/docs/code/welcome.md> — product documentation.
- MiniMax M3 release material describing a *"Producer + Verifier adversarial harness loop"* and agent
  teams that decompose work into concurrent, dynamically-adjustable workflows — the public framing of
  the same pattern.

**Local, first-hand (this machine):**
- `mavis agent list --include-primary` — 4 built-in agents, identical `createdAt`
- `mavis session list` — child sessions with `parentSessionId`, embedded `purpose`, shared scratchpad
- `~/.minimax/background-tasks/` — 3,940 files; the on-disk task store
- `codex/evidence/recovered-verifier-log.txt` — the recovered cancelled-run log
- `harness/verify-subagent-claims.js` + `.txt` — independent verification of C-L and C-M

---

## 9. Summary

| Your observation | What it actually is |
|---|---|
| "creates a list of todo" | A **whole-state UI snapshot** for you. The runtime does not schedule from it. |
| "spawns subagent in new thread" | The runtime creates a **real child session** (`sessionType:'branch'`) with isolated context, frozen tools, inherited permissions, and nesting disabled. |
| "they report back and forth" | An **admission-receipt + wake-up delivery protocol**, rate-limited to 3 wake-ups/60s with 1→2→5→60→300s backoff, to stop a delegation storm. |
| "until the task is done" | Bounded by design: children cannot spawn children, so the delegation tree cannot recurse indefinitely. |

The harness is doing the orchestration. The model decides *whether* to delegate and *what to say*.
The thing worth remembering from §7: **cancelling a running child throws away work it has already
done** — and in this session that work included the correction to my own report.