# Architecture

The current state of the system: what's built, how the code is shaped, and the open questions we haven't resolved. Living docs — they always describe HEAD and are rewritten freely to match the code. This is the dev-facing architecture-of-record; the vision lives in the repo-root [`../../AGENTS.md`](../../AGENTS.md), and the user-facing substrate reference that ships lives in [`../../src/docs/`](../../src/docs/).

## Current state

**Built:**

- Electron + electron-vite scaffold (`electron.vite.config.ts`, `src/main`, `src/preload`, `src/renderer`).
- Typed IPC scaffold (`src/shared/ipc.ts`, preload bridge).
- Pi `createAgentSession` driver in the main process (`src/main/agent/driver.ts`).
- Lifetime-scoped disposables and lifecycle helpers (`src/main/lifecycle.ts`). See [conventions](./conventions.md).
- Basic conversation pane (`src/renderer/Conversation.tsx`).
- Sequential extension loader with per-entry lifetimes, error isolation, and manual hot reload (`src/main/extensions/`). See [extension-activation-and-isolation](../decisions/2026-05-30-extension-activation-and-isolation.md) and [manual-reload-extensionsbag](../decisions/2026-05-31-manual-reload-extensionsbag.md).
- Stage-1 canvas pane: own-origin `uix-canvas://` protocol, key-addressed store, dedicated agent tools, whole-document refresh (`src/main/canvas/`, `src/renderer/Canvas.tsx`). See [canvas-stage-one](../decisions/2026-05-31-canvas-stage-one.md).

**In flight:** the bidirectional canvas data channel — anchored edits and pane→agent writeback — is in design ([canvas-data-channel](../design/canvas-data-channel.md)); the next concrete build unit is seeded in the [plans backlog](../plans/AGENTS.md#backlog) and should get a fresh spec before implementation.

What's *next* lives in the plans backlog ([`../plans/`](../plans/)); per-decision history is in [`../decisions/`](../decisions/).

## Docs

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[conventions](./conventions.md)** _(active)_ — Main-process code conventions for lifetimes, module exports, validation, logging, imports, and lifecycle helpers. Read when writing or reviewing cockpit internals.
- **[open-questions](./open-questions.md)** _(active)_ — Parking lot for named but unresolved substrate, documentation, and future-app questions. Read before turning an open question into a decision or build plan.

<!-- INDEX:END -->
