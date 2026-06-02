---
summary: "Current agent integration in UIX: the cockpit lazily owns an in-memory pi AgentSession, forwards a small event stream to the renderer, supports reload delegation, and binds core canvas read/write tools. Read when working with the current agent driver or canvas tools."
status: active
---

# Agent integration

UIX owns one pi `AgentSession` for the cockpit, created lazily the first time the renderer sends a prompt. The current driver lives in `src/main/agent/driver.ts`.

Current behavior:

- the session uses `SessionManager.inMemory()`;
- renderer prompts call `window.uix.sendPrompt({ text })`, which invokes the main-process driver;
- the renderer receives `user_message`, `assistant_delta`, `assistant_end`, and `error` events over typed Electron IPC;
- `window.uix.reload()` reloads UIX extensions and delegates to `session.reload()` only if a pi session already exists;
- core substrate tools are bound through internal `AgentBinding`s, not through the public UIX extension API.

The only current core agent binding is the canvas binding in `src/main/canvas/agent-binding.ts`, which contributes:

- `uix_canvas_read({ key })`
- `uix_canvas_write({ key, html })`

There is no public UIX-extension API today for contributing pi tools or triggering agent turns from pane/channel events.

See [`panes.md`](./panes.md), [`extensions.md`](./extensions.md).
