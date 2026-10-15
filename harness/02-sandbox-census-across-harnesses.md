# 02 — Do LLM harnesses sandbox? A six-project static census

**Date:** 2026-10-14
**Question:** Do `jan`, `atomic-agents`, and comparable harnesses implement execution sandboxing?
**Method:** shallow clone at pinned commit → split every file into **first-party CODE / DOC / VENDOR** → census containment primitives → read the deciding code.
**Nothing was executed.** No harness was installed or run.

---

## 0. Why the CODE/DOC/VENDOR split is the whole answer

Three traps, all of which I hit:

1. **A README sentence is not a sandbox.** "Sandboxed execution" in docs proves a *claim*.
2. **Vendored code is not the host project's security posture.** `open-interpreter` at
   `ac1fcc8fe57a` contains **8,079 vendored files** under `codex-rs/` — the entire OpenAI Codex
   Rust CLI. Scored naively it looks like the most sandboxed project in the set
   (523 seatbelt / 425 bubblewrap / 69 Landlock). Its **first-party source is 239 files**, and
   **every one of those sandbox primitives is absent from it.** Its first-party sandbox hits are
   build/install scripts that ship Codex's binaries.
3. **Model names are false positives.** `e2b` matched `gemma-4-E2B-it-IQ4_XS` in jan and
   `google.gemma-4-e2b` in goose — 7 and 5 occurrences respectively, **zero** of them E2B sandboxes.
   `docker exec` matched jan's TUI job-control text about `docker exec -it`.

Every number below is first-party CODE only.

---

## 1. Commits examined

| Project | Commit | First-party files | DOC |
|---|---|---|---|
| `janhq/jan` | `2ff2c4f4f982740d` | 1,443 | 203 |
| `BrainBlend-AI/atomic-agents` | `4d4434745234b57d` | 212 | 98 |
| `huggingface/smolagents` | `96f33faaf0284791` | 75 | 83 |
| `All-Hands-AI/OpenHands` | `71427af5b426b3f1` | 2,305 | 83 |
| `block/goose` | `9686d674000a5fbb` | 1,303 | 371 |
| `openinterpreter/open-interpreter` | `ac1fcc8fe57aba51` | **239** (+8,079 vendored) | 165 |

---

## 2. Result matrix

| Harness | OS sandbox? | Mechanism | Enforced where? | Approval gate |
|---|---|---|---|---|
| **jan** | **YES — all 3 platforms** | bubblewrap / seatbelt / **AppContainer + Job Object** | `tauri-plugin-agent-tools` | yes |
| **atomic-agents** | **no — out of scope** | none | never executes shell | n/a |
| **smolagents** | **optional, remote** | E2B SaaB executor | only when `executor_type="e2b"` | minimal |
| **OpenHands** | **containerised app** | the whole app runs in Docker | process boundary, not per-command | yes |
| **goose** | **NO — removed** | none (docs state it) | — | `GOOSE_MODE` approve / smart_approve |
| **open-interpreter** | **delegated** | inherits Codex's | via vendored `codex-rs` | via Codex |

---

## 3. jan — the strongest implementation in the set

`jan` is the only project here with a genuine, hand-written, three-platform OS confinement layer.

**`src-tauri/plugins/tauri-plugin-agent-tools/src/tools/jail.rs`** carries 74 seatbelt + 40 bubblewrap
+ 1 Landlock references in one file. The CLI surface exposes both directions:

```rust
struct SandboxArgs {
    /// Run shell commands under OS confinement (bubblewrap, Seatbelt, AppContainer)
    #[arg(long)] sandbox: bool,
    /// Run shell commands unconfined, overriding a persistent sandbox setting
    #[arg(long, ...)] no_sandbox: bool,
}
```

**`tools/appcontainer.rs`** is real Windows containment — 6 Job Object + 4 AppContainer references,
and the comment explains the mechanism precisely:

> *"AppContainer blocks loopback as well, which the Unix backends do not. Unlike bubblewrap and
> Seatbelt there is no argv to wrap: the confinement is a **token attribute passed to
> `CreateProcessW`**, and `tokio::process::Command` exposes no…"*

using `CreateJobObjectW` / `AssignProcessToJobObject` / `SetInformationJobObject` with
`JOBOBJECT_EXTENDED_LIMIT_INFORMATION` — the same primitives Codex uses, implemented independently.

**The design detail worth stealing** — `commands.rs` returns a status struct that models
enforcement explicitly:

