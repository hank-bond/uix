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
- **Default conversation extension** — port the current conversation pane into the extension model.
- **Docs + examples** — flesh out `src/docs/` stubs and seed `examples/` as primitives land.
