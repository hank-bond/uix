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

_(none — between milestones)_

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

A running record of decisions made _after_ `DECISIONS.md` was written.
Promote to `DECISIONS.md` when stable.

- **2026-05-30** — Split documentation into `src/docs/` (user-facing,
  what the code is and how to use it) and `/docs/` (dev-facing,
  process and context). Archived the original `PROJECT_BRIEF.md` and
  pulled the still-relevant pieces into `DECISIONS.md`.
- **2026-05-30** — Extension discovery model corrected. Original
  commit `3606296` put `trellis-core` under `src/extensions/` as a
  first-party Trellis extension. That was a category mistake:
  extensions are _user-installed_ (project-local or global), and
  what `trellis-core` actually does (orientation + doc map + cockpit
  tools) is _embedded-pi config_ — the way the cockpit configures
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
    _(Superseded by the discovery-model correction above.)_
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
  (For their _own_ resources — file watchers, external
  subscriptions, intervals — they still need cleanup discipline;
  TBD whether we expose a `trellis.subscriptions` bag for that
  case. Pi doesn't, and we don't yet need to.)
- **2026-05-30** — Extension-facing types live behind `@trellis/api`,
  implemented as a tsconfig path alias to
  `src/shared/extension-types.ts`. Mirrors the eventual published
  package name from day 1 so extension code never has to be
  rewritten. No npm publish is needed yet because the only thing
  exported is _types_ — extensions never `import` a runtime value
  from `@trellis/api` (the `trellis` object is constructed by the
  loader and handed to the factory), so `import type` erasure at
  compile means nothing has to resolve `@trellis/api` at runtime.
  Upgrade path when external extensions arrive: move the file to
  `packages/api/src/index.ts`, add a `package.json`, declare
  workspaces. The alias goes away, the import shape doesn't change.
