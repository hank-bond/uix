---
summary: "Archived original UIX project brief from before the substrate pivot."
read_when: "Read only for historical context on the original code-reviewer-app framing."
status: archived
---

# UIX — Project Brief (archived)

> **Archived 2026-05-30.** This is the original handoff document, written when UIX was framed as a single tailor-made coding-agent IDE with reports as the central artifact. UIX has since pivoted to a _substrate_ shape that hosts multiple applications (a code-reviewer being one, a knowledge-base manager being another). The still-current pieces — Gundam framing, motivating problems, stack landings, design principles — have moved to [the decisions log](../../decisions/). The rest is preserved here as the design source for the eventual code-reviewer extension.

> Handoff document for an agent continuing this conversation. The goal is to capture **project context and decisions made**, not the exploratory technical Q&A that produced them.

---

## 1. What we're building

**UIX is a tailor-made desktop IDE for working with coding agents.** It is not an agent — the agent is [pi](https://github.com/earendil-works/pi-mono) (`@earendil-works/pi-coding-agent`). UIX is the **cockpit** around pi.

### The Gundam metaphor (load-bearing)

> "I am basically just creating a UI to hook [pi] into like a human in a Gundam. Normally the harness is tools you give to the agent, but I mostly want **tools you give to the human to work with the agent**."

This frame is the single most important design constraint. UIX is not adding agent capabilities. It is adding **pilot capabilities**: displays the human sees, controls the human's hands operate, and memory aids that mean the human doesn't have to hold everything in their head.

Every feature decision should pass the test: _does this help the pilot see, decide, or act?_ If it's "make the agent smarter," it belongs in pi, not UIX.

---

## 2. Why this exists

The user's stated problems with current agent UX:

1. **TUI agents force linear, scroll-heavy interaction.** When the agent asks 5 questions at the top of a long response, you have to scroll up to read them and back down to answer. The interaction model is anchored to "type at the bottom" and it's wrong for anything richer than chat.

2. **Reviewing agent-generated code is unreviewable at volume.** "Ask an agent for a well-specced feature, get 1000 lines back, now what." Markdown summaries of 300+ lines are unreadable. There's no structured way to navigate, sample, or interrogate a large change.

3. **Side-quest workflows are clunky.** When something goes wrong mid-conversation, the user wants to: branch off → reflect → update skills → return to the bad turn → rerun with the updated skill → continue. Pi's primitives support this; the UX around it doesn't really exist anywhere.

4. **No queue for "fix this later."** When the user notices a problem but doesn't want to stop now, there's no good way to bookmark "come back and reflect on this" across sessions.

5. **The user has many specific ideas about agent-driven code UX that are unmet by anything on the market and wants to explore that design space.**

---

## 3. Core product concepts

### 3.1 Conversation pane (the linear chat)

Standard chat with the agent. Linear, persistent, one per task. Streaming input/output. This is the normal pi experience, just rendered in UIX.

### 3.2 Reports (the killer feature)

Reports are **separate, structured artifacts the agent generates by writing files**. They are not "rich chat messages." They are documents the user opens in their own pane/tab, and they're how the user reviews and interacts with substantial agent work.

Key decisions:

- **Reports are markdown files on disk** (probably `<project>/.uix/reports/<id>.md`). The agent doesn't get a custom tool to manipulate them — it uses its existing file edit tools.
- **The app renders the file richly** in a report pane. File watcher + debounced reparse + re-render. Streaming "for free" because each agent edit triggers a re-render.
- **Custom block vocabulary.** Reports contain regular markdown plus fenced custom blocks (`question`, `diff`, `code`, `table`, `callout`, `tldr`, `call_tree`, etc.). The user controls the vocabulary; the agent writes structured payloads into it. This is closer to Notion blocks than to "agent writes JSX."
- **Format**: fenced markdown with YAML headers in the fence is the working hypothesis. Readable on disk, easy for the model to produce, easy to parse.
- **Append-only is the default.** Updates to a block are allowed for specific cases (revising a streaming diff that finished wrong) but the report's history is preserved.
- **Reports persist forever.** They're files. They can be opened in any editor, grepped, committed to git, diffed across runs.

### 3.3 Inline question blocks (the scroll-fix)

A `question` block has a text input _inline at the location of the question_, plus a local submit button. The user fills in answers wherever the questions appear in the document and can submit answers per-block or in batch.

- The user types into the input fields in the report. The app writes those answers back into the same file (probably into the same block's `answer:` field).
- When the user clicks submit, the **app** posts a message into the conversation pane (on the user's behalf) along the lines of "Submitted answers in `report-42.md`: q1, q3, q5. Skipped q2, q4." The agent reads the file for details.
- Submitted question blocks become read-only and visually marked as such.

This is what fixes the "scroll up to read questions, scroll down to answer" problem of TUI agents.

### 3.4 Locking and turn semantics

Naturally turn-based. The agent writes during its turn; the user writes (into answer fields) when it's their turn. This matches the conversation rhythm and avoids needing a real locking protocol. The conversation pane already gates whose turn it is.

### 3.5 Deep tree navigation

Pi already stores sessions as trees (`id` / `parentId`, leaf-tracked, with branch summaries, labels, custom entries). The TUI exposes `/tree`, but UIX renders this far more richly:

- A real tree pane (not a popup), always available.
- Multiple rendering modes possible: linear timeline with branch indicators, full graph, swimlane per branch, etc.
- Surfaces metadata not just structure: token cost per branch, retry counts, label markers, custom-entry annotations.
- Filters: default, no-tools, user-only, labeled-only, all (pi's modes) plus app-specific filters.

### 3.6 Side-quest workflow

The signature interaction:

```
1. At a bad turn (entry id BAD):
   - sm.appendLabelChange(BAD, "bad-turn")

2. Branch off to side-quest (e.g., reflect on what went wrong):
   - session.navigateTree(parentOf(BAD), { summarize: true })
   - run reflection, update skill files on disk

3. Return and retry the bad turn with the updated skill:
   - session.navigateTree(BAD, { customInstructions: "Retry with updated skill X" })
   - skill files are already updated; agent re-runs the turn

4. If it worked: continue. If not: navigate back and try a different fix.
```

This maps almost 1:1 onto pi's `session.navigateTree()`, `appendLabelChange()`, `fork()`, and `branchWithSummary()` APIs. The cockpit's job is to make this a few-click gesture, not a manual orchestration.

### 3.7 Reflection queue

Cross-session worklist of "fix this later" items. Implementation:

- User marks any entry with the label `needs-reflection` (or similar) from the tree pane.
- A queue panel walks all sessions (via `SessionManager.listAll()`), finds entries with that label, and presents them as a worklist.
- Clicking an item navigates to that entry in that session.
- The queue is its own pane/tab.

A small **SQLite mirror** of session metadata is the right way to make these cross-session queries instant (parsing all JSONL on every query is slow). JSONL stays the source of truth; SQLite is a derived index rebuilt as sessions append.

### 3.8 Cockpit-style HUD

Things the pilot should see without asking:

- Pending steering / follow-up queue (pi emits `queue_update`).
- Token burn, cost per branch, context-window usage.
- "Skill X was updated 2 hours ago; turns since haven't used it."
- "You have 3 entries labeled needs-reflection across all sessions."
- "This branch has retried 2 times."

These all derive from data pi already exposes. UIX is the HUD that surfaces them.

### 3.9 Other ideas surfaced (not yet detailed)

- **LSP-powered call-path tree** for reviewing diffs. For each changed function, show callers / callees one level deep, expandable. The harder version is **diffing the call graph** before/after a change — genuinely novel review tool. Start with the simpler version.
- **"Why am I here?"** — at every fork point, a one-line auto-or-manually-generated summary of why the user started this branch. Stored as a custom entry at the fork point. Surfaces in the tree view.
- **Skill effectiveness ledger** — track which skills were updated when, and whether subsequent turns improved. Aggregated from JSONL across sessions.
- **Unified text input via Monaco everywhere.** Same editor for the prompt box, inline question answers, code editing, and scratch buffers. Consistent keybindings and completion behavior across the whole app. Custom completion providers (`@file`, `@symbol`, `@report`, `/command`) layered on top.

---

## 4. Architecture

### 4.1 High-level shape

```
Main process (Electron, Node):
  - pi runs in-process via the SDK (createAgentSessionRuntime).
  - Subscribes to AgentSession events; forwards typed deltas to renderer via IPC.
  - Exposes IPC commands for: prompt, navigate tree, fork, label,
    append custom entry, etc.
  - Watches report files in <project>/.uix/reports/; forwards changes.
  - Maintains a SQLite index over sessions for cross-cutting queries.

Renderer (React + …):
  - Conversation pane (streaming from event subscription).
  - Tree pane (built from SessionManager.getTree() via IPC).
  - Report panes (rendered from file content; edits written back).
  - Queue panel (aggregates labeled entries from SQLite index).
  - HUD elements (cost, status, queued commands).

Files on disk:
  - ~/.pi/agent/sessions/...       ← pi's session JSONL (canonical conversation tree)
  - <project>/.uix/reports/    ← reports (canonical artifacts)
  - <project>/.uix/index.db    ← SQLite cross-session index (derived, rebuildable)
  - App-specific state tied to tree positions lives in pi's custom entries
    inside the session JSONL — *not* in sibling files.
```

### 4.2 The pi integration is via SDK, not subprocess

Pi is a Node package. Electron's main process is Node. Use `createAgentSessionRuntime()` directly. No JSON-RPC, no stdio parsing. Typed events, direct access to `session.agent.state.messages`, full `SessionManager` tree API.

Subprocess via `--mode rpc` is the _wrong_ choice here because we want type safety, in-process access to agent state, and programmatic customization of tools/extensions.

**Caveat**: when `runtime.session` is replaced (after new/fork/switch/clone), re-subscribe and re-`bindExtensions`. Wrap in a controller that handles this transparently.

**Phase 2 option**: if pi running in main ever becomes a stability concern, Electron's `utilityProcess` can isolate it into a managed Node subprocess while still using the SDK. Don't do this day one.

### 4.3 What pi gives us for free

Pi's primitives map directly onto what UIX needs. Things the cockpit consumes rather than reimplements:

- **Tree structure**: `SessionManager.getTree()`, `getChildren()`, `getEntry()`, `getBranch()`.
- **In-place tree navigation**: `session.navigateTree(targetId, { summarize, customInstructions, label })`.
- **Forking / cloning**: `runtime.fork(entryId)` and `runtime.fork(entryId, { position: "at" })`.
- **Labels**: `SessionManager.appendLabelChange(entryId, label)`.
- **App state at a tree position**: `SessionManager.appendCustomEntry(customType, data)` — not sent to LLM.
- **Inject context as agent sees it**: `SessionManager.appendCustomMessageEntry(customType, content, display, details)` — sent to LLM.
- **Cross-session enumeration**: `SessionManager.list(cwd)`, `SessionManager.listAll()`.
- **Steering/follow-up queue**: pi events expose this; HUD surfaces it.

### 4.4 Reports are not in pi's state

Reports are files in the project directory, watched and rendered by the app. They are linked to session entries via custom entries (e.g., `customType: "uix:report-link"` with `data: { reportPath, blockId? }`) so the tree view can show "📄 report-42" next to relevant entries, but the report content lives on disk separately.

---

## 5. Tech stack (final landing)

```
Shell:           Electron + electron-vite
Language:        TypeScript everywhere
UI:              React + React Compiler (auto-memoization)
Components:      shadcn/ui on Radix primitives, styled with Tailwind
State:           Zustand
Schemas:         Zod (source of truth; TS types via z.infer)
Editor:          Monaco (isolated behind one Editor component, mode-driven)
Virtualization:  @tanstack/virtual
Workers:         Web Workers + Comlink for JSONL parsing / indexing
Storage:         better-sqlite3 for cross-session index; files for truth
File watching:   @parcel/watcher (faster than chokidar at scale)
Tests:           Vitest
Not picking:     router, async query lib, CSS-in-JS, big component library
```

### Why these specifically

- **Electron over Tauri**: shipping speed wins. The user prioritized building over learning Rust. Electron + discipline gets VS Code–class performance; the 150MB installer cost is paid once on a dev machine.
- **React over Solid**: with React Compiler in the picture, the auto-memoization eliminates the main perf-tuning tax that would have favored Solid. React keeps the bigger ecosystem and stronger LLM training coverage.
- **shadcn/Radix/Tailwind over Mantine**: matches the project's stated philosophy of _small primitives, maximal composition, code you own_. Mantine is a fine component library but the user explicitly wants pi-shaped tooling.
- **Zustand**: tiny API, no ceremony, composes by importing slices, persists trivially.
- **Zod**: one source of truth for block schemas, IPC contracts, and agent-output validation; converts to JSON Schema for prompting.
- **Monaco**: the philosophical exception. Large surface area but does too much of what's needed (code editing, completions API, decorations, themes) to justify rebuilding. CodeMirror 6 would be more pi-shaped but costs feature parity and LLM corpus. Isolate behind one `<Editor mode="..." />` component so it's swappable.
- **@tanstack/virtual**: non-optional once trees / chats / reports have many items.
- **SQLite index**: cross-session queries (labels, search, filters) are otherwise slow on JSONL.

### Stated design principles to carry into code

- **Define small primitives, not big components.** Compose.
- **One or two exports per module.** Resist barrel files and god-objects.
- **Schemas are sources of truth.** Don't hand-write parallel TS types.
- **Functions over classes.**
- **Events over polling.** Pi gives events; files have watchers; state emits to subscribers.
- **Append-only where possible.** Reports, sessions, custom entries.

---

## 6. Suggested day-one milestones

In rough order — each one should be small and end-to-end working before the next.

1. **Electron + electron-vite scaffold** with the React + Tailwind + shadcn setup, building and running.
2. **Pi SDK wired into main process.** `createAgentSessionRuntime()`, subscribe to events, forward to renderer over IPC, expose a `prompt` IPC command. Get the basic conversation pane round-tripping with pi.
3. **Tree pane.** Use `SessionManager.getTree()` over IPC, render a basic tree, support clicking an entry to navigate via `session.navigateTree()`.
4. **First report block.** Define the `question` block schema in Zod. Build the markdown parser. Render question blocks with text inputs. Wire the local submit button to (a) write answers into the file and (b) post a summary message into the conversation pane.
5. **File watcher in main + report pane rendering.** Streaming for free.
6. **Labels.** UI to label any tree entry. A "labeled entries" panel that filters the current session.
7. **SQLite index + reflection queue.** Index all sessions, surface cross-session label queries in the queue panel.
8. **Side-quest workflow as a real gesture.** Select entry → "start side-quest" → automatically navigate to parent, branch, prefill prompt, etc.

This sequence builds the foundation (SDK access, tree, reports, labels) before tackling the more ambitious workflow features.

---

## 7. Open questions / things to think about next

These came up but weren't fully resolved:

- **Report block vocabulary v0.** What's the minimum useful set? Probably `tldr`, `text`, `code`, `diff`, `question`, `callout`. Each needs a Zod schema and a renderer.
- **Inline answer round-trip details.** Format of the `answer:` field in question blocks, how partial answers serialize, how skipped questions are encoded, what the auto-posted conversation message looks like.
- **Streaming parse robustness.** Mid-write blocks will be malformed; render them as "in progress" rather than failing.
- **Completion provider architecture.** A unified system for `@file`, `@report`, `@symbol`, `/command` across every Monaco instance. Worth designing once.
- **Tree view rendering choices.** Linear-with-branches vs. real graph vs. swimlane. Probably linear first, real graph as a power-user view later.
- **Cost / token HUD details.** What's surfaced where. Pi emits enough data; the question is presentation.
- **Call-path tree block.** Real but ambitious. Build the simpler "callers/callees one level" version before attempting the call-graph-diff version.
- **Agent prompt for the report workflow.** A short addendum to the system prompt explaining the report file convention and the question-block contract. This is the one place where the agent needs to know UIX exists.
- **Skill effectiveness ledger.** Defined conceptually; mechanics not yet specified.

---

## 8. What this brief deliberately leaves out

- The exploratory back-and-forth that produced these decisions (Tauri vs. Electron, Solid vs. React without Compiler, Mantine vs. shadcn). The landings are stated; the journey is not.
- The "agent generates JSX" option for reports. Rejected in favor of structured blocks in files.
- The "custom RPC tool surface for the agent to manipulate the UI" option. Rejected in favor of "agent writes files, app renders." Pi's existing file edit tools are sufficient.
- The "report as the conversation, structured" framing. Rejected in favor of "conversation pane is the conversation; reports are artifacts the agent writes via tools (i.e., file edits)."

---

## 9. The shape of the project, in one sentence

**UIX is an Electron + React cockpit around pi that turns pi's already-rich session tree and file-editing primitives into a 2D workspace for reviewing, navigating, and steering coding agents — with structured reports as the central artifact and tree-based side-quest workflows as the central interaction pattern.**
