---
summary: "The cockpit uses an in-memory pi session and stores canvas HTML in the local document store; there is no public UIX-extension state API yet beyond lifetime-scoped registerCommand cleanup."
status: active
---

# State model

UIX exposes feature-scoped workspace settings for durable JSON preferences via `ctx.settings`. See [`settings.md`](./settings.md).

Current shipped state behavior:

- The cockpit-owned pi session is created with `SessionManager.inMemory()` in `src/main/agent/driver.ts`; UIX does not currently persist that session to a project session file.
- Canvas HTML is stored by key in the local document store (`src/main/documents/store.ts`) under the `canvas` namespace.
- Canvas keys are validated slash-namespaced slugs, not filesystem paths.
- Canvas writes go through the `canvas__anchor_write` tool and broadcast `canvasChanged { key }`.
- Feature backend code can use `ctx.settings.get/set/onChange` for declared, schema-validated workspace settings persisted on that feature's manifest entry in `uix.workspace.json`.
- UIX extensions can currently call `registerCommand(...)`; the command-shaped contribution is lifetime-scoped but not persisted and not invokable through UIX.

A package that also contains pi extension resources should use pi's own documented state APIs from the pi side. The current `@uix/api` surface does not provide access to the cockpit-owned pi session manager, custom session entries, file watchers, or a UIX extension storage directory.

See [`extensions.md`](./extensions.md), [`contributions.md`](./contributions.md), [`panes.md`](./panes.md).