```rust
pub struct SandboxStatus {
    /// Backend name for display: `bubblewrap`, `seatbelt`, `appcontainer`, `none`.
    pub backend: String,
    pub enforces: bool,
}
```

> *"Report the sandbox backend so the frontend can decide whether to…"*

`enforces: bool` is exactly the field whose absence produced **Claude's F13** — `failIfUnavailable`
defaults to false, so the gate is suppressed on the assumption of containment without any
observable signal that containment is live. jan carries that signal in its API surface.

Other first-party hits: `proc.rs` (bubblewrap 5), `commands.rs` (bubblewrap 2), and
`tauri-plugin-llamacpp/src/engine/worker.rs` (Job Object 6 — for the inference worker, not tools).

---

## 4. atomic-agents — sandboxing is out of scope, and that's a fair design

**All seven primitives are 0 across 212 first-party files.** No seatbelt, no bubblewrap, no Landlock,
no E2B, no Docker, no Job Object, no AppContainer. `permission` appears 3 times; `approval`,
`allowlist`, `jailbreak`, `untrusted` are all 0. Only `subprocess`/`exec` appear twice, both in
tests.

This is the correct answer for what atomic-agents *is*: a Pydantic + Instructor composition library
(`AtomicAgent`, `AgentConfig`, `ChatHistory`, `SystemPromptGenerator`) that builds pipelines. It
executes no shell and takes no tools the caller doesn't hand it. **The security question transfers
entirely to the integrator**, which is the right place for it — but it means atomic-agents offers
no help and no default to a caller who forgets.

---

## 5. smolagents — sandbox by remote execution, and it is opt-in

The only containment primitive in first-party code is **E2B: 16 occurrences across 3 files**, led by
`src/smolagents/remote_executors.py` (8) and `src/smolagents/agents.py` (4), with
`examples/sandboxed_execution.py` (3) showing the pattern:

```python
agent = CodeAgent(tools=[WebSearchTool()], model=model, executor_type="e2b")
```

There is **no local OS sandbox** — no seatbelt, bubblewrap, Landlock, Docker, Job Object, or
AppContainer. The architecture is: code executes **inside a remote E2B sandbox**, so there is no
local confinement primitive to find. Note the `executor_type=` is a parameter, meaning the
sandboxed path is **a choice the caller makes per agent**, not a default. `dangerously`/`--yes`/
`auto_approve` appears once.

Design implication: remote execution gives containment by *moving the work*, which is stronger than
local sandboxing on the host but costs latency and requires a network service.

---

## 6. OpenHands — containment is "the app is in a container"

First-party `docker exec` appears 6 times, all in `docker/entrypoint.sh`, `docker/smoke-test.sh`,
and `playwright.mock-llm-docker.config.ts`. Zero seatbelt/bubblewrap/Landlock/JobObject/AppContainer.

OpenHands' model is different from the others: **the agent runs inside Docker**, so the container
*is* the boundary for every command at once. That is a valid and common strategy, and arguably
stronger than per-command sandboxing — but it is a deployment property, not something the code
enforces for you. `sandbox` appears 481 times (mostly generic container vocabulary),
`approval` only 3, `permission` 141.

---

## 7. goose — removed its sandbox, and says so in writing

This is the clearest result in the set, because goose **documents the removal explicitly** rather
than leaving me to infer it. From
`documentation/blog/2026-02-23-goose-v1-25-0/index.md:22`:

> *"The macOS seatbelt sandbox described in this section was experimental and **has been removed**.
> The `goose` server process (which executes tools) **runs with the same permissions as your user
> account and is not sandboxed at the OS level**. For security controls, see `GOOSE_MODE`
> (`approve`, `smart_approve`) to restrict what tools can run without confirmation."*

That matches the census exactly: seatbelt **0 in first-party code**, 4 in docs — and every one of
those 4 is the retrospective note saying it went away.

goose's remaining containment is Docker-scoped, but for **extensions**, not for shell commands:
`crates/goose/src/agents/container.rs` (a `Container { id: String }` wrapper),
`extension_manager/builtin.rs` (*"Starting builtin extension inside Docker container"*), and
`extension_manager/stdio.rs` (*"Starting stdio extension inside Docker container"*).

**goose is therefore an approval-gate-only design, by explicit decision** — precisely the shape we
discussed as weakest. `GOOSE_MODE` ∈ {`approve`, `smart_approve`} is the whole of it.
`permission` 733 occurrences reflects a rich *model-permission* surface; that is tool scoping, not
OS containment.

---

## 8. open-interpreter — no first-party sandbox; it delegates to Codex

