---
summary: "How the cockpit drives the agent today: it lazily owns a persisted pi AgentSession, forwards a UIX-shaped event stream to the renderer, delegates reload, and binds the core anchored document read/write/edit tools."
status: active
---

# Agent integration

UIX owns one pi `AgentSession` for the cockpit, created lazily the first time the renderer sends a prompt. The current driver lives in `src/main/agent/driver.ts`.

Current behavior:

- the session is resumed or created under the workspace state root;
- renderer prompts call `window.uix.sendPrompt({ text })`, which invokes the main-process driver;
- the renderer receives a UIX-shaped event stream over typed Electron IPC: transcript item appends/replacements plus basic lifecycle markers; live in-flight tool partials are discarded when the final item arrives;
- `window.uix.getHistory()` replays the same durable transcript item shape from pi's persisted session branch;
- `window.uix.reload()` reloads UIX extensions and delegates to `session.reload()` only if a pi session already exists;
- core substrate tools are registered through internal agent bindings (`AgentBinding`), not through the public UIX extension API.

## Transcript projection

UIX keeps three related units distinct:

1. **Pi session entries** are the durable history/tree substrate. They are persisted by pi with `id`/`parentId` and represent conversation/state-machine steps such as user messages, assistant messages, tool results, custom messages, custom entries, model changes, and compactions. From the UI's point of view these are the branchable history units, not necessarily the smallest visible UI units.
2. **`TranscriptItem`s** are UIX's renderer wire shape. Main projects live pi events and replayed durable session entries into this one shape so the conversation pane consumes the same model for streaming deltas and startup history. Live updates replace one `TranscriptItem` by id; they do not replace a whole turn or whole transcript.
3. **Conversation blocks** are renderer units. A block is the smallest rendered conversation-stream unit and is a view over the transcript projection. Today each `TranscriptItem` renders as one block, but the model intentionally allows one session entry to project to many transcript items and one transcript item to render as many blocks later.

This separation keeps pi's durable tree, UIX's streaming/replay normalization, and React rendering independent enough to evolve without re-keying the session format.

The only current core agent binding is the canvas binding in `src/main/content/binding.ts`, which contributes the anchored canvas channel:

- `uix_canvas_read({ key, start?, end? })`
- `uix_canvas_write({ key, html })`
- `uix_canvas_edit({ key, start_line, end_line, replacement })`

Canvases are addressed by key through a content-store seam (`src/main/content/content-store.ts`), edited via the anchored core (`src/main/anchors/`), and canonicalized at the core boundary (`src/main/content/normalize.ts`). The tools are canvas-named because every HTML document edited through them is a canvas; the general document/content abstraction lives underneath in the channel and store. Every result returns the affected lines in the `<anchor>§<text>` wire format so the agent never re-reads to learn current anchors.

There is no public UIX-extension API today for contributing pi tools or triggering agent turns from pane/channel events.

See [`panes.md`](./panes.md), [`extensions.md`](./extensions.md).
