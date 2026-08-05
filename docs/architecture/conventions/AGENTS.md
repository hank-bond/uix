---
summary: "Prescriptive UIX code rules for ownership, naming, lifetimes, modules, logging, state, accessibility, and styles."
read_when: "Read before changing exported vocabulary, ownership, lifecycles, contribution points, or capabilities. Otherwise open the matching rule directly."
---

# Conventions

Short, opinionated rules. Each one buys back review effort by making a class of bugs hard to write. Most are main-process specifics (lifetimes, logging, imports). **Source organization**, **Naming**, and **Comments** apply to all UIX code, including UI, shared, and feature modules.

This directory contains the code conventions in three kinds: rule cards with stable identifiers, the controlled lexicon of architectural vocabulary, and guidance prose. Every file is living architecture and describes HEAD. Use the summaries to open only what is relevant to the task.

Rule cards follow the authoring spec in [`rules/AGENTS.md`](./rules/AGENTS.md). The guidance and lexicon formats follow below.

## Guidance

Everything in this tree that is not a rule or a lexicon entry is **guidance**. Guidance covers rationale, patterns, and preferences that a model applies with judgment. Guidance files sit in this directory next to the `rules/` directory and `lexicon.md`.

Guidance is organized, not parsed. Each guidance file uses `##` sections per subtopic with sentence-case noun headings. Each section opens with one plain claim sentence, then freehand prose explains it. Guidance carries no rule machinery: no rule cards, no identifier fields, and no bold normative keywords. Ordinary `should` in explanatory prose is fine. The bold keyword form marks normativity and belongs only in rules.

A guidance claim that is really an invariant promotes to a rule card. The claim sentence becomes the Rule, and the surrounding prose splits into Reason and examples. A rule that is really a preference demotes the same way.

## Controlled lexicon

The controlled lexicon lives in one file, `lexicon.md`. It controls architectural vocabulary: the identifier grammar that code authors apply and the prose words that review enforces. This section governs changing that lexicon.

The file is organized as sections, one per term class. Each section is a short elaboration followed by one table, and every table shares one column format:

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `Handler` | noun | Callable that processes one occurrence. Use `Handle` for a consumer-held capability. | `ChannelRequestHandler` | `ChannelTransportHandle` |

The approved meaning defines the term's permitted boundary. The alternatives identify the approved term for a meaning that this term does not cover. The nonconforming example shows a plausible use that violates the boundary. It is not an example of generally poor code.

### Lexicon row requirements

**Term and part of speech:** Give the exact approved spelling in the Term cell. Give one part of speech from `noun`, `verb`, `adjective`, `preposition`, `modal verb`, or `auxiliary verb` in its own cell. An imported term appends its provenance to the part of speech, as in `noun (ECMAScript)`. Give each word form and each approved meaning its own row. Sort terms alphabetically within their section.

**Approved meaning and alternatives:** Start with a positive boundary definition. State the property that distinguishes the term from its nearest alternatives, and name those alternatives explicitly. Do not define the term through a current implementation or file location. Do not name an undefined alternative. Admit it in the same change or link to its existing entry.

**Approved example:** Use the smallest realistic example that demonstrates the distinguishing property. Prefer an existing UIX identifier or a planned replacement from an active migration. Show a call site when the identifier alone does not demonstrate the meaning. Do not add unrelated details.

**Nonconforming example:** Show a plausible mistake that a competent author might make. Change only the semantic axis that the entry defines when practical. State the approved replacement when it is not obvious. Do not use a strawman, malformed syntax, generally poor code, or only the reverse spelling of the approved example.

Before admitting a row, apply these quality tests:

1. **Choice:** Can a reviewer choose between this term and its nearest alternative?
2. **Role:** Does the term have one grammatical role?
3. **Boundary:** Does the nonconforming example cross the exact boundary described?
4. **Plausibility:** Could this mistake reasonably appear in UIX?
5. **Replacement:** Is the compliant replacement evident?
6. **Independence:** Does the definition survive an implementation change?
7. **Completeness:** Are all named alternatives already defined?
8. **Orthogonality:** For an operation/result pair, does the verb identify the transition independently from the noun's result role? Does the noun identify the result independently from the verb?
9. **Leverage:** Does the term collapse a real recurring choice across contexts instead of restating a result type, downstream use, or local implementation detail?

