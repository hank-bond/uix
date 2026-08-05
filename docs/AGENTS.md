---
summary: "Repository-level documentation holds cross-boundary architecture, workflows, external context, decisions, design threads, and documentation practice."
---

# Repository documentation

This tree owns documentation whose scope crosses one source ownership boundary. It records UIX's shape, decisions, constraints, and broader workflows. Source-coupled guidance belongs beside its owning code under the model in [`contributing.md`](./contributing.md).

Active build specs live in [`AGENTS.md`](../plans/AGENTS.md), and the user-facing implementation guides live in [`AGENTS.md`](../src/docs/AGENTS.md).

## The four document layers

Each document layer has its own filename convention, summary template, and lifecycle. If the file is a point-in-time event, put the date in its filename. If it contains dated events, keep dates inside it.

| Layer | Filename | Summary states | Mutability |
| --- | --- | --- | --- |
| `decisions/` | `YYYY-MM-DD-slug` | the conclusion | write-once (only `status` may change) |
| `design/` | `problem-name` | the open question + axes | synthesis mutable, `## Log` append-only |
| `architecture/` | `constraint-name` | a current cross-cutting invariant or hard-won context | living, always = HEAD |
| `../plans/` | `deliverable` | the deliverable + units | active → landed or archived under `../plans/archive/` |

The records distill through _design note → decision → plan → architecture_. Each step is more settled than the last, and only the design note preserves rejected alternatives. Plans sit at the repository root because they track builds rather than document the system. Later records carry the applicable conclusion or enduring constraint.

## Document kinds

Each indexed document has a _kind_: reference, explanation, how-to, or tutorial. The kind describes the need that the document serves and remains independent from lifecycle status. Plans carry no kind. [`framework.md`](./framework.md) explains this shape, and [`contributing.md`](./contributing.md) defines the authoring practice.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[architecture/](./architecture/AGENTS.md)** Living architecture records for implemented subsystem shape, code conventions, design principles, and open questions at HEAD.
- **[contributing](./contributing.md)** _(how-to)._ Place code-related knowledge at its narrowest owner and author discrete documents through retrieval units, frontmatter, generated indexes, writing profiles, conventions, and living design threads.
- **[decisions/](./decisions/AGENTS.md)** Write-once dated UIX architecture decisions record settled conclusions and rationale for later plans, code, and reference documentation.
- **[design/](./design/AGENTS.md)** Living design threads combine mutable synthesis with append-only logs of options, tradeoffs, and rejected alternatives.
- **[framework](./framework.md)** _(explanation)._ UIX documentation separates reader need, agent memory, readership, meta-level, lifecycle, and evolution into independent organizing axes. _Read before proposing a change to the documentation structure (the how), or when the how has a gap._
- **[style-guide](./style-guide.md)** _(reference)._ UIX documentation uses concise current-state prose, retrieval-oriented structure, consistent Markdown, and mechanically enforced vocabulary.

<!-- INDEX:END -->
