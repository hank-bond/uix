---
summary: "Mutable implementation plans divide requirement specifications into reviewable slices and track the active attempt, progress, and lessons."
---

# Plans

Plans are disposable implementation artifacts slugged by deliverable. They divide requirement specifications into checked review slices and track one attempt's progress, mechanisms, findings, and verification. Plans carry no normative authority and may use the format that best serves the implementing agent.

When an attempt resets, preserve a compact summary at the bottom of the plan. Record what worked, what did not work, relevant specification changes, and unresolved issues. Rewrite the active plan and discard the old implementation details. Landed or retired plans move to [`archive/`](./archive/). [`requirement-specifications.md`](../docs/contributing/requirement-specifications.md) defines the full lifecycle.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[agent-bound-canvas-document-route](./agent-bound-canvas-document-route.md)** Move Canvas document reads onto the first Agent-bound web route in nine small review units, ending with direct iframe loading through both hosts.
- **[agent-feature-instances-and-viewpoint-state](./agent-feature-instances-and-viewpoint-state.md)** R0-A3 landed: mutable feature state and the current transcript now belong to each guarded Agent instance viewpoint.
- **[backlog](./backlog.md)** Compact seeds for planned UIX deliverables that need enough context to be actionable but aren't standalone specs yet.
- **[canvas-reusable-assets](./canvas-reusable-assets.md)** Give Canvas a reusable local web-asset library in eight reviewable units. These cover feature-static resources, a same-origin asset route, AGENTS.md catalogs, DOM serialization controls, authoring guidance, a component model, serve-time expansion, and conflict-handling updates.
- **[chat-provider-login](./chat-provider-login.md)** Add chat-first provider connection UX over Pi's provider-owned ModelRuntime auth flows, followed by a no-model onboarding takeover and ordinary model-selection handoff.
- **[chat-rendering-polish](./chat-rendering-polish.md)** Improve Chat in seven review-gated units: block rendering, Markdown and syntax highlighting, file-tool rendering, command tools, streamed thinking, thinking-effort control, performance, and documentation.
- **[chat-scroll-director](./chat-scroll-director.md)** Replace Chat's unconditional bottom-scroll effect with a chat-owned semantic scroll director: stable transcript-row anchors, live turn-follow modes, end-of-turn positioning, and reflow preservation.
- **[cross-feature-capabilities-and-resource-viewing](./cross-feature-capabilities-and-resource-viewing.md)** Establish publisher-qualified public protocols, optional typed provider/client routing, substrate-owned document resources, and framework-neutral resource-viewer registration in review-gated units. Settle remaining identity, distribution, selection, document, and transport details before implementation.
- **[durable-transcript-identity](./durable-transcript-identity.md)** Keyed-on-persist identity, one-pass branch projection, and feature-isolated restoration on startup, New Session, replacement-session activation, and serialized feature reload have landed. Remaining work persists and joins low-frequency block state (D2).
- **[explicit-app-and-workspace-ownership](./explicit-app-and-workspace-ownership.md)** Move first-party features and the dogfood workspace into explicit app-owned roots so hosts and substrate packages contain no implicit application composition.
- **[framework-neutral-surfaces-and-shell](./framework-neutral-surfaces-and-shell.md)** Make frontend frameworks a feature choice rather than a UIX requirement in five post-alpha stages. Settle the minimal DOM/ESM boundary, land and prove neutral surface mounting, and migrate framework ownership into features. Then replace the workspace shell, replace the independent launcher, and finish the public contract.
- **[persistence-and-session-foundation](./persistence-and-session-foundation.md)** Build spec for persistence on Pi's session file. Branch projection and feature-isolated restoration run on startup, replacement-session activation, and serialized feature reloads, with current state committed before replacement.
- **[request-completion-and-settings-persistence](./request-completion-and-settings-persistence.md)** Define request-scoped completion versus accepted independent operations, then make workspace setting responses await immediate revisioned manifest persistence.
- **[runtime-operation-hardening](./runtime-operation-hardening.md)** Finish cancellable operation ownership after web-host dispatch conformance: provider authentication, model refresh, single-flight boots, external calls, and bounded shutdown.
- **[session-history-and-switching](./session-history-and-switching.md)** New Session, global session switching, titles, and branch restoration landed under the selected-session model. Remaining diagnostics and hardening pause until the host/runtime split rebases selection onto per-attachment agent instances.
- **[session-worktrees-and-turn-checkpoints](./session-worktrees-and-turn-checkpoints.md)** Build the workspace-file state substrate: auto-initialized git per workspace, session-branch worktrees, and turn-boundary checkpoint commits on app-owned refs. Checkpoint restore covers checkpoint-on-leave, turn-state binding, close-out reclaim, and the diff-review/merge surface.
- **[two-host-behavioral-conformance](./two-host-behavioral-conformance.md)** Drive real Electron and server hosts through shared scenarios, recording differences before planning parity work.
- **[workspace-actions-and-command-palette](./workspace-actions-and-command-palette.md)** Build workspace actions and the replaceable default command palette in seven reviewable units. Units cover action resolution, renderer registry integration, durable keybindings and conflicts, keyboard/Electron dispatch, ambient surfaces, the palette feature, and customization/docs verification.
- **[workspace-first-render-gate](./workspace-first-render-gate.md)** _(stub)._ Show a substrate-owned loading overlay while the accepted initial feature composition restores and renders underneath it. Reveal the workspace after restoration and first surface presentation settle.

<!-- INDEX:END -->
