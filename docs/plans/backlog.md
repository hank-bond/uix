---
summary: "Compact seeds for planned UIX deliverables that need enough context to be actionable but aren't standalone specs yet."
status: active
---

# Backlog

Compact seeds. Keep enough context that a future reader can recover the trigger, constraint, and likely shape without archaeology. Promote a seed to its own plan once it needs sections, ordered units, acceptance criteria, or design rationale that no longer fits comfortably here; delete the seed here when it graduates.

- **Surface contributions + workspace layout** — surface declarations replace panes; `Workspace.tsx` composes registered surfaces instead of hardcoding Chat + Canvas. Surfaces live inside the workspace as shadow (trusted React components) or iframe (nested containment for generated/foreign code).
- **Typed channel events** — event schemas drive typed/validated publish, not just docs. Requests are validated; events currently publish untyped.
- **`uix-core` embedded-pi config** — orientation block + doc map + smoke-test tools injected into the cockpit's agent.
- **Agent tool contribution from extensions** — done: extensions register pi tools into the owned session via `AgentToolRegistry`.
- **File watcher service** — cockpit-owned watcher; extensions register glob → callback.
- **Default conversation feature** — chat is a renderer-only feature (`features/chat/workspace/`) with no backend contributions (agent channels are substrate-owned). Still needs a surface contribution so it's removable — today it's hardcoded in `Workspace.tsx`.
- **Canvas as a default feature** — canvas has backend contributions (`FeatureDefinition`, channels, tools, turn state, agent context) but the surface is hardcoded in `Workspace.tsx`. Needs a surface contribution so it's removable. Gated on surface contributions.
- **Session inspector / debug mode** — menu toggle rendering `display: false` custom messages (and other hidden entry streams) in the conversation pane; renderer-only, the transcript items already carry customType/content/details.
- **User-action event log on CustomEntry** — append-only `pi.appendEntry` streams folded by D3 reducers; model-invisible, branch-aware, no second database. Keep low-frequency (whole session file loads into memory); leaf discipline unresolved for concurrent writers.
- **Fan-out one-off mode** — prepared root per app variant (system prompt + tool contracts + vocabulary + seeded state entries), fork per invocation, never rejoins; sibling branches make every run inspectable and identical prefixes align with provider prompt caching. Needs lifecycle design (fork-per-invocation creation/disposal, concurrency), not new messaging.
- **Docs + examples** — flesh out `src/docs/` stubs and seed `examples/` as primitives land.