If a row cannot provide a strong nonconforming example, its boundary is not settled or the term does not yet need controlled-lexicon status.

Maintain these sections, in this order:

- **UIX-owned role terms**, **UIX-owned lifecycle terms**, **UIX-owned operation terms**, and **UIX-owned predicate terms** hold code vocabulary that UIX owns. Each has one approved meaning and grammatical role.
- **Imported terms** retain the meaning and grammar of the named source API, such as Pi, Electron, React, or a browser standard.
- **Reserved terms** are domain nouns that own their word. Verb uses of the same spelling are nonconforming.
- **Retired terms** identify the approved replacement and remain only while they help review or automated checks prevent regression.
- **Locked meanings** state prose-usage boundaries for terms that also hold a UIX-owned row. The locked row keeps only the boundary and prose examples, and links the UIX-owned row, which keeps the meaning and code examples.

A term appears once within its section. A term that needs both a UIX-owned row and a locked row appears in both sections with different content.

Add a UIX-owned term when it first becomes exported, architectural, or recurrent. Add it in the same change that introduces that use. Do not add every local implementation word. If the term's boundary cannot be stated with an approved and a nonconforming example, continue the design work before admitting the term.

Do not preserve a retired alias in code only because it remains in the lexicon. The retired entry supports migration and review. It does not provide compatibility.

## Structural validation

The conventions formats stay structurally checkable. The checks cover shape, not judgment:

- A lexicon term appears once within its section, the sections and part-of-speech values use the approved sets, and every table follows the shared columns.
- Links into `rules/` and `lexicon.md` resolve to existing files.

Everything else is authorial. The checks never enforce example quality, boundary judgment, or meaning.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[comments](./comments.md)** _(reference)._ Comments answer why code exists or how to use it correctly: line comments carry reasons, JSDoc carries caller integration. _Read before writing source-file summaries or explanatory comments._
- **[lexicon](./lexicon.md)** _(reference)._ The controlled lexicon assigns every UIX word one meaning and grammatical role in uniform per-class tables, with the reserve and retire governance. _Read before introducing a recurring word, reviewing wording in comments or docs, or extending the controlled lexicon._
- **[lifetimes](./lifetimes.md)** _(reference)._ Cleanup-requiring behavior uses lifecycle helpers and belongs to an explicit DisposableBag lifetime. _Read before attaching callbacks, listeners, IPC, protocols, timers, or any other behavior that requires cleanup._
- **[logging](./logging.md)** _(reference)._ Main-process logging uses component-scoped structured pino loggers with stable event identifiers, fields, levels, and error conventions. _Read before adding or changing main-process logs, event identifiers, log fields, levels, or error reporting._
- **[module-boundaries](./module-boundaries.md)** _(reference)._ Module APIs stay intentionally small, invalid values stop through explicit guards or assertions, and Node runtime dependencies remain visible as node-prefixed imports. _Read before exporting a symbol, designing a validation boundary, or introducing a Node runtime dependency._
- **[naming](./naming.md)** _(reference)._ Naming guidance beyond the rule cards: symbol roles, state-shape nouns, catalog names, and the projection-naming axes. _Read before introducing or renaming symbols, recurring vocabulary, projections, or predicates._
- **[rules/](./rules/AGENTS.md)** Rule cards are the conventions tree's normative invariants, one file per stable identifier, with the card format and its structural checks.
- **[source-organization](./source-organization.md)** _(reference)._ Source trees expose ownership and dependency direction through responsibility-named files, deliberate entrypoints, explicit composition, and nearest-owner sharing. _Read before adding or moving source directories, introducing an index or barrel, extracting shared code, or reorganizing an implementation tree._
- **[state-and-capabilities](./state-and-capabilities.md)** _(reference)._ Current authority, asynchronous work, cleanup, and caching remain separate while consumers receive narrowly scoped, lazily resolved capabilities instead of owners. _Read before introducing mutable or asynchronous state, caches, state owners, replacement boundaries, or scoped access to owned state._
- **[user-interface](./user-interface.md)** _(reference)._ User interfaces preserve equivalent visual, keyboard, and accessibility meaning while component styles retain explicit ownership and cascade order. _Read before creating or changing interactive UI, accessibility behavior, component stylesheets, or surface CSS composition._

<!-- INDEX:END -->
