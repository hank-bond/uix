# Architecture

This doc tracks the **current state** of Trellis development: what's built,
what's in flight, what's next, and the open questions we haven't resolved.

For the architectural vision, see [`TRELLIS.md`](../TRELLIS.md). For the
"why this exists / why this stack" rationale, see
[`DECISIONS.md`](../DECISIONS.md).

This file is a living dev doc. The user-facing documentation for the
substrate lives in `src/docs/`.

---

## Current state

### Built

- Electron + electron-vite scaffold (`electron.vite.config.ts`,
  `src/main`, `src/preload`, `src/renderer`).
- Typed IPC scaffold (`src/shared/ipc.ts`, preload bridge).
- Pi `createAgentSession` driver wired into the main process
  (`src/main/agent.ts`).
- Lifetime-scoped disposables and lifecycle helpers
  (`src/main/lifecycle.ts`). See [`conventions.md`](./conventions.md).
- Basic conversation pane (`src/renderer/Conversation.tsx`).

### In flight

*(none — between milestones)*

### Next

The substrate milestone list lives in `TRELLIS.md` under "Near-term
milestones". The headline order:

1. Extension loader (the lifetime-boundaries test: hot reload = dispose
   bag + re-activate, sub-second, no cockpit restart).
2. Pane host + slot registry (React panes, iframe panes, declarative
   contributions).
3. Typed channel substrate (TypeBox, local/silent/turn modes,
   in-process + iframe transports).
4. `trellis-core` pi extension (orientation block + doc map +
   smoke-test tools).
5. Agent tool contribution from extensions.
6. File watcher service.
7. Default conversation extension (port the current pane into the
   extension model).
8. Docs and examples populate `src/docs/` and `examples/`.

---

## Open questions

Things we've named but not resolved. Each one will get pinned to a
milestone when it becomes blocking.

### Substrate

- **Manifest shape stability.** TRELLIS.md commits to "extensions register
  contributions through a small context object," but the exact shape of
  `TrellisExtensionContext` is undefined. Likely settled while building
  the extension loader.
- **Channel transport unification.** One API, two transports
  (in-process + `postMessage`). Where does the boundary live — at
  the channel itself, or at a transport adapter behind it?
- **Slot taxonomy.** What named slots does the cockpit shell expose?
  Minimum useful set vs. risk of overcommitting to a layout.
- **Hot-reload semantics for in-flight agent turns.** If an extension
  reloads mid-turn and contributed tools the agent is using, what's
  the correct behavior — pause, abort, finish then reload?
- **Extension shapes — package.json always, or lighter shapes too?**
  Discovery currently requires `<root>/<name>/package.json` with a
  `pi` or `trellis` field. Pi is more flexible: bare
  `~/.pi/agent/extensions/<name>.ts`, folder-with-index, or full
  package — only the last needs `package.json`. We picked the strict
  shape because we need to disambiguate which side(s) an extension
  targets (pi-only, trellis-only, both), which pi doesn't. A file/
  folder-name convention could carry that disambiguation instead
  (e.g. `notify.pi.ts`, `notify/{pi.ts, trellis.ts}`). Decide when
  ceremony cost is actually felt — likely after 3–5 dogfood
  extensions. Loosening discovery later is easy; tightening would
  force migration.

### Documentation

- **`src/docs/` ↔ `/docs/` split discipline.** Easy to drift. Need a
  habit: when an extension API changes, the `src/docs/` page changes
  in the same commit. `/docs/` is allowed to be stale relative to
  code; `src/docs/` is not.
- **What does `conventions.md` become** once there's a stable extension
  lifetime API? Likely splits: cockpit-internal rules stay in `/docs/`,
  extension-author rules move to `src/docs/lifetimes.md`.

### Future apps (not substrate, but shaping it)

- **Code-reviewer app.** Original "reports + question blocks +
  side-quest" design lives in
  [`archive/project-brief.md`](./archive/project-brief.md). When this
  becomes an extension package, it gets its own design doc.
- **Knowledge base / wiki app.** Not yet specified.
- **Shared shape between the two.** Both want rich rendered panes,
  inline interactive blocks, on-disk artifacts, channels that send
  small diffs and occasional turn-triggering events. The substrate
  needs to support both cleanly.

---

## Recent decisions (delta log)

A running record of decisions made *after* `DECISIONS.md` was written.
Promote to `DECISIONS.md` when stable.

- **2026-05-30** — Split documentation into `src/docs/` (user-facing,
  what the code is and how to use it) and `/docs/` (dev-facing,
  process and context). Archived the original `PROJECT_BRIEF.md` and
  pulled the still-relevant pieces into `DECISIONS.md`.
