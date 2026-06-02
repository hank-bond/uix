# Plans

Specs for things we intend to build — slugged by deliverable. A plan only needs to be **valid**, not actively worked. Tiny ideas live as one-liners in the backlog below; once an idea accretes real detail it graduates to its own file (and the index picks up its summary); shipped plans move to [`archive/`](./archive/). Plans cite the [`../decisions/`](../decisions/) they assume and the [`../design/`](../design/) thread they came from.

## Backlog

Short seeds. Promote one to its own file the moment it grows past a line, and delete the seed here (it lives in the index then, not in both places).

- **Canvas anchored edit channel** — fresh build spec for the next canvas unit (`read`/`write`/`edit`, reconciler, anchor pool, and pi integration); source design is [canvas-data-channel](../design/canvas-data-channel.md).
- **Pane host + slot registry** — mount React / iframe / declarative panes into named slots; turns the hardcoded canvas pane into a registered one.
- **Typed channel substrate** — TypeBox schemas, `local` / `silent` / `turn` modes, one API over in-process + iframe `postMessage` transports.
- **`uix-core` embedded-pi config** — orientation block + doc map + smoke-test tools injected into the cockpit's agent.
- **Agent tool contribution from extensions** — extensions register pi tools into the owned session.
- **File watcher service** — cockpit-owned watcher; extensions register glob → callback.
- **Default conversation extension** — port the current conversation pane into the extension model.
- **Docs + examples** — flesh out `src/docs/` stubs and seed `examples/` as primitives land.

## Active plans

<!-- INDEX:START -->

_(none yet)_

<!-- INDEX:END -->
