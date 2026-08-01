---
summary: "Active build specs for what's about to be built — deliverables and their units — plus a backlog of seeds not yet promoted to their own spec."
status: active
---

# Plans

Specs for things we intend to build — slugged by deliverable. A plan only needs to be **valid**, not actively worked. Shipped plans move to [`archive/`](./archive/). Plans cite the [`../decisions/`](../decisions/) they assume and the [`../design/`](../design/) thread they came from.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[backlog](./backlog.md)** _(active)_ — Compact seeds for planned UIX deliverables that need enough context to be actionable but aren't standalone specs yet.
- **[canvas-reusable-assets](./canvas-reusable-assets.md)** _(active)_ — Give Canvas a reusable local web-asset library in eight reviewable units: feature-static resources, a same-origin public asset route, progressively disclosed AGENTS.md catalogs, transient DOM serialization controls, authoring guidance, a component authoring model, serve-time expansion, and versioned conflict-handling updates.
- **[chat-provider-login](./chat-provider-login.md)** _(active)_ — Add chat-first provider connection UX over Pi's provider-owned ModelRuntime auth flows, followed by a no-model onboarding takeover and ordinary model-selection handoff.
- **[chat-rendering-polish](./chat-rendering-polish.md)** _(active)_ — Improve Chat in seven review-gated units: block framing, Markdown and syntax highlighting, file-tool rendering, a description-bearing command tool, streamed/collapsible thinking, thinking-effort control, then performance and documentation.
- **[cross-feature-capabilities-and-resource-viewing](./cross-feature-capabilities-and-resource-viewing.md)** _(active)_ — Establish publisher-qualified public protocols, optional typed provider/client routing, substrate-owned document resources, and framework-neutral resource-viewer registration in review-gated units whose remaining identity, distribution, selection, document, and transport details are settled before implementation.
- **[durable-transcript-identity](./durable-transcript-identity.md)** _(active)_ — Keyed-on-persist identity, one-pass branch projection, and feature-isolated restoration on startup, New Session, replacement-session activation, and serialized feature reload have landed; remaining work persists and joins low-frequency block state (D2).
- **[electron-server-split](./electron-server-split.md)** _(active)_ — Split UIX into a host-neutral workspace runtime, browser client, server host, and Electron host in one monorepo; prove local browser operation first, then make the unbootstrapped server and batteries-included Electron product independently packageable.
- **[file-substrate](./file-substrate.md)** _(active)_ — A manifest-backed workspace settings service hydrates feature-declared TypeBox schemas plus explicit defaults into feature entries, exposes validated ctx.settings, and writes atomically without live filesystem watching; tracked document publication is the future file-change primitive.
- **[persistence-and-session-foundation](./persistence-and-session-foundation.md)** _(active)_ — Build spec for persistence on pi's session file: branch projection and feature-isolated restoration run on startup, replacement-session activation, and serialized feature reloads, with current state committed before replacement.
- **[session-history-and-switching](./session-history-and-switching.md)** _(active)_ — Stage durable session history so transition foundations unlock New Session first, then switching and titles, while robustness, diagnostics, recovery, and polish follow without blocking those vertical slices.
- **[workspace-actions-and-command-palette](./workspace-actions-and-command-palette.md)** _(active)_ — Build workspace actions and the replaceable default command palette in seven reviewable units: action resolution, renderer registry integration, durable keybindings and conflicts, keyboard/Electron dispatch, ambient surfaces, the palette feature, and customization/docs verification.
- **[workspace-first-render-gate](./workspace-first-render-gate.md)** _(stub)_ — Show a substrate-owned loading overlay while the accepted initial feature composition restores and renders underneath it, then reveal the workspace after restoration and first surface presentation settle.

<!-- INDEX:END -->
