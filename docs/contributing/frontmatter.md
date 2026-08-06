---
summary: "Documentation frontmatter exposes each leaf's thesis, reader need, optional retrieval trigger, and exceptional lifecycle state without repeating its path context."
kind: reference
read_when: "Read before adding or changing documentation frontmatter, summaries, kinds, triggers, or lifecycle states."
---

# Frontmatter

The filename holds the slug and, for decisions, the date. The directory holds the documentation layer. Frontmatter adds only the information that position cannot provide:

```yaml
---
summary: "What this document establishes: its thesis, not its topic."
kind: reference | explanation | how-to | tutorial
read_when: "Read before {ACTIVITY} when the trigger is not obvious from the summary." # optional
status: accepted | exploring | resolved | landed | archived | stub | superseded # optional override
---
```

Do not duplicate information that is already in the reader's context. The slug appears in the link, the category appears in the directory, and the summary sits next to `read_when` in an index.

## Fields

**`summary` (required):** The document's recall surface. It states the thesis rather than naming the topic. Optimize for first-read understanding rather than maximum compression. Prefer concrete actors and actions over stacked modifiers or abstract nouns. Use enough plain language to make the sentence readable without opening the document, and retain specialized terms only when they preserve an important distinction.

Make each summary distinct from its siblings and findable by concept. Interchangeable sibling summaries indicate a boundary problem. A summary that must enumerate unrelated claims is a split signal.

Summary length follows the number of independently addressable claims, not body length. A long single-thesis decision still gets one short summary. A multi-unit plan can enumerate its units. Spend words only on additional retrieval hooks.

**`kind` (required on indexed documentation leaves except plans):** The Diátaxis reader need: `reference`, `explanation`, `how-to`, or `tutorial`. Plans have no kind. File summaries, code comments, routing indexes, and each `AGENTS.md` also have no kind.

**`read_when` (optional):** An external task trigger that adds retrieval precision. Author it only when the summary does not reveal why to open the document. Useful triggers include:

- A cross-vocabulary trigger when the task uses words that the thesis does not.
- A preventive trigger before an activity that the document constrains.
- A counterintuitive trigger when the document rejects an obvious path.

Omit a trigger that only restates the subject. Use ordinary inline links for conceptual relationships rather than encoding document dependencies in frontmatter.

**`status` (optional):** A lifecycle position that differs from the default current state. Author it only on lifecycle layers. Decisions use `accepted`, `superseded`, or `archived`. Design threads use `exploring` or `resolved`. Plans use `stub`, `landed`, or `archived`. Documents without a lifecycle, including each `AGENTS.md` and evergreen leaves, omit it.

## Layer summaries

Each layer's summary answers a different question:

- Decisions state the conclusion.
- Design threads state the open question and its axes.
- Architecture states an invariant or context that remains necessary at HEAD and is not obvious from source.
- Plans state the deliverable and its units.
- A source-local leaf states one owning directory's multi-file context.
- A repository leaf states a cross-boundary reader need.

The shared template within a layer forces siblings to differ by subject. Different templates keep one subject's decision, design thread, constraint, and plan distinct by role.

## Scope and mutability

This format applies to every repository-owned documentation Markdown file, including each `AGENTS.md`. The routing rules exclude `README.md` files from documentation indexing and validation because those files serve public GitHub-facing documentation.

Decisions freeze their frontmatter and prose at acceptance. Only `status` may change. Link destinations may change when files move so references continue to resolve. Living documents stay current.