- **2026-05-30** — Extension discovery model corrected. Original
  commit `3606296` put `trellis-core` under `src/extensions/` as a
  first-party Trellis extension. That was a category mistake:
  extensions are *user-installed* (project-local or global), and
  what `trellis-core` actually does (orientation + doc map + cockpit
  tools) is *embedded-pi config* — the way the cockpit configures
  its own pi instance, not a feature users opt into.

  Corrected model (matches pi's directory layout):
  - **Discovery roots** (extensions only):
    - `<project>/.trellis/extensions/` — project-local, the common case.
    - `~/.trellis/extensions/` — global, optional.
    - No app-shipped first-party root. Trellis ships zero extensions.
  - **Embedded-pi config** lives in the cockpit's own source
    (`src/main/embedded-pi/`, path TBD). Will be filled in when
    milestone 4 lands.
  - The trellis repo itself dogfoods extensions via
    `<repo>/.trellis/extensions/` (gitignored), the same way pi's
    own dev workflow uses `<repo>/.pi/extensions/`.

- **2026-05-30** — Extension package layout decided ahead of building
  the loader (milestone 1):
  - First-party packages live under `src/extensions/<name>/`.
    *(Superseded by the discovery-model correction above.)*
  - Each package's `package.json` has optional `pi` and `trellis`
    fields (each side independent).
  - `trellis-core` moves from the previously-documented
    `src/pi-package/extensions/trellis-core/` to
    `src/extensions/trellis-core/`. It's pi-only — the canonical
    example of a package with only a `pi` field.
  - **No version gate in v0.** Originally planned a `trellisApi`
    field in `package.json` (mirroring VS Code's `engines.vscode`),
    but pi doesn't gate its extensions and the precondition for the
    gate to pay off — user-installed extensions outliving substrate
    upgrades — doesn't exist yet. Adding it later is one field +
    one check in the loader. Pi-shaped move: build the gate when
    the scenario surfaces.
  - **Process-isolation posture for extensions:** v0 runs extensions
    in the main process, guarded by try/catch around the factory
    and `uncaughtException` / `unhandledRejection` handlers with
    best-effort attribution ("option B" in our design chat). The
    architectural commitment is stronger than the v0 mechanism: all
    extension ↔ cockpit traffic goes through the injected API
    object; extensions never import cockpit internals. That keeps
    a future swap to `worker_threads` or `utilityProcess`
    per-extension isolation a transport change, not an API change.
  - **Extension shape mirrors pi exactly.** A trellis manifest
    default-exports a factory function that receives an
    `ExtensionAPI` object — same pattern as pi's
    `export default function (pi: ExtensionAPI) { ... }`. Type
    name (`ExtensionAPI`), export shape (default function), and
    parameter convention (named for the injected system: `pi` or
    `trellis`) all match. Reason: keep humans and LLMs in one
    pattern across both systems. Disambiguation happens at the
    import site (`@trellis/api` vs `@earendil-works/pi-coding-agent`).
    Earlier sketches in our design chat used `activate` / `ctx` /
    `TrellisExtensionContext`; those are superseded.
- **2026-05-30** — TypeBox everywhere, not split with Zod. Pi forces
  TypeBox at the agent boundary; using it across IPC, channels, and
  on-disk schemas too removes a translation layer and a second mental
  model. Extensions are free to use Zod for purely internal state. See
  `DECISIONS.md` “Schemas: why not split.”
- **2026-05-30** — Extension `register*` methods return `void`, not
  `Disposable`. Mirrors pi. The substrate ties each registration's
  cleanup to the extension's lifecycle automatically — the loader
  keeps a per-extension `DisposableBag`, `createExtensionAPI()`
  enrolls disposables into it as a side effect of each `register*`
  call, and the bag is disposed when the extension unloads.
  Consequence: extension authors never thread `Disposable` values
  through their code for things they registered through the API.
  (For their *own* resources — file watchers, external
  subscriptions, intervals — they still need cleanup discipline;
  TBD whether we expose a `trellis.subscriptions` bag for that
  case. Pi doesn't, and we don't yet need to.)
- **2026-05-30** — Extension-facing types live behind `@trellis/api`,
  implemented as a tsconfig path alias to
  `src/shared/extension-types.ts`. Mirrors the eventual published
  package name from day 1 so extension code never has to be
  rewritten. No npm publish is needed yet because the only thing
  exported is *types* — extensions never `import` a runtime value
  from `@trellis/api` (the `trellis` object is constructed by the
  loader and handed to the factory), so `import type` erasure at
  compile means nothing has to resolve `@trellis/api` at runtime.
  Upgrade path when external extensions arrive: move the file to
  `packages/api/src/index.ts`, add a `package.json`, declare
  workspaces. The alias goes away, the import shape doesn't change.
