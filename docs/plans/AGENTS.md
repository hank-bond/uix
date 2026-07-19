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
- **[durable-transcript-identity](./durable-transcript-identity.md)** _(active)_ — Keyed-on-persist identity and the one-pass transcript/turn-state-as-of-leaf projection have landed; remaining work persists low-frequency block state (D2), joins it into the projection, and applies the shared restore lifecycle (D3).
- **[electron-server-split](./electron-server-split.md)** _(active)_ — Split UIX into a host-neutral workspace runtime, browser client, server host, and Electron host in one monorepo; prove local browser operation first, then make the unbootstrapped server and batteries-included Electron product independently packageable.
- **[file-substrate](./file-substrate.md)** _(active)_ — A manifest-backed workspace settings service hydrates feature-declared TypeBox schemas plus explicit defaults into feature entries, exposes validated ctx.settings, and writes atomically without live filesystem watching; tracked document publication is the future file-change primitive.
- **[persistence-and-session-foundation](./persistence-and-session-foundation.md)** _(active)_ — Build spec for persistence on pi's session file: session rehydration, the in-process pi extension, the first versioned store, and keyed turn-state snapshots and commits have landed; next, shared branch projection invokes the contributed restore callbacks on startup, reload, and session activation before later preview/navigation.
- **[repository-vocabulary-coherence](./repository-vocabulary-coherence.md)** _(active)_ — Audit and reconcile UIX vocabulary repo-wide in four review-gated units: inventory shape/lifecycle terms and drift, settle the canonical glossary, migrate public APIs before subsystem internals, then repair docs and add lightweight coherence checks.
- **[session-history-and-switching](./session-history-and-switching.md)** _(active)_ — Stage durable session history so transition foundations unlock New Session first, then switching and naming, while robustness, diagnostics, recovery, and polish follow without blocking those vertical slices.
- **[workspace-actions-and-command-palette](./workspace-actions-and-command-palette.md)** _(active)_ — Build workspace actions and the replaceable default command palette in seven reviewable units: action normalization, renderer registration, durable keybindings and conflicts, keyboard/Electron dispatch, ambient surfaces, the palette feature, and customization/docs verification.
- **[workspace-first-render-gate](./workspace-first-render-gate.md)** _(active)_ — Keep each initial Electron workspace window hidden until its manifest-composed surfaces settle their first host render, in three reviewable units: a one-shot host visibility gate, renderer surface-settlement tracking, and failure/documentation verification.

<!-- INDEX:END -->
