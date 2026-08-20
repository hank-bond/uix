---
summary: "Active build specs, reviewable delivery units, and a backlog of smaller implementation seeds."
---

# Plans

Plans are build specs slugged by deliverable. A plan needs to remain valid, but it does not need to be under active implementation. Landed or retired plans move to [`archive/`](./archive/). Plans cite the decisions in [`AGENTS.md`](../docs/decisions/AGENTS.md) and the design threads in [`AGENTS.md`](../docs/design/AGENTS.md) that bound them.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[agent-feature-instances-and-viewpoint-state](./agent-feature-instances-and-viewpoint-state.md)** Build grouped workspace/Agent facet lifecycles, per-Agent feature states, isolated primary-session Canvas checkouts, and selected-view I/O without implementing multi-branch Agents.
- **[backlog](./backlog.md)** Compact seeds for planned UIX deliverables that need enough context to be actionable but aren't standalone specs yet.
- **[canvas-reusable-assets](./canvas-reusable-assets.md)** Give Canvas a reusable local web-asset library in eight reviewable units. These cover feature-static resources, a same-origin asset route, AGENTS.md catalogs, DOM serialization controls, authoring guidance, a component model, serve-time expansion, and conflict-handling updates.
- **[chat-provider-login](./chat-provider-login.md)** Add chat-first provider connection UX over Pi's provider-owned ModelRuntime auth flows, followed by a no-model onboarding takeover and ordinary model-selection handoff.
- **[chat-rendering-polish](./chat-rendering-polish.md)** Improve Chat in seven review-gated units: block framing, Markdown and syntax highlighting, file-tool rendering, command tools, streamed thinking, thinking-effort control, performance, and documentation.
- **[chat-scroll-director](./chat-scroll-director.md)** Replace Chat's unconditional bottom-scroll effect with a chat-owned semantic scroll director: stable transcript-row anchors, live turn-follow modes, end-of-turn positioning, and reflow preservation.
- **[cross-feature-capabilities-and-resource-viewing](./cross-feature-capabilities-and-resource-viewing.md)** Establish publisher-qualified public protocols, optional typed provider/client routing, substrate-owned document resources, and framework-neutral resource-viewer registration in review-gated units. Settle remaining identity, distribution, selection, document, and transport details before implementation.
- **[durable-transcript-identity](./durable-transcript-identity.md)** Keyed-on-persist identity, one-pass branch projection, and feature-isolated restoration on startup, New Session, replacement-session activation, and serialized feature reload have landed. Remaining work persists and joins low-frequency block state (D2).
- **[electron-server-split](./electron-server-split.md)** Build minimal Electron and loopback server hosts over the proved workspace runtime, attachment boundary, supervisor, and shared browser client.
- **[framework-neutral-surfaces-and-shell](./framework-neutral-surfaces-and-shell.md)** Make frontend frameworks a feature choice rather than a UIX requirement in five post-alpha stages. Settle the minimal DOM/ESM boundary, land and prove neutral surface mounting, and migrate framework ownership into features. Then replace the workspace shell, replace the independent launcher, and finish the public contract.
- **[persistence-and-session-foundation](./persistence-and-session-foundation.md)** Build spec for persistence on Pi's session file. Branch projection and feature-isolated restoration run on startup, replacement-session activation, and serialized feature reloads, with current state committed before replacement.
- **[runtime-operation-hardening](./runtime-operation-hardening.md)** Finish cancellable operation ownership after the basic web vertical: prepared dispatch, provider authentication, model refresh, single-flight boots, external calls, and bounded shutdown.
- **[server-browser-parity-and-distribution](./server-browser-parity-and-distribution.md)** Add reconnect recovery, full browser parity, explicit app ownership, local operations, safety review, and independent distribution to the minimal server.
- **[session-history-and-switching](./session-history-and-switching.md)** New Session, global session switching, titles, and branch restoration landed under the selected-session model. Remaining diagnostics and hardening pause until the host/runtime split rebases selection onto per-attachment agent instances.
- **[session-worktrees-and-turn-checkpoints](./session-worktrees-and-turn-checkpoints.md)** Build the workspace-file state substrate: auto-initialized git per workspace, session-branch worktrees, and turn-boundary checkpoint commits on app-owned refs. Checkpoint restore covers checkpoint-on-leave, turn-state binding, close-out reclaim, and the diff-review/merge surface.
- **[workspace-actions-and-command-palette](./workspace-actions-and-command-palette.md)** Build workspace actions and the replaceable default command palette in seven reviewable units. Units cover action resolution, renderer registry integration, durable keybindings and conflicts, keyboard/Electron dispatch, ambient surfaces, the palette feature, and customization/docs verification.
- **[workspace-first-render-gate](./workspace-first-render-gate.md)** _(stub)._ Show a substrate-owned loading overlay while the accepted initial feature composition restores and renders underneath it. Reveal the workspace after restoration and first surface presentation settle.

<!-- INDEX:END -->
