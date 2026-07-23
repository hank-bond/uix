---
summary: "UIX persists each pi session under its workspace state root, shares one app-owned Pi profile across workspaces, stores canvas documents in the local document store, and exposes feature-scoped durable JSON preferences through ctx.settings."
status: active
---

# State model

UIX exposes feature-scoped workspace settings for durable JSON preferences via `ctx.settings`. See [`settings.md`](./settings.md).

Current shipped state behavior:

- The substrate-owned selected Pi session graph is resumed or created under the workspace state root; `settings.session.selected` persists only its durable id, startup opens that exact graph when available and otherwise repairs the selection to the newest graph, and its live `AgentSessionRuntime` remains lazy until the first prompt or session mutation (`src/main/agent/driver.ts`).
- Pi's profile-level auth, settings, models, and resources live in the app-owned `<userData>/pi`, shared across UIX workspaces and isolated from the host Pi profile; project-local `.pi` settings and resources still derive from the workspace agent cwd.
- Feature turn state is divided into named cells such as `canvas.documents`. Each cell creates a schema-validated complete snapshot at commit boundaries, and only changed cell snapshots are appended to `uix.turn-state`. The selected branch restores active cells on startup, replacement-session activation, and serialized feature reload; a fresh session passes `undefined` so each feature resets to defaults.
- Canvas HTML is stored by key in the local document store (`src/main/documents/store.ts`) under the `canvas` namespace.
- Canvas keys are validated slash-namespaced slugs, not filesystem paths.
- Canvas writes go through the `canvas__anchor_write` tool and broadcast `canvasChanged { key }`.
- Feature backend code can use `ctx.settings.get/set/onChange` for declared, schema-validated workspace settings persisted on that feature's manifest entry in `uix.workspace.json`.
- The renderer exposes controller-owned active and recent `SessionSummary` projections read-only to feature surfaces. Each summary carries the explicit title independently from a bounded first-user-message preview; features own presentation fallback copy. Active `session_history` hydration establishes the active projection, while explicit non-selected history reads do not change it. The controller hydrates `list_session_summaries` independently after mount, guards list/history responses with request/state versions, refreshes recents after a completed run so the active first-message preview reconciles, and invalidates/refreshes recents after a successful mutation. It exposes switching only while the agent and session mutation path are idle; title changes may run alongside agent activity but serialize with session transitions and other title changes. A title response immediately updates the matching active summary and promotes its recent row without changing session selection. New Session and backend `switch_session` persist their returned session as the workspace selection only after target restoration completes. Chat consumes this substrate capability through its own recent-conversation picker; the picker is feature UI rather than workspace chrome.

A package that also contains pi extension resources should use pi's own documented state APIs from the pi side. The current `@uix/api` surface does not provide access to the substrate-owned pi session manager, custom session entries, file watchers, or a UIX feature storage directory.

See [`features.md`](./features.md), [`contributions.md`](./contributions.md), [`settings.md`](./settings.md).
