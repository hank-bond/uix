---
summary: "Prescriptive UIX code rules for ownership, naming, lifetimes, modules, logging, state, accessibility, and styles."
read_when: "Read before changing exported vocabulary, ownership, lifecycles, contribution points, or capabilities. Otherwise open the matching rule directly."
---

# Conventions

Short, opinionated rules. Each one buys back review effort by making a class of bugs hard to write. Most are main-process specifics (lifetimes, logging, imports). **Source organization**, **Naming**, and **Comments** apply to all UIX code, including UI, shared, and feature modules.

This directory contains the code conventions in three kinds: rule cards with stable identifiers, the controlled lexicon of architectural vocabulary, and guidance prose. Every file is living architecture and describes HEAD. Use the summaries to open only what is relevant to the task.

The guidance, lexicon, and rule-card formats and their structural checks live in [`contributing.md`](./contributing.md). Read it before proposing a change to any conventions document.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[comments](./comments.md)** _(reference)._ Comments answer why code exists or how to use it correctly: line comments hold reasons, JSDoc explains caller integration. _Read before writing source-file summaries or explanatory comments._
- **[contributing](./contributing.md)** _(how-to)._ Authoring spec for the conventions tree: the guidance, lexicon, and rule-card formats, the admission and quality tests, and the structural checks. _Read before proposing changes to any conventions document._
- **[lexicon](./lexicon.md)** _(reference)._ The controlled lexicon assigns every UIX word one meaning and grammatical role in uniform per-class tables, with the reserve and retire governance. _Read before introducing a recurring word, reviewing wording in comments or docs, or extending the controlled lexicon._
- **[lifetimes](./lifetimes.md)** _(reference)._ Cleanup-requiring behavior uses lifecycle helpers and belongs to an explicit DisposableBag lifetime. _Read before attaching callbacks, listeners, IPC, protocols, timers, or any other behavior that requires cleanup._
- **[logging](./logging.md)** _(reference)._ Main-process logging uses component-scoped structured pino loggers with stable event identifiers, fields, levels, and error conventions. _Read before adding or changing main-process logs, event identifiers, log fields, levels, or error reporting._
- **[module-boundaries](./module-boundaries.md)** _(reference)._ Module APIs stay intentionally small, invalid values stop through explicit guards or assertions, and Node runtime dependencies remain visible as node-prefixed imports. _Read before exporting a symbol, designing a validation boundary, or introducing a Node runtime dependency._
- **[naming](./naming.md)** _(reference)._ Naming guidance beyond the rule cards: symbol roles, state-shape nouns, catalog names, and the projection-naming axes. _Read before introducing or renaming symbols, recurring vocabulary, projections, or predicates._
- **[rules/](./rules/AGENTS.md)** Rule cards are the conventions tree's normative invariants, one file per stable identifier.
- **[source-organization](./source-organization.md)** _(reference)._ Source trees expose ownership and dependency direction through responsibility-named files, deliberate entrypoints, explicit composition, and nearest-owner sharing. _Read before adding or moving source directories, introducing an index or barrel, extracting shared code, or reorganizing an implementation tree._
- **[state-and-capabilities](./state-and-capabilities.md)** _(reference)._ Current authority, asynchronous work, cleanup, and caching remain separate while consumers receive narrowly scoped, lazily resolved capabilities instead of owners. _Read before introducing mutable or asynchronous state, caches, state owners, replacement boundaries, or scoped access to owned state._
- **[user-interface](./user-interface.md)** _(reference)._ User interfaces preserve equivalent visual, keyboard, and accessibility meaning while component styles retain explicit ownership and cascade order. _Read before creating or changing interactive UI, accessibility behavior, component stylesheets, or surface CSS composition._

<!-- INDEX:END -->
