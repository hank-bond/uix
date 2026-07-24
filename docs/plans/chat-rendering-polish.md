---
summary: "Improve Chat in seven review-gated units: block framing, Markdown and syntax highlighting, file-tool rendering, a description-bearing command tool, streamed/collapsible thinking, thinking-effort control, then performance and documentation."
status: active
---

# Chat rendering polish

Improve the appearance and rendering of the Chat surface in small units. Each unit is planned in detail immediately before implementation, implemented independently, and reviewed before the next unit begins.

This plan builds on the transcript projection and chat-block model described in [`conversation-render-primitives`](../design/conversation-render-primitives.md) and the existing model-control path described in [`agent controls`](./archive/agent-controls.md).

## C1 — Block framing and visual polish

- Remove the persistent role rail and recover its width for message content.
- Render user and agent messages as oppositely inset cards with distinct backgrounds and accessible article names.
- Render tool identity inline as `tool: {name}`, adding `(error)` only when a tool fails.
- Show a subtle semantic indeterminate progress line while a tool runs; successful completion has no status marker.
- Keep the document and workspace shells non-scrolling so each surface's named inner container remains its scroll owner.

Stop for review before C2.

## C2 — Markdown and syntax highlighting

- Render user and agent messages as Markdown; thinking reuses the same renderer in C5.
- Support Markdown structures with HTML equivalents, including headings, lists, sections, and tables.
- Add syntax highlighting for fenced code.
- Treat raw HTML as text; typed tool/custom-message renderers remain the path for richer components.
- Declare Markdown and highlighting dependencies in the Chat feature package.
- Reparse the complete accumulated message as streaming chunks arrive, deferring partial-commitment optimization until C7 measurement justifies it.

Stop for review before C3.

## C3 — File-tool rendering

- Give read and write tools purpose-built chat renderers.
- Put the file path on the first line.
- Make each tool row carry its point-in-time execution cwd and each relevant filesystem row carry an absolute path plus an optional path relative to that cwd.
- Derive the same self-contained file references during history projection by seeding from the session header cwd and folding persisted cwd state with tool calls.
- Expose current cwd to surfaces through a status snapshot plus change events.
- Show paths inside the agent cwd relative to that cwd and paths outside it as absolute paths.
- Infer syntax highlighting from the file extension.
- Keep cwd switching itself out of this branch; the future runtime rebind is captured in the [backlog](./backlog.md).

Stop for review before C4.

## C4 — Command tool

- Replace the active `bash` tool with an app-specific `command` tool rather than a UIX-global default.
- Add the workspace agent-tool policy needed to disable built-in `bash`; settle the exact unnamespaced Pi-tool loading seam while planning this unit.
- Require command and description strings, guiding the agent to provide one sentence without rejecting imperfect descriptions.
- Display only `command: {description}` in the collapsed chat row.
- Put the actual command and its streamed/final output in the hidden disclosure content.

Stop for review before C5.

## C5 — Thinking rendering

- Represent each assistant transcript item as ordered text/thinking parts under one durable message identity.
- Forward and stream model thinking content into that transcript projection.
- Render active thinking through the agent-message renderer with `agent` / `(thinking)` in the left rail.
- Change the completed label to `agent` / `(thought)`.
- Automatically collapse completed thinking to a `thought for N seconds` summary while allowing it to be reopened.
- Keep thinking duration ephemeral; replayed history need not retain it.

Stop for review before C6.

## C6 — Thinking-effort control

- Extend the substrate-owned agent controls with thinking-level status and selection.
- Add a Chat status-bar control for the current thinking effort.
- Mirror model control across the stack: a workspace default applies until native branch-aware Pi thinking-level state overrides it.
- Use Pi’s model support and clamping.

Stop for review before C7.

## C7 — Performance, verification, and docs

- Measure streaming Markdown and syntax-highlighting behavior before adding incremental parsing complexity.
- Add any justified caching or stable-prefix parsing work.
- Complete focused tests for the new rendering and backend paths.
- Update the shipped agent reference, architecture-of-record, and relevant design thread.
