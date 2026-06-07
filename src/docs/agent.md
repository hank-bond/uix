---
summary: "Current agent integration in UIX: the cockpit lazily owns an in-memory pi AgentSession, forwards a small event stream to the renderer, supports reload delegation, and binds the core anchored document read/write/edit tools. Read when working with the current agent driver or document tools."
status: active
---

# Agent integration

UIX owns one pi `AgentSession` for the cockpit, created lazily the first time the renderer sends a prompt. The current driver lives in `src/main/agent/driver.ts`.

Current behavior:

- the session uses `SessionManager.inMemory()`;
- renderer prompts call `window.uix.sendPrompt({ text })`, which invokes the main-process driver;
- the renderer receives `user_message`, `assistant_delta`, `assistant_end`, and `error` events over typed Electron IPC;
- `window.uix.reload()` reloads UIX extensions and delegates to `session.reload()` only if a pi session already exists;
- core substrate tools are registered through internal agent bindings (`AgentBinding`), not through the public UIX extension API.

The only current core agent binding is the canvas binding in `src/main/content/binding.ts`, which contributes the anchored canvas channel:

- `uix_canvas_read({ key, start?, end? })`
- `uix_canvas_write({ key, html })`
- `uix_canvas_edit({ key, start_line, end_line, replacement })`

Canvases are addressed by key through a content-store seam (`src/main/content/content-store.ts`), edited via the anchored core (`src/main/anchors/`), and canonicalized at the core boundary (`src/main/content/normalize.ts`). The tools are canvas-named because every HTML document edited through them is a canvas; the general document/content abstraction lives underneath in the channel and store. Every result returns the affected lines in the `<anchor>§<text>` wire format so the agent never re-reads to learn current anchors.

There is no public UIX-extension API today for contributing pi tools or triggering agent turns from pane/channel events.

See [`panes.md`](./panes.md), [`extensions.md`](./extensions.md).
