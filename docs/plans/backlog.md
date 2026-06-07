---
summary: "Short seeds for planned UIX deliverables that aren't standalone specs yet; promoted to their own file once they grow past a line."
status: active
---

# Backlog

Short seeds. Promote one to its own file the moment it grows past a line, and delete the seed here (it lives in the index then, not in both places).

- **Pane host + slot registry** — mount React / iframe / declarative panes into named slots; turns the hardcoded canvas pane into a registered one.
- **Typed channel substrate** — TypeBox schemas, `local` / `silent` / `turn` modes, one API over in-process + iframe `postMessage` transports.
- **`uix-core` embedded-pi config** — orientation block + doc map + smoke-test tools injected into the cockpit's agent.
- **Agent tool contribution from extensions** — extensions register pi tools into the owned session.
- **File watcher service** — cockpit-owned watcher; extensions register glob → callback.
- **Default conversation extension** — port the current conversation pane into the extension model.
- **Docs + examples** — flesh out `src/docs/` stubs and seed `examples/` as primitives land.
