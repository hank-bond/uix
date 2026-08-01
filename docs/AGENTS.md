---
summary: "Dev-facing meta docs — decisions, design threads, architecture records, and plans — and the map for routing into them."
status: active
---

# Dev documentation

This tree is **dev-facing meta documentation**: how we reason about UIX, what we decided and why, what we're about to build, and how the codebase is shaped. It is **not shipped** with the app and **not pinned into the agent's context**. The user-facing substrate docs that ship live in [`../src/docs/`](../src/docs/); this tree is the layer behind them.

## Where to read

The layers distill left-to-right over time — **design note → decision → plan → architecture** — each step more settled than the last; the design note is the only place rejected alternatives survive. Authoring rules (frontmatter, formatting, the overview-plus-index shape, design-note threads) live in `contributing.md`, listed below.

Every indexed doc is tagged with a **kind** — reference, explanation, how-to, or tutorial — the need it serves, orthogonal to the layer's lifecycle status. The plans layer is an exception: it tracks the build rather than documenting it and carries no kind. The reasoning behind this shape lives in [`framework.md`](./framework.md); the practice of authoring and maintaining it lives in [`contributing.md`](./contributing.md).

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[architecture/](./architecture/AGENTS.md)** _(active)_ — Architecture-of-record for the cockpit as it currently is — living docs that always track HEAD: subsystem shape, code conventions, and open questions.
- **[contributing](./contributing.md)** _(active, how-to)_ — How to author and maintain repository docs: layers and retrieval units, frontmatter and rollups, normative language and writing profiles, convention-rule and lexicon formats, prose formatting, and living design-note threads.
- **[decisions/](./decisions/AGENTS.md)** _(active)_ — Finalized UIX architectural decisions — write-once and dated, each with its rationale; the settled conclusions the design threads distilled and the other layers build on.
- **[design/](./design/AGENTS.md)** _(active)_ — Living design threads — a current synthesis over an append-only log — where options, tradeoffs, and rejected alternatives are weighed before they distill into decisions.
- **[framework](./framework.md)** _(stub, explanation)_ — The reasoning behind the UIX documentation shape — the four kinds, the what/how/why split, the agent-first adaptation, the decision loop, and the budget. Placeholder to build together. _Read before proposing a change to the documentation structure (the how), or when the how has a gap._
- **[plans/](./plans/AGENTS.md)** _(active)_ — Active build specs for what's about to be built — deliverables and their units — plus a backlog of seeds not yet promoted to their own spec.

<!-- INDEX:END -->