- **2026-05-30** — Extension identity is the entry file's absolute
  path. Mirrors pi (`Extension.resolvedPath` is its identifier).
  Pulled out of an earlier sketch that put a composite
  `"<rootLabel>/<name>"` id on packages and tagged each one with a
  `"project" | "global"` kind. Both are categories that don't
  survive contact with pi's third discovery source
  (settings.json `packages:`, the "git-clone a repo full of
  extensions and import them by path" mechanism that harness uses):
  configured paths aren't "project" or "global" in any meaningful
  sense, so the enum would either lie or grow indefinitely.
  Concrete shape (commit 4):
  - `defaultRoots()` returns `string[]` — just absolute paths, no
    interface wrapping them. Configured paths will append to the
    same list when they land.
  - `DiscoveredExtension` is `{ displayName, dir, hasPi, hasTrellis,
packageJson }`. `dir` is the identifier; `displayName` is the
    directory name, used for log readability.
  - `LoadedExtension` (the loader's output) is
    `{ displayName, entry, bag }`. `entry` is the absolute path to
    the actual entry file (a manifest can list multiple entries;
    each becomes its own `LoadedExtension` with its own bag,
    matching pi's "entry is the unit of loading" model).
  - **Vocabulary**: we use "extension" everywhere — for the on-disk
    thing _and_ for the activated thing. Pi does the same.
    `package.json` is a file format, not a separate conceptual
    layer. If multi-entry semantics ever become important enough
    to need a distinct word, we'll introduce "extension entry";
    until then, one extension contributes one entry by convention.
  - Bare `name` is avoided as a field name (pino-pretty hijacks
    it, and it's ambiguous anyway). Use `displayName` for the
    human label; see docs/conventions.md.
- **2026-05-30** — Extension activation policy:
  - **Sequential `await`** over the discovered list. Mirrors pi.
    Predictable log order; the cost of one slow extension blocking
    the rest only matters if extensions do heavy work during
    activation, which is a thing we'd want to discourage anyway.
  - **Intra-root order is sorted alphabetically by directory name.**
    Small divergence from pi, which iterates raw `readdir` order.
    Pi's docs claim "extension load order" semantics; sorting
    strengthens that guarantee at zero cost and removes a class of
    "logs differ between devs" surprises.
  - **No same-name shadowing across roots.** If both project and
    global roots contain a `hello/`, both activate as independent
    extensions — they have different `dir`s, so different
    identities. Pi handles this the same way; collisions inside a
    _registry_ (two extensions registering the same command name)
    will be the registry's problem to resolve, not the loader's.
  - **Per-extension `DisposableBag` enrolled into the parent bag.**
    One dispose at app shutdown tears every extension's
    contributions down cleanly. Reload (later commit) disposes
    just the affected per-extension bags and re-activates.
  - **No error isolation yet** — a broken factory throws and stops
    the loop. The next commit adds try/catch with attribution,
    process-level `uncaughtException` + `unhandledRejection`
    handlers, and a `failed` state we surface in the registry.
- **2026-05-30** — Extension error isolation, v0 posture:
  - **Per-factory try/catch in the loader.** A throw during
    activation no longer halts the loop. The broken entry lands in
    `failed: FailedExtension[]`; siblings keep activating. The
    return type went from `LoadedExtension[]` to
    `{ loaded, failed }` — two arrays, separate types — because
    the use cases diverge (successful loads feed the registry;
    failed loads are inert and surface in logs / a future status
    panel). A discriminated union would force every consumer to
    narrow; two arrays let the common cases pass straight through.
  - **Partial-activation cleanup.** The per-extension `DisposableBag`
    is built before the factory runs and only enrolled in the
    parent bag _after_ the factory succeeds. On failure the bag is
    disposed locally — anything the factory got far enough to
    register through `registerCommand` (etc.) is torn back down
    immediately, and the dead bag never becomes part of app-
    shutdown teardown.
  - **Process-level handlers** for `uncaughtException` and
    `unhandledRejection` live in `lifecycle.ts`
    (`installProcessHandlers`) and are installed before any
    extension code runs. They cover async-after-activation
    failures (e.g. an extension's `setInterval` callback throws
    minutes after loading) and any unhandled rejection in cockpit
    code itself. They log via the `main` component, not
    `extensions`, because they can't tell the difference between
    cockpit-origin and extension-origin errors.
  - **No attribution attempted.** Stack traces _could_ be parsed
    for known entry-file paths and matched back to a loaded
    extension, but: paths get transformed by bundlers, top-of-stack
    frames are usually third-party libraries the extension calls,
    and false negatives are common. Pi doesn't attempt this either.
    If extension authors keep throwing async errors and we get
    sick of debugging them without attribution, we layer it on top
    of the existing handlers as a pure addition — no API change.
  - **Errors normalized to `Error`.** JS lets you `throw` anything;
    `FailedExtension.error` and the process handlers both wrap
    non-Errors in `new Error(String(thrown))` so `.message` and
    `.stack` are always available downstream.
  - **Dogfood canary.** `.trellis/extensions/broken/` (gitignored,
    like the rest of `.trellis/`) deliberately throws on
    activation. It exists so every `npm run dev` exercises the
    isolation path: hello still loads, broken lands in `failed[]`,
    the window comes up. Will graduate to a real test fixture when
    we add a test framework.
  - **Out of scope here**: per-handler isolation (catching errors
    thrown _inside_ a registered command/event handler when the
    registry invokes it) — that lands when the registry that
    invokes them lands, around commit 7+.
- **2026-05-30** — Lint + format infrastructure landed. ESLint
  flat config (`eslint.config.mjs`) with three layers:
  - **Hygiene from upstream presets**: `@eslint/js`'s recommended
    plus `typescript-eslint`'s `recommendedTypeChecked`. The
    type-aware variant earns its keep with `no-floating-promises`
    and `no-misused-promises` — the rules that catch the
    fire-and-forget Promise bugs that otherwise hit our
    `unhandledRejection` handler.
  - **Project conventions as enforced rules**:
    `no-restricted-globals` for `process` and `Buffer` (forcing
    `node:` imports per the Imports section of conventions.md);
    `no-restricted-syntax` for raw `app.on`, `ipcMain.handle`, and
    `process.on` calls outside `lifecycle.ts` (forcing the
    lifecycle helpers); `no-console` in the main process (forcing
    pino via `createLogger`).
  - **Targeted overrides** for the places where the rules would
    fight reality: `lifecycle.ts` is allowed to use the raw APIs
    it wraps; renderer + preload are excused from `no-console` and
    Node-global restrictions until they have a logging story;
    config files (`eslint.config.mjs`, `*.config.*`) sit outside
    the tsconfig project graph so type-aware rules are disabled
    there. `__dirname`/`__filename` were dropped from
    restricted-globals because they're CJS module-level bindings
    (not importable), and banning them fights the bundle format.
  - **Prettier** lives alongside, with `eslint-config-prettier`
    layered last to disable stylistic rules that would conflict.
    Two-space indent, double-quotes, trailing commas, 80-col
    print width. Format is a hard check, not a guideline.
  - **Scripts**: `lint`, `lint:fix`, `format`, `format:check`,
    plus a `check` script that runs `typecheck && lint &&
format:check` for a single gate.
  - **Folded-in cleanup**: the `AppEvent` overload errors in
    `lifecycle.ts` (deferred since the early commits) are fixed,
    because `npm run check` couldn't pass while they were live
    and that defeats the point of the new gate. `onApp` now
    accepts a uniform `() => void` listener for any `AppEvent`
    via a single typed cast on `app.on`/`app.off`; the
    `window-all-closed` listener in `index.ts` migrated to
    `onApp` as a result. The `will-quit` listener stays raw with
    a documented inline disable: its job IS to dispose appBag, so
    enrolling it in the bag would be circular.
  - **Real bugs the new rules caught on first run**: a floating
    Promise on `app.whenReady().then(...)` in `index.ts`; an
    async function passed directly to `<form onSubmit={...}>` in
    Conversation.tsx (React expects sync handlers). Both are
    fixed in this commit — evidence the type-checked ruleset
    earns its slower cost.
