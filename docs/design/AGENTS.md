# Design notes

Living topic threads: the winding discussions where we weigh options, name tradeoffs, and decide what to do — and what _not_ to do — and why. This is the only layer that keeps the rejected paths and the narrative; everything else records conclusions.

Each note is slugged by the **problem**, not the solution (so it survives pivots), and is structured as a **current synthesis on top of an append-only `## Log`**. Revisit across sessions by appending a dated log entry and updating the synthesis. When a thread resolves, set `status: resolved` and link the decisions and plans it produced.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[canvas-data-channel](./canvas-data-channel.md)** _(exploring)_ — Design thread for the bidirectional canvas/document data channel: the anchored edit grammar, pane tools, writeback/user diffs, and the content-store seam. Read before working on anchored edit tools, pane tools, filesystem-tool parity, or the case-1/case-2 canvas split. Versioning, history, and rollback are a sibling thread (pane-and-file-versioning).
- **[conversation-render-primitives](./conversation-render-primitives.md)** _(exploring)_ — How the conversation pane renders typed blocks extensibly by porting pi's render architecture from TUI to React: a forwarded event stream plus two render registries (tool renderers keyed by tool name; message renderers keyed by customType) and pi's content/display/details block split. Read before adding conversation block types, agent-triggerable UI components, or the frontend-extension render API.
- **[pane-and-file-versioning](./pane-and-file-versioning.md)** _(exploring)_ — Design thread for versioning, history, and rollback of pane documents and (optionally) the user's working tree, both backed by git and linked to pi's conversation tree. Read before working on the .uix object store, conversation-node restore points, per-run file snapshots, or the rollback UI. The anchored edit channel that sits in front of this is a sibling thread (canvas-data-channel).
- **[uix-core-composition](./uix-core-composition.md)** _(exploring)_ — How UIX-core contributes to its owned pi session and how UIX is structured as composable concepts: the composition root, the facet and override models, the communication topology, and the concept vocabulary. Read before adding a UIX-core agent tool, hook, or transform, standing up a pane or conversation block, or wiring a cross-surface channel.

<!-- INDEX:END -->
