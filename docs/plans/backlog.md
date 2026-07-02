---
summary: "Compact seeds for planned UIX deliverables that need enough context to be actionable but aren't standalone specs yet."
status: active
---

# Backlog

Compact seeds. Keep enough context that a future reader can recover the trigger, constraint, and likely shape without archaeology. Promote a seed to its own plan once it needs sections, ordered units, acceptance criteria, or design rationale that no longer fits comfortably here; delete the seed here when it graduates.

- **Surface contributions + workspace layout** — done: features export `defineSurface` contributions from their workspace dirs; `layout.tsx` composes the flat list and `SurfaceMount` hands each surface its typed channel client.
- **Typed channel events** — done: shared `ChannelContract`s drive backend handlers (`withHandlers`), typed frontend clients (`createChannelClient`), and typed event publishers (`FeatureEventPublisherFactory`); events are schema-validated on both publish and subscribe.
- **Iframe surface transport** — the containment mode for foreign/generated/executable surface code (shelved when the Host/Workspace iframe collapsed — see [workspace-runtime-foundation](./archive/workspace-runtime-foundation.md)); everything in [runtime-surface-composition](./runtime-surface-composition.md) is trusted first-party page-realm code, so this waits for the first untrusted surface. Related: feature-agent link metadata on surfaces, later.
- **Canvas open-keys derivation** — canvas still hardcodes `openCanvasKeys = ["main"]`; once its surface loads at runtime, canvas can report its own open keys over its own channel (feature territory, no substrate "visible surfaces" API).
- **`uix-core` embedded-pi config** — orientation block + doc map + smoke-test tools injected into the cockpit's agent.
- **Agent tool contribution from extensions** — done: extensions register pi tools into the owned session via `AgentToolRegistry`.
- **File watcher service** — cockpit-owned watcher; extensions register glob → callback.
- **Packaged-binary feature templates** — [runtime-surface-composition](./runtime-surface-composition.md) S5 scaffolds new workspaces from the repo's `src/features/`; a packaged app needs the templates shipped as readable source under `resourcesPath` (they double as the worked example for agents authoring features). Lands with the electron-builder/packaging arc, which doesn't exist yet.
- **Session inspector / debug mode** — menu toggle rendering `display: false` custom messages (and other hidden entry streams) in the conversation pane; renderer-only, the transcript items already carry customType/content/details.
- **User-action event log on CustomEntry** — append-only `pi.appendEntry` streams folded by D3 reducers; model-invisible, branch-aware, no second database. Keep low-frequency (whole session file loads into memory); leaf discipline unresolved for concurrent writers.
- **Fan-out one-off mode** — prepared root per app variant (system prompt + tool contracts + vocabulary + seeded state entries), fork per invocation, never rejoins; sibling branches make every run inspectable and identical prefixes align with provider prompt caching. Needs lifecycle design (fork-per-invocation creation/disposal, concurrency), not new messaging.
- **Docs + examples** — flesh out `src/docs/` stubs and seed `examples/` as primitives land.
