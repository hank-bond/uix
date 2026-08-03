---
summary: "UIX separates workspace settings, Pi session graphs, feature turn state, document versions, renderer projections, and the application-owned Pi profile."
kind: reference
status: active
---

# State model

UIX gives every state value one owner. Runtime registries, buffers, renderer controllers, and caches do not become duplicate durable authorities.

## Workspace settings

Feature-scoped durable preferences live on their feature entries in `uix.workspace.json`. Backend code uses schema-derived `ctx.settings` handles.

The substrate owns top-level `agent`, `session`, and `keybindings` settings namespaces. Features cannot request handles to these workspace scopes.

See [`settings.md`](./settings.md) for schemas, defaults, validation, and persistence.

## Pi profile and sessions

Pi profile state lives under Electron's `<userData>/pi` directory. UIX workspaces share this application-owned profile without inheriting the host Pi profile.

The profile contains Pi credentials, settings, custom models, and extension resources. Project-local `.pi` resources still derive from the workspace agent working directory.

Each workspace persists Pi session graphs under its `.uix/sessions` directory. The `session.selected` workspace setting stores only the selected durable graph id.

Session titles and first-message previews remain authoritative in Pi session files. The renderer receives read-only `SessionSummary` projections.

See [`sessions-and-transcripts.md`](./sessions-and-transcripts.md) for selection, history, titles, and transcript projection.

## Feature turn state

Features can contribute named branch-scoped turn-state cells. Each cell creates and restores one complete schema-validated JSON snapshot.

The coordinator compares cells independently and persists only changed values in `uix.turn-state`. Nested fields inside one cell remain atomic.

The selected branch restores cells on startup, session replacement, and feature reload. A missing branch value calls `restore(undefined)` so prior working state resets.

Turn-state payloads should contain stable references when a store owns larger artifacts. Canvas stores document snapshot ids instead of complete HTML documents.

## Documents

The substrate document store addresses documents by namespace and id, not by feature-visible filesystem paths. It stores mutable current bytes and immutable versions.

Canvas creates a store under the `canvas` namespace. `CanvasDocumentBuffer` owns HTML canonicalization and anchored working projections over that store.

Canvas keys are validated slash-namespaced slugs. They are document ids, not filesystem paths.

Agent Canvas tools update authoritative documents and publish `canvas.changed` invalidation events. Human iframe writeback enters the same Canvas buffer through a typed backend channel.

## Agent context

Changing model-visible feature state uses agent-context contributions. UIX persists one hidden `uix.state` message when materialized sections need delivery.

Canvas derives `canvas.canvas-diff` from current and prior `canvas.documents` turn-state commits. The diff is reproducible from durable document snapshots.

See [`agent-context.md`](./agent-context.md) for buffers, materialization, system-prompt vocabulary, and skills.

## Renderer projections

The workspace session controller owns active and recent session projections in the renderer. Main and Pi remain authoritative for durable session graphs.

Feature surfaces receive narrow read-only state and mutation capabilities through `@uix/api/workspace`. They do not receive backend owners or session file paths.

The current public API does not expose Pi's session manager, arbitrary custom session entries, filesystem watchers, or a feature storage directory.
