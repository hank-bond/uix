---
summary: "UIX persists the pi session under the workspace state root, stores canvas documents in the local document store, and exposes feature-scoped durable JSON preferences through ctx.settings."
status: active
---

# State model

UIX exposes feature-scoped workspace settings for durable JSON preferences via `ctx.settings`. See [`settings.md`](./settings.md).

Current shipped state behavior:

- The substrate-owned pi session is resumed or created under the workspace state root (`src/main/agent/driver.ts`).
- Canvas HTML is stored by key in the local document store (`src/main/documents/store.ts`) under the `canvas` namespace.
- Canvas keys are validated slash-namespaced slugs, not filesystem paths.
- Canvas writes go through the `canvas__anchor_write` tool and broadcast `canvasChanged { key }`.
- Feature backend code can use `ctx.settings.get/set/onChange` for declared, schema-validated workspace settings persisted on that feature's manifest entry in `uix.workspace.json`.

A package that also contains pi extension resources should use pi's own documented state APIs from the pi side. The current `@uix/api` surface does not provide access to the substrate-owned pi session manager, custom session entries, file watchers, or a UIX feature storage directory.

See [`features.md`](./features.md), [`contributions.md`](./contributions.md), [`settings.md`](./settings.md).
