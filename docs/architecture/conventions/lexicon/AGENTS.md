---
summary: "The controlled lexicon assigns every UIX word one meaning and grammatical role, split by reader task into identifier, prose, and imported terms."
read_when: "Read before introducing a recurring word, reviewing wording in comments or docs, or extending the controlled lexicon."
---

# Lexicon

UIX prose and comments are mostly LLM-generated, so one concept drifts across several words and one word drifts across several meanings. The lexicon assigns each controlled word one role and records the decisions in uniform tables.

Governance and the table format live in [`../contributing.md`](../contributing.md). Read it before adding, changing, or migrating a controlled word.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[code-terms](./code-terms.md)** _(reference)._ Approved identifier vocabulary: names for callable roles, operations, lifecycle stages, and Boolean predicates, in uniform per-class tables. _Read before naming or renaming a type, function, method, property, or Boolean in code._
- **[imported-terms](./imported-terms.md)** _(reference)._ Imported terms retain the meaning and grammar of their source API when UIX directly represents the external concept. _Read before using or naming a Pi, Electron, React, or browser-standard term._
- **[prose-terms](./prose-terms.md)** _(reference)._ Prose boundaries for comments and documentation: reserved domain nouns, locked meanings, and retired words. _Read before writing or reviewing wording in comments, summaries, or docs._

<!-- INDEX:END -->
