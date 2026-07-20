---
summary: "Active build specs for what's about to be built — deliverables and their units — plus a backlog of seeds not yet promoted to their own spec."
status: active
---

# Plans

Specs for things we intend to build — slugged by deliverable. A plan only needs to be **valid**, not actively worked. Shipped plans move to [`archive/`](./archive/). Plans cite the [`../decisions/`](../decisions/) they assume and the [`../design/`](../design/) thread they came from.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[backlog](./backlog.md)** _(active)_ — Compact seeds for planned UIX deliverables that need enough context to be actionable but aren't standalone specs yet.
- **[chat-provider-login](./chat-provider-login.md)** _(active)_ — Add chat-first provider connection UX: unified OAuth and credential setup, guided cloud-provider recipes, a no-model onboarding takeover, secure channel redaction, and normal unfiltered model selection after login.
- **[durable-transcript-identity](./durable-transcript-identity.md)** _(active)_ — Keyed-on-persist identity, one-pass branch projection, and feature-isolated restoration on startup, replacement-session activation, and serialized feature reload have landed; remaining work persists and joins low-frequency block state (D2).
- **[electron-server-split](./electron-server-split.md)** _(active)_ — Split UIX into a host-neutral workspace runtime, browser client, server host, and Electron host in one monorepo; prove local browser operation first, then make the unbootstrapped server and batteries-included Electron product independently packageable.
- **[file-substrate](./file-substrate.md)** _(active)_ — A manifest-backed workspace settings service hydrates feature-declared TypeBox schemas plus explicit defaults into feature entries, exposes validated ctx.settings, and writes atomically without live filesystem watching; tracked document publication is the future file-change primitive.
- **[persistence-and-session-foundation](./persistence-and-session-foundation.md)** _(active)_ — Build spec for persistence on pi's session file: branch projection and feature-isolated restoration run on startup, replacement-session activation, and serialized feature reloads, with current state committed before replacement.
- **[repository-vocabulary-coherence](./repository-vocabulary-coherence.md)** _(active)_ — Audit and reconcile UIX vocabulary repo-wide in four review-gated units: inventory shape/lifecycle terms and drift, settle the canonical glossary, migrate public APIs before subsystem internals, then repair docs and add lightweight coherence checks.
- **[session-history-and-switching](./session-history-and-switching.md)** _(active)_ — Stage durable session history so transition foundations unlock New Session first, then switching and naming, while robustness, diagnostics, recovery, and polish follow without blocking those vertical slices.
- **[workspace-actions-and-command-palette](./workspace-actions-and-command-palette.md)** _(active)_ — Build workspace actions and the replaceable default command palette in seven reviewable units: action normalization, renderer registration, durable keybindings and conflicts, keyboard/Electron dispatch, ambient surfaces, the palette feature, and customization/docs verification.
- **[workspace-first-render-gate](./workspace-first-render-gate.md)** _(stub)_ — Show a substrate-owned loading overlay while the accepted initial feature composition restores and renders underneath it, then reveal the workspace after restoration and first surface presentation settle.

<!-- INDEX:END -->
