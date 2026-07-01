---
summary: "How the cockpit drives the agent today: it lazily owns a persisted pi AgentSession, forwards a UIX-shaped event stream to the renderer, delegates reload, binds the core anchored document read/write/edit tools, and flushes registered agent-context contributions as display-hidden custom entries at agent-run prep."
status: active
---

# Agent integration

UIX owns one pi `AgentSession` for the cockpit, created lazily the first time the renderer sends a prompt. The current driver lives in `src/main/agent/driver.ts`.

Current behavior:

- the session is resumed or created under the workspace state root;
- renderer prompts call `window.uix.sendPrompt({ text })`, which invokes the main-process driver;
- the renderer receives a UIX-shaped event stream over typed Electron IPC: transcript item appends, compact in-flight partials (`transcript_partial`: streamed assistant text appends, tool progress snapshots overwrite), whole-item replacements at completion, plus basic lifecycle markers; live in-flight tool partials are discarded when the final item arrives;
- `window.uix.getHistory()` replays the same durable transcript item shape from pi's persisted session branch;
- `window.uix.reload()` reloads UIX extensions and delegates to `session.reload()` only if a pi session already exists;
- core substrate tools are registered through internal agent installers (`AgentInstaller`), not through the public UIX extension API.

## Transcript projection

UIX keeps three related units distinct:

1. **Pi session entries** are the durable history/tree substrate. They are persisted by pi with `id`/`parentId` and represent conversation/state-machine steps such as user messages, assistant messages, tool results, custom messages, custom entries, model changes, and compactions. From the UI's point of view these are the branchable history units, not necessarily the smallest visible UI units.
2. **`TranscriptItem`s** are UIX's renderer wire shape. Main projects live pi events and replayed durable session entries into this one shape so the chat pane consumes the same model for live streaming and startup history. While an item streams, compact `transcript_partial` events update it by id (the renderer accumulates streamed text; tool progress payloads are replacement snapshots); a full replace of that one item lands at completion. Nothing ever replaces a whole turn or whole transcript.
3. **Chat blocks** are renderer units. A block is the smallest rendered chat-stream unit and is a view over the transcript projection. Today each `TranscriptItem` renders as one block, but the model intentionally allows one session entry to project to many transcript items and one transcript item to render as many blocks later.

This separation keeps pi's durable tree, UIX's streaming/replay normalization, and React rendering independent enough to evolve without re-keying the session format. Chat block renderers may also present a human-facing projection of an agent-facing payload: for example, canvas tool results keep anchored lines in the transcript item so the agent can edit safely, while the chat block hides the anchors from the human display.

The current canvas agent-tool contribution lives in `src/features/canvas/backend/contributions/agent-tools.ts` and contributes the anchored canvas channel:

- `canvas__anchor_read({ key, start?, end? })`
- `canvas__anchor_write({ key, html })`
- `canvas__anchor_edit({ key, start_line, end_line, replacement })`

Canvases are addressed by key through the substrate document store (`src/main/documents/store.ts`), edited via the anchored core (`src/main/anchors/`), and canonicalized at the canvas buffer boundary (`src/features/canvas/backend/normalize.ts`). The tools are canvas-named because every HTML document edited through them is a canvas; the document storage abstraction lives underneath the canvas buffer. Every result returns the affected lines in the `<anchor>§<text>` wire format so the agent never re-reads to learn current anchors.

## State messages

Cockpit state reaches the agent through **agent context** (`src/main/agent/agent-contexts.ts`), never by rewriting the human's prompt text. Features declare contributions with a local `name` and optional buffer semantics; the substrate derives the canonical id (`${featureId}.${name}`, e.g. `canvas.pane-visibility`) which becomes both the dedup key and the inner section tag (used directly: `<canvas.pane-visibility>`). An **update** buffer carries a TypeBox schema and returns a handle with `update(payload)`; UIX retains the latest value and flushes it only when its post-materialized body differs from the nearest persisted section on the branch. An **append** buffer returns a handle with `append(payload)`; UIX queues values, materializes the pending list, and clears the confirmed batch only after the branch shows it was persisted. A contribution with no buffer supplies `materialize()`, called while UIX prepares an agent run, for state that must be created from the owner's live store at that boundary. The driver installs the assembler into pi at extension activation; on activation it captures the installed registrations and computes the vocabulary section once (a byte-stable prefix). When anything flushed, it ships **one combined `display: false` custom message per run**: a single `<uix-state>` envelope containing one inner tag per section (e.g. `<canvas.pane-visibility>`, `<canvas.canvas-diff>`), persisted as one `uix.state` session entry — hidden from the chat, model-visible. The inner tags carry "what kind" on the wire because pi strips customType from LLM context; section bodies are freeform per type (default JSON for buffered payloads, anchored lines for diffs), and `details` carries any structured sidecar. Update buffers are **change-only**; append buffers are **pending-event queues**; no-buffer materializers decide whether to send by returning a message or `undefined`.

Features never call individual registration methods — `registerAgentContextContributions(agentContext, featureId, contributions)` is the sole registration path, accepting the author-facing `AgentContextContribution[]` and returning a `Disposable`.

The canvas agent-context contribution factory (`src/features/canvas/backend/contributions/agent-contexts.ts`) returns two contributions: `pane-visibility` (`{"canvases_open": [...]}`, change-only, canonical id `canvas.pane-visibility`) and `canvas-diff` (the anchored human-edit hunks, a consuming read computed at the boundary, always sent when present, canonical id `canvas.canvas-diff`). The substrate `registerAgentContextContributions(agentContext, featureId, contributions)` helper owns registration and disposal.

There is no public UIX-extension API today for contributing pi tools, agent context, or agent-turn triggers from pane/channel events.

See [`panes.md`](./panes.md), [`extensions.md`](./extensions.md).
