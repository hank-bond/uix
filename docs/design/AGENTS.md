---
summary: "Living design threads — a current synthesis over an append-only log — where options, tradeoffs, and rejected alternatives are weighed before they distill into decisions."
status: active
---

# Design notes

Living topic threads: the winding discussions where we weigh options, name tradeoffs, and decide what to do — and what _not_ to do — and why. This is the only layer that keeps the rejected paths and the narrative; everything else records conclusions.

Each note is slugged by the **problem**, not the solution (so it survives pivots), and is structured as a **current synthesis on top of an append-only `## Log`**. Revisit across sessions by appending a dated log entry and updating the synthesis. When a thread resolves, set `status: resolved` and link the decisions and plans it produced.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[agent-state-messages](./agent-state-messages.md)** _(exploring)_ — Exploring how cockpit/extension state reaches the agent and comes back typed: display-hidden custom messages with a system-prompt vocabulary now; registerStateMessage contributions with update/append buffers or run-start materialization, tools-as-output-contracts, CustomEntry event logs, and fan-out prepared roots as the axes.
- **[canvas-data-channel](./canvas-data-channel.md)** _(exploring)_ — Exploring the bidirectional canvas/document data channel: the anchored edit grammar, pane tools, writeback/user diffs, and the document-store seam (versioning is the sibling pane-and-file-versioning thread).
- **[conversation-render-primitives](./conversation-render-primitives.md)** _(exploring)_ — Exploring extensible rendering of typed conversation blocks by porting pi's render architecture from TUI to React: a forwarded event stream plus two registries (tool renderers by tool name, message renderers by customType) and pi's content/display/details split.
- **[pane-and-file-versioning](./pane-and-file-versioning.md)** _(exploring)_ — Exploring versioning, history, and rollback of pane documents and optionally the user's working tree — both git-backed and linked to pi's conversation tree (the anchored edit channel in front of this is the sibling canvas-data-channel thread).
- **[uix-core-composition](./uix-core-composition.md)** _(exploring)_ — Exploring how UIX-core composes its pi contributions and how UIX is structured as composable concepts: the composition root, the facet and override models, the communication topology, and the concept vocabulary.
- **[workspace-feature-composition](./workspace-feature-composition.md)** _(exploring)_ — Exploring UIX's next composition layer: features are capability/UI/state packages, workspaces compose enabled features with one or more agents and linkages, chat/canvas are default features rather than core app structure, and panes/surfaces stay layout concerns until the app/workspace model settles. _Read before designing pane/surface/app contributions, feature-agent linking, multi-agent sharing of feature state, or deciding whether chat/canvas should be treated as substrate._

<!-- INDEX:END -->
