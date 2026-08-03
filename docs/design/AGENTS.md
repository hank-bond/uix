---
summary: "Living design threads combine mutable synthesis with append-only logs of options, tradeoffs, and rejected alternatives."
status: active
---

# Design notes

Living topic threads: the winding discussions where we weigh options, name tradeoffs, and decide what to do — and what _not_ to do — and why. This is the only layer that keeps the rejected paths and the narrative; everything else records conclusions.

Each note is slugged by the **problem**, not the solution (so it survives pivots), and is structured as a **current synthesis on top of an append-only `## Log`**. Revisit across sessions by appending a dated log entry and updating the synthesis. When a thread resolves, set `status: resolved` and link the decisions and plans it produced.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[agent-state-messages](./agent-state-messages.md)** _(exploring, explanation)._ Exploring model-visible feature state through hidden agent context, buffered or turn-state-backed materialization, tool output contracts, transcript observers, and future ordering.
- **[canvas-data-channel](./canvas-data-channel.md)** _(exploring, explanation)._ Exploring Canvas document exchange through anchored tools, iframe writeback, branch-restored versions, human-edit context, and the store-buffer boundary.
- **[conversation-render-primitives](./conversation-render-primitives.md)** _(exploring, explanation)._ Exploring public React transcript presentation through separate tool and custom-message registries, typed payloads, durable interaction identity, fallback, and failure isolation.
- **[cross-feature-interoperability](./cross-feature-interoperability.md)** _(exploring, explanation)._ Exploring cross-feature interoperability through publisher-qualified shared protocols, optional typed providers, common document resources, and resource viewers while separating semantic capability, reactive state, presentation routing, and host delivery.
- **[feature-source-admission](./feature-source-admission.md)** _(exploring, explanation)._ Exploring how UIX admits agent-authored feature source: TypeScript-only API-conformance checks before activation, TypeBox for unknown runtime data, domain assertions for composition, and feature lifetimes for behavioral failure.
- **[pane-and-file-versioning](./pane-and-file-versioning.md)** _(exploring, explanation)._ Exploring managed-document history and optional workspace checkpoints across version backends, retention, preview, non-destructive rollback, Git state, and cwd transitions.
- **[rollback-boundaries](./rollback-boundaries.md)** _(exploring, explanation)._ Exploring one query/mutation/effect vocabulary across UIX's rollback stack so managed state can checkpoint and restore coherently while external consequences remain explicitly outside that guarantee.
- **[uix-core-composition](./uix-core-composition.md)** _(exploring, explanation)._ Exploring UIX's Pi composition root, feature facets, registry-to-installer boundary, reload reconciliation, typed communication, and deliberate override seams.
- **[workspace-actions](./workspace-actions.md)** _(resolved, explanation)._ Workspace actions are feature-owned renderer workflows arranged in presentation trees: one renderer registry privately holds callbacks, publicly derives a serializable action-catalog projection, resolves durable workspace keybindings and conflicts, and lets replaceable palette/menu/tree features invoke actions by id while backend effects continue through typed channels.
- **[workspace-feature-composition](./workspace-feature-composition.md)** _(exploring, explanation)._ Exploring composition beyond the single-page, single-agent runtime: contained surfaces, layout slots, feature-agent links, shared state, and concurrent workspaces. _Read before designing surface contributions or layout, feature-agent linking, multi-agent sharing of feature state, reintroducing any Host/iframe boundary, or deciding whether chat/canvas should be treated as substrate._
- **[workspace-settings](./workspace-settings.md)** _(resolved, explanation)._ A uniform schema-defined settings-scope model: whole-object defaults materialize instead of layering, static and dynamic keys share one validator path, reload commits atomically, feature handles stay scoped, and a replaceable editor consumes a constrained cross-feature projection.

<!-- INDEX:END -->
