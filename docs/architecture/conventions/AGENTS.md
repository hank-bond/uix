---
summary: "Prescriptive UIX code rules for ownership, naming, lifetimes, modules, logging, state, accessibility, and styles."
read_when: "Read before changing exported vocabulary, ownership, lifecycles, contribution points, or capabilities. Otherwise open the matching rule directly."
status: active
---

# Conventions

Short, opinionated rules. Each one buys back review effort by making a class of bugs hard to write. Most are main-process specifics (lifetimes, logging, imports); **Source organization**, **Naming**, and **Comments** apply to all UIX code, including UI, shared, and feature modules.

This directory contains prescriptive code rules. Each leaf is living architecture and describes HEAD. Use the summaries to open only rules relevant to the task.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[lifetimes](./lifetimes.md)** _(active, reference)._ Cleanup-requiring behavior uses lifecycle helpers and belongs to an explicit DisposableBag lifetime. _Read before attaching callbacks, listeners, IPC, protocols, timers, or any other behavior that requires cleanup._
- **[logging](./logging.md)** _(active, reference)._ Main-process logging uses component-scoped structured pino loggers with stable event identifiers, fields, levels, and error conventions. _Read before adding or changing main-process logs, event identifiers, log fields, levels, or error reporting._
- **[module-boundaries](./module-boundaries.md)** _(active, reference)._ Module APIs stay intentionally small, invalid values stop through explicit guards or assertions, and Node runtime dependencies remain visible as node-prefixed imports. _Read before exporting a symbol, designing a validation boundary, or introducing a Node runtime dependency._
- **[naming-and-comments](./naming-and-comments.md)** _(active, reference)._ UIX code expresses stable domain contracts through canonical identifier grammar, indexable file summaries, caller-facing JSDoc, and risk-based why-comments. _Read before introducing or renaming symbols, recurring vocabulary, projections, predicates, source-file summaries, or explanatory comments._
- **[reserved-words](./reserved-words.md)** _(active, reference)._ UIX controls vocabulary by giving each word one role: keep single-meaning words, reserve domain terms, and retire overloaded words in favor of precise alternatives. _Read before introducing a recurring word, reviewing wording in comments or docs, or extending the controlled lexicon._
- **[source-organization](./source-organization.md)** _(active, reference)._ Source trees expose ownership and dependency direction through responsibility-named files, deliberate entrypoints, explicit composition, and nearest-owner sharing. _Read before adding or moving source directories, introducing an index or barrel, extracting shared code, or reorganizing an implementation tree._
- **[state-and-capabilities](./state-and-capabilities.md)** _(active, reference)._ Current authority, asynchronous work, cleanup, and caching remain separate while consumers receive narrowly scoped, lazily resolved capabilities instead of owners. _Read before introducing mutable or asynchronous state, caches, state owners, replacement boundaries, or scoped access to owned state._
- **[user-interface](./user-interface.md)** _(active, reference)._ User interfaces preserve equivalent visual, keyboard, and accessibility meaning while component styles retain explicit ownership and cascade order. _Read before creating or changing interactive UI, accessibility behavior, component stylesheets, or surface CSS composition._

<!-- INDEX:END -->
