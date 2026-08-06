---
summary: "Documentation contribution practice prioritizes conceptual clarity, human reviewability, durable ownership, explicit routing, and consistent prose."
---

# Documentation contribution practice

Conceptual clarity and human reviewability determine document boundaries. Retrieval remains a routing concern: one task may load several documents, and a corpus review may load the whole tree.

For an ordinary documentation change, choose the narrowest knowledge owner and establish a coherent document boundary. Then encode its frontmatter, apply the matching writing and style guidance, regenerate the indexes, and verify them. Consult the documentation model when changing that practice or when it has a gap.

Tree-specific authoring specs remain with the trees that they govern. They refine this repository-wide practice rather than duplicating it. When local structure conflicts with general style guidance, the tree-specific authoring spec controls.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[document-boundaries](./document-boundaries.md)** _(how-to)._ Documents are conceptually coherent, human-reviewable maintenance units, while one task may assemble several documents into its retrieval and review set. _Read before creating, splitting, merging, or substantially expanding a document._
- **[documentation-model](./documentation-model.md)** _(explanation)._ UIX documentation separates reader need, agent memory, readership, meta-level, lifecycle, and evolution while treating conceptual clarity and human maintenance as boundary constraints. _Read before proposing a change to the documentation structure or when the contribution practice has a gap._
- **[frontmatter](./frontmatter.md)** _(reference)._ Documentation frontmatter exposes each leaf's thesis, reader need, optional retrieval trigger, and exceptional lifecycle state without repeating its path context. _Read before adding or changing documentation frontmatter, summaries, kinds, triggers, or lifecycle states._
- **[knowledge-placement](./knowledge-placement.md)** _(how-to)._ Place knowledge at the narrowest durable owner, and create a discrete document only for context that source inspection cannot reliably recover. _Read before deciding where new guidance belongs, promoting prose into a document, or deleting descriptive documentation._
- **[markdown-style](./markdown-style.md)** _(reference)._ UIX documentation uses consistent Markdown for document layout, headings, lists, code, links, tables, HTML, and line wrapping. _Read before writing or reviewing Markdown structure and formatting._
- **[prose-style](./prose-style.md)** _(reference)._ UIX prose uses concise current-state language, stable terminology, direct sentence structure, and mechanically enforced wording and punctuation. _Read before writing or reviewing documentation prose, terminology, voice, or punctuation, or before adding a prose-style rule._
- **[routing-and-indexes](./routing-and-indexes.md)** _(how-to)._ AGENTS.md files combine owned directory guidance with generated child indexes, while one checked generator maintains documentation and source routes. _Read before adding or changing an AGENTS.md file, generated index, source summary route, or tree-level authoring spec._
- **[writing-profiles](./writing-profiles.md)** _(reference)._ Normative, explanatory, and historical sections use distinct writing profiles so requirements stay testable without flattening rationale or recorded reasoning. _Read before choosing how prescriptive a section should be or reviewing normative documentation._

<!-- INDEX:END -->
