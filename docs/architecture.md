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
- **2026-05-30** — TypeBox everywhere, not split with Zod. Pi forces
  TypeBox at the agent boundary; using it across IPC, channels, and
  on-disk schemas too removes a translation layer and a second mental
  model. Extensions are free to use Zod for purely internal state. See
  `DECISIONS.md` “Schemas: why not split.”
