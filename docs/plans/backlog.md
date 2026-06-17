---
summary: "Compact seeds for planned UIX deliverables that need enough context to be actionable but aren't standalone specs yet."
status: active
---

# Backlog

Compact seeds. Keep enough context that a future reader can recover the trigger, constraint, and likely shape without archaeology. Promote a seed to its own plan once it needs sections, ordered units, acceptance criteria, or design rationale that no longer fits comfortably here; delete the seed here when it graduates.

- **Pane host + slot registry** — mount React / iframe / declarative panes into named slots; turns the hardcoded canvas pane into a registered one.
- **Typed channel substrate** — TypeBox schemas, `local` / `silent` / `turn` modes, one API over in-process + iframe `postMessage` transports.
- **`uix-core` embedded-pi config** — orientation block + doc map + smoke-test tools injected into the cockpit's agent.
- **Agent tool contribution from extensions** — extensions register pi tools into the owned session.
- **File watcher service** — cockpit-owned watcher; extensions register glob → callback.
- **Default conversation extension** — port the current conversation pane into the extension model. Not just dogfooding: a shipped app may have no chat at all (the session is substrate; the conversation is one view of it), so chat must be removable — and in dev it doubles as the session inspector.
- **Canvas as a comes-with extension** — package tools + pane + state messages as a replaceable default; `registerStateMessage` moves to `@uix/api` verbatim, messageTypes prefixed by the handle (the `DisposableBag` pattern) so extensions can't collide with `uix.*`. Gated on the pane host; needs late state-message registration for hot-reload ([agent-state-messages](../design/agent-state-messages.md)).
- **Session inspector / debug mode** — menu toggle rendering `display: false` custom messages (and other hidden entry streams) in the conversation pane; renderer-only, the transcript items already carry customType/content/details.
- **User-action event log on CustomEntry** — append-only `pi.appendEntry` streams folded by D3 reducers; model-invisible, branch-aware, no second database. Keep low-frequency (whole session file loads into memory); leaf discipline unresolved for concurrent writers.
- **Fan-out one-off mode** — prepared root per app variant (system prompt + tool contracts + vocabulary + seeded state entries), fork per invocation, never rejoins; sibling branches make every run inspectable and identical prefixes align with provider prompt caching. Needs lifecycle design (fork-per-invocation creation/disposal, concurrency), not new messaging.
- **Docs + examples** — flesh out `src/docs/` stubs and seed `examples/` as primitives land.
