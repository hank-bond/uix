---
summary: "Architecture-of-record for what is currently built in UIX and what is in flight."
status: active
---

# Current state

The current state of the system: what's built, how the code is shaped, and the open questions we haven't resolved. Living architecture docs always describe HEAD and are rewritten freely to match the code. This is the dev-facing architecture-of-record; the vision lives in the repo-root [`../../AGENTS.md`](../../AGENTS.md), and the user-facing substrate reference that ships lives in [`../../src/docs/`](../../src/docs/).

**Built:**

- Electron + electron-vite scaffold (`electron.vite.config.ts`, `src/main`, `src/preload`, `src/renderer`).
- Typed IPC scaffold (`src/shared/ipc.ts`, preload bridge).
- Pi `createAgentSession` driver in the main process (`src/main/agent/driver.ts`).
- Lifetime-scoped disposables and lifecycle helpers (`src/main/lifecycle.ts`). See [conventions](./conventions.md).
- Basic conversation pane (`src/renderer/Conversation.tsx`).
- Sequential extension loader with per-entry lifetimes, error isolation, and manual hot reload (`src/main/extensions/`). See [extension-activation-and-isolation](../decisions/2026-05-30-extension-activation-and-isolation.md) and [manual-reload-extensionsbag](../decisions/2026-05-31-manual-reload-extensionsbag.md).
- Canvas pane: own-origin `uix-canvas://` protocol, key-addressed store, anchored canvas tools, whole-document refresh, and an injected writeback shim for form/control and explicit `contenteditable` edits (`src/main/canvas/`, `src/main/content/`, `src/renderer/Canvas.tsx`). See [canvas-stage-one](../decisions/2026-05-31-canvas-stage-one.md) and [canvas-data-channel](../design/canvas-data-channel.md).

**In flight:** lower-level pi integration for native input/context hooks, filesystem-tool parity, and pane versioning/rollback are tracked in [persistence-and-session-foundation](../plans/persistence-and-session-foundation.md), [canvas-data-channel](../design/canvas-data-channel.md), and [pane-and-file-versioning](../design/pane-and-file-versioning.md).

What's _next_ lives in the plans backlog ([`../plans/backlog.md`](../plans/backlog.md)); per-decision history is in [`../decisions/`](../decisions/).
