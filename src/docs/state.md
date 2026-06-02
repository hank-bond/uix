---
summary: "Current state persistence in UIX: the cockpit uses an in-memory pi session, stores canvas HTML by key under .uix/canvas, and exposes no public UIX-extension state API beyond lifetime-scoped registerCommand cleanup. Read before storing state through UIX today."
status: active
---

# State model

UIX currently exposes no public state-persistence API for UIX extensions.

Current shipped state behavior:

- The cockpit-owned pi session is created with `SessionManager.inMemory()` in `src/main/agent/driver.ts`; UIX does not currently persist that session to a project session file.
- Canvas HTML is stored by key under `.uix/canvas/<key>.html` by `src/main/canvas/store.ts`.
- Canvas keys are validated slash-namespaced slugs, not filesystem paths.
- Canvas writes go through the `uix_canvas_write` tool and broadcast `canvasChanged { key }`.
- UIX extensions can currently call `registerCommand(...)`; the command-shaped contribution is lifetime-scoped but not persisted and not invokable through UIX.

A package that also contains pi extension resources should use pi's own documented state APIs from the pi side. The current `@uix/api` surface does not provide access to the cockpit-owned pi session manager, custom session entries, file watchers, or a UIX extension storage directory.

See [`extensions.md`](./extensions.md), [`contributions.md`](./contributions.md), [`panes.md`](./panes.md).
