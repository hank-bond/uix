---
summary: "Dev-facing meta docs — decisions, design threads, architecture records, and plans — and the map for routing into them."
status: active
---

# Dev documentation

This tree is **dev-facing meta documentation**: how we reason about UIX, what we decided and why, what we're about to build, and how the codebase is shaped. It is **not shipped** with the app and **not pinned into the agent's context**. The user-facing substrate docs that ship live in [`../src/docs/`](../src/docs/); this tree is the layer behind them.

## Where to read

The layers distill left-to-right over time — **design note → decision → plan → architecture** — each step more settled than the last; the design note is the only place rejected alternatives survive. Authoring rules (frontmatter, formatting, the overview-plus-index shape, design-note threads) live in `contributing.md`, listed below.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[architecture/](./architecture/AGENTS.md)** _(active)_ — Architecture-of-record for the cockpit as it currently is — living docs that always track HEAD: subsystem shape, code conventions, and open questions.
- **[contributing](./contributing.md)** _(active)_ — How to author and maintain repository docs: the four layers' lifecycles, frontmatter summary/read_when rules, prose formatting, the AGENTS.md overview-plus-index shape, and living design-note threads.
- **[decisions/](./decisions/AGENTS.md)** _(active)_ — Finalized UIX architectural decisions — write-once and dated, each with its rationale; the settled conclusions the design threads distilled and the other layers build on.
- **[design/](./design/AGENTS.md)** _(active)_ — Living design threads — a current synthesis over an append-only log — where options, tradeoffs, and rejected alternatives are weighed before they distill into decisions.
- **[plans/](./plans/AGENTS.md)** _(active)_ — Active build specs for what's about to be built — deliverables and their units — plus a backlog of seeds not yet promoted to their own spec.

<!-- INDEX:END -->
