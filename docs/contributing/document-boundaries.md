---
summary: "Documents are conceptually coherent, human-reviewable maintenance units, while one task may assemble several documents into its retrieval and review set."
kind: how-to
read_when: "Read before creating, splitting, merging, or substantially expanding a document."
---

# Document boundaries

A document is a maintenance unit. Its boundary must make conceptual sense, and a human reviewer must be able to judge its coherence, completeness, and internal consistency.

A task's _retrieval set_ is the group of documents needed to perform that task. A retrieval set may contain several maintenance units. Two documents may remain separate even when agents routinely read them together.

## Choose a coherent unit

Evaluate a candidate document or section on these axes:

- **Thesis:** Can one sentence state the document's central claim or purpose?
- **Conceptual scope:** Do all sections answer the same question or govern the same kind of decision?
- **Ownership:** Does one durable boundary own the information?
- **Human reviewability:** Can a reviewer hold enough of the document in mind to detect gaps, contradictions, and drift?
- **Change coupling:** Do the claims normally change for the same reason?
- **Dependencies:** Which other documents must a reader consult to apply the claims correctly?

Keep content together when separating it would divide one explanation, procedure, or invariant into fragments that cannot be judged independently. Split content when it contains separable concepts, carries unrelated change triggers, needs an enumerated frontmatter summary, or has become too broad for reliable human review.

Document length is evidence, not an automatic threshold. A short document may own an independent concept, and a long document may remain coherent. Human difficulty maintaining a high-quality account is itself a sufficient split signal even when every resulting document belongs to the same retrieval set.

## Separate maintenance from retrieval

Do not merge documents solely to save file reads or context-loading steps. Generated indexes and explicit links assemble related documents when an agent needs them. A dedicated review process may load a whole documentation tree regardless of its file boundaries.

When a split creates a load-bearing dependency, preserve one authoritative home for each claim and make the relationship explicit. The narrowest common `AGENTS.md` owns cross-document coordination that cannot be inferred from the documents' summaries and links.

## Apply the boundary test

Use the frontmatter as one boundary test. A good leaf has one summary that states its thesis and, when needed, one clear external trigger. A summary that must enumerate unrelated claims or a trigger that must list unrelated activities indicates a boundary problem.

Before splitting a document:

1. State the responsibility of each proposed unit.
2. Assign every existing claim to one authoritative unit.
3. Preserve necessary context without copying the same rule into several files.
4. Add direct links for conceptual dependencies.
5. Regenerate the parent index and check whether the sibling summaries express a clear division of responsibility.

Merge documents when their claimed boundaries are artificial, not merely because readers often consume them together.
