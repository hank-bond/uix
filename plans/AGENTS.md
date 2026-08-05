---
summary: "Active build specs, reviewable delivery units, and a backlog of smaller implementation seeds."
status: active
---

# Plans

Plans are build specs slugged by deliverable. A plan needs to remain valid, but it does not need to be under active implementation. Landed or retired plans move to [`archive/`](./archive/). Plans cite the decisions in [`AGENTS.md`](../docs/decisions/AGENTS.md) and the design threads in [`AGENTS.md`](../docs/design/AGENTS.md) that bound them.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[backlog](./backlog.md)** _(active)._ Compact seeds for planned UIX deliverables that need enough context to be actionable but aren't standalone specs yet.
- **[canvas-reusable-assets](./canvas-reusable-assets.md)** _(active)._ Give Canvas a reusable local web-asset library in eight reviewable units. These cover feature-static resources, a same-origin asset route, AGENTS.md catalogs, DOM serialization controls, authoring guidance, a component model, serve-time expansion, and conflict-handling updates.
- **[chat-provider-login](./chat-provider-login.md)** _(active)._ Add chat-first provider connection UX over Pi's provider-owned ModelRuntime auth flows, followed by a no-model onboarding takeover and ordinary model-selection handoff.
- **[chat-rendering-polish](./chat-rendering-polish.md)** _(active)._ Improve Chat in seven review-gated units: block framing, Markdown and syntax highlighting, file-tool rendering, a description-bearing command tool, streamed/collapsible thinking, thinking-effort control, performance, and documentation.
- **[code-proximate-documentation](./code-proximate-documentation.md)** _(active)._ Placement and comment rules, generated source indexes, and the representative boundary migration have landed. Remaining work splits every centralized src/docs/ page into user-implementation how-tos or code-adjacent facts.
- **[cross-feature-capabilities-and-resource-viewing](./cross-feature-capabilities-and-resource-viewing.md)** _(active)._ Establish publisher-qualified public protocols, optional typed provider/client routing, substrate-owned document resources, and framework-neutral resource-viewer registration in review-gated units. Remaining identity, distribution, selection, document, and transport details are settled before implementation.
- **[durable-transcript-identity](./durable-transcript-identity.md)** _(active)._ Keyed-on-persist identity, one-pass branch projection, and feature-isolated restoration on startup, New Session, replacement-session activation, and serialized feature reload have landed. Remaining work persists and joins low-frequency block state (D2).
- **[electron-server-split](./electron-server-split.md)** _(active)._ Split UIX into a host-neutral workspace runtime, browser client, server host, and Electron host in one monorepo. Prove local browser operation first, then make the unbootstrapped server and the batteries-included Electron product independently packageable.
- **[framework-neutral-surfaces-and-shell](./framework-neutral-surfaces-and-shell.md)** _(active)._ Make frontend frameworks a feature choice rather than a UIX requirement in five post-alpha stages. Settle the minimal DOM/ESM boundary, land and prove neutral surface mounting, and migrate framework ownership into features. Then replace the workspace shell, replace the independent picker, and finish the public contract.
- **[persistence-and-session-foundation](./persistence-and-session-foundation.md)** _(active)._ Build spec for persistence on Pi's session file. Branch projection and feature-isolated restoration run on startup, replacement-session activation, and serialized feature reloads, with current state committed before replacement.
- **[session-history-and-switching](./session-history-and-switching.md)** _(active)._ Stage durable session history: transition foundations unlock New Session first, then switching and titles. Robustness, diagnostics, recovery, and polish follow without blocking those vertical slices.
- **[workspace-actions-and-command-palette](./workspace-actions-and-command-palette.md)** _(active)._ Build workspace actions and the replaceable default command palette in seven reviewable units. Units cover action resolution, renderer registry integration, durable keybindings and conflicts, keyboard/Electron dispatch, ambient surfaces, the palette feature, and customization/docs verification.
- **[workspace-first-render-gate](./workspace-first-render-gate.md)** _(stub)._ Show a substrate-owned loading overlay while the accepted initial feature composition restores and renders underneath it. Reveal the workspace after restoration and first surface presentation settle.

<!-- INDEX:END -->