The 8,079-file `codex-rs/` tree is the whole story. Stripped of it, open-interpreter has **zero**
seatbelt, Landlock, Job Object, and AppContainer references, and its 36 bubblewrap / 14 docker-exec
hits are **build and install scripts** (`scripts/install/install.sh`,
`.github/scripts/build-codex-package-archive.sh`, `codex-cli/scripts/run_in_container.sh`).

Architecturally this is interesting rather than alarming: open-interpreter appears to be rebuilding
around Codex as its execution engine. In that arrangement the sandbox *is* Codex's — seatbelt,
Landlock+bwrap, Windows restricted token, all the things catalogued in the Codex reports. The
security posture is real, but it is **inherited, and it lives in a vendored dependency the user did
not choose to audit**.

---

## 9. Cross-project comparison, including the two shipped products

| | jan | atomic-agents | smolagents | OpenHands | goose | open-interp. | **Claude** | **Codex** |
|---|---|---|---|---|---|---|---|---|
| OS-level sandbox | **3-platform** | none | remote (opt) | app-in-container | **none (removed)** | inherited | config + fail-open default | seatbelt/Landlock/job object |
| Approval gate | yes | n/a | minimal | yes | **the only control** | via Codex | yes | yes |
| Injection handling | 12 refs | 0 | 5 | 4 | **173** | 0 | 11 (prompt-level) | — |

The interesting outlier is **goose**: 173 first-party `prompt injection`/`untrusted` references —
the highest in the set — paired with **no OS sandbox at all**. goose has invested heavily in
*reasoning about* injection and not at all in containing it. That is precisely the layering I argued
against: the cheapest control to build is prose in a system prompt, and it is the one an attacker
is actually trying to defeat.

---

## 10. Findings

| ID | Sev | Finding |
|---|---|---|
| **H1** | **medium** | **goose removed its only OS-level sandbox and now relies on `GOOSE_MODE` approve/smart_approve alone.** Self-documented, so not hidden — but a shell-executing agent now runs with full user permissions on the strength of a permission dialog. |
| **H2** | medium | **smolagents' containment is opt-in per agent** (`executor_type="e2b"`). An agent constructed without that parameter executes code with no sandbox and no default warning visible in the library. |
| **H3** | info | **open-interpreter's apparent sandbox posture is ~97% vendored** (8,079 of 8,318 source files are `codex-rs`). Any audit reading the tree at face value would credit open-interpreter with a sandbox it does not implement, and miss that its real boundary is a third-party dependency. |
| **H4** | **positive** | **jan is the only project here with genuine hand-written three-platform confinement**, and it exposes `SandboxStatus { backend, enforces }` — an enforcement-liveness signal. This is the specific field whose absence causes Claude F13. |
| **H5** | **positive** | **goose documents its own sandbox removal** rather than deleting the trail. Rare, and it made this audit possible instead of speculative. |
| **H6** | info | **`e2b` is a recurring false-positive needle** — it is a substring of the Gemma "E2B" model tier (`gemma-4-E2B-it`, `google.gemma-4-e2b`). Any census using it must exclude model-name contexts. |

---

## 11. What this census does NOT establish

1. **No execution.** Whether any of these sandboxes actually confines a syscall on a given platform
   is not shown by reading code.
2. **Head ≠ default.** jan's `--sandbox` is a flag; whether the desktop UI enables it by default was
   not traced to the UI layer. `SandboxStatus` exists precisely so the UI can decide — I did not read
   what it decides.
3. **Only first-party code was classified.** A vendored tree I failed to recognise would inflate a
   count; I found and corrected one such case (`codex-rs`), but cannot prove there is no second.
4. **Six projects is a sample, not a survey.** The set was chosen to span the design space
   (desktop app / library / remote-exec library / containerised app / permission-only desktop /
   delegating app), not to be exhaustive.
5. **Prompt-injection needle counts are raw occurrence counts**, not weighted by whether the text is
   a real control or a comment.
6. **No dependency was installed and no project was run.**

---

## 12. Evidence index

| File | Contents |
|---|---|
| `evidence/sandbox-census.js` → `.txt` | 6-group census over all six repos, 60 needles, positive controls |
| `evidence/sandbox-detail.js` → `.txt` | Per-file hits with code snippets; classified CODE/DOC/VENDOR |
| `evidence/sandbox-vendor-fix.js` → `.txt` | Vendor audit + corrected first-party-only matrix (the authoritative table) |

Scratch clones: `%TEMP%\harness-sandbox\` (shallow, pinned). Nothing was executed; no harness was installed.