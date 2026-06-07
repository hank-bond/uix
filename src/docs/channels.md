---
summary: "No public typed pane/channel API ships yet; the current cross-boundary surface is the typed Electron IPC bridge (prompts, agent events, canvas invalidation, manual refresh, reload)."
status: stub
---

# Channels

UIX does not currently ship a public typed pane/channel API.

The current cross-boundary communication surface is the Electron IPC bridge declared in `src/shared/ipc.ts` and exposed by `src/preload/index.ts` as `window.uix`:

- `sendPrompt({ text })`
- `onAgentEvent(handler)`
- `onCanvasChanged(handler)`
- `refreshCanvas({ key })`
- `reload()`

Canvas invalidation is currently a one-way main-to-renderer event: main broadcasts `canvasChanged { key }`, and the hardcoded canvas pane filters by key before reloading its iframe URL.

There is no current public API for extension-defined channel schemas, pane-to-pane events, iframe `postMessage` routing, or channel-triggered agent turns.

See [`panes.md`](./panes.md), [`agent.md`](./agent.md).
