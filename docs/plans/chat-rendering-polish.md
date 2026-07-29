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

- Make each tool row carry its point-in-time execution cwd and each relevant filesystem row carry a `ToolFileLocation`: a lexical absolute path plus a cwd-relative-or-absolute display path.
- Derive the same self-contained file locations during history projection by seeding from the session header cwd and folding persisted cwd state with tool calls.
- Expose current cwd to surfaces through a status snapshot plus change events.
- Add an explicit feature-level seam for exact-name tool overrides; ordinary feature tools remain namespaced, and competing exact-name claims fail the later feature's activation.
- Add a default surface-less `workspace_tools` feature that overrides Pi's `read` and `write` definitions under their existing names, delegates execution to Pi, and requires a concise `reason`. Its parameter schemas derive Pi's baseline schemas and add only the UIX field. Exact-name registration shadows the built-ins, so no separate read/write disabling policy is needed. Chat remains an independent consumer, and new-workspace scaffolding composes both features as adjacent manifest entries.
- Give reason-bearing `read`/`write` calls purpose-built Chat renderers whose collapsed state shows the displayed path plus reason and no file-content preview. Put the complete read result or write content in an explicit accessible disclosure. Calls without a compatible reason shape fall back to ordinary tool input/output rendering, so Chat remains usable with another exact-name provider and with older history.
- Show paths inside the execution cwd relative to that cwd and paths outside it as absolute paths.
- Infer disclosure syntax highlighting from the file extension.
- Keep cwd switching itself out of this branch; the future runtime rebind is captured in the [backlog](./backlog.md).

Stop for review before C4.

## C4 — Command tool

- Extend the surface-less `workspace_tools` feature with an app-specific `command` tool rather than exposing Pi's implementation-named `bash`; built-in `edit` remains active.
- Derive `command` parameters from Pi's baseline Bash schema, add only the required concise `reason`, and delegate execution to Pi's cwd-bound Bash definition. The Agent/UI vocabulary remains shell-neutral while Pi selects the host shell.
- Add the workspace agent-tool policy needed to disable built-in `bash`; unlike the same-name read/write overrides, `bash` does not disappear merely because `command` exists.
- Guide the agent to provide one concise reason sentence without rejecting imperfect reasons.
- Display only `command: {reason}` in the collapsed chat row.
- Put the actual command and its streamed/final output in the explicit disclosure content.

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
- After the complete model, cwd, and thinking-control shape is visible, reassess `src/main/agent/driver.ts` for discrete ownership units and extract only boundaries earned by the implemented behavior.

Stop for review before C7.

## C7 — Performance, verification, and docs

- Measure streaming Markdown and syntax-highlighting behavior before adding incremental parsing complexity.
- Add any justified caching or stable-prefix parsing work.
- Complete focused tests for the new rendering and backend paths.
- Update the shipped agent reference, architecture-of-record, and relevant design thread.
