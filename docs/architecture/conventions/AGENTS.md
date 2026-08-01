---
summary: "Prescriptive code rules for UIX — lifetimes, state ownership, naming, capability handles, comments, accessible UI, styles, module APIs, validation, logging, imports, and lifecycle helpers."
read_when: "Read before introducing or renaming an exported symbol, recurring architectural term, owner, lifecycle, contribution point, or capability; otherwise descend to the rule matching the code being changed."
status: active
---

# Conventions

Short, opinionated rules. Each one buys back review effort by making a class of bugs hard to write. Most are main-process specifics (lifetimes, logging, imports); **Naming** and **Comments** apply to all UIX code, including renderer, shared, and feature modules.

This directory is the prescriptive code-rule collection. Its leaves remain living architecture documents and always describe HEAD; use the summaries below to open only the rules relevant to the work in front of you.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[logging](./logging.md)** _(active)_ — Main-process logging uses component-scoped structured pino loggers with stable event identifiers, fields, levels, and error conventions. _Read before adding or changing main-process logs, event identifiers, log fields, levels, or error reporting._
- **[module-boundaries](./module-boundaries.md)** _(active)_ — Module APIs stay intentionally small, invalid values stop through explicit guards or assertions, and Node runtime dependencies remain visible as node-prefixed imports. _Read before exporting a symbol, designing a validation boundary, or introducing a Node runtime dependency._
- **[naming-and-comments](./naming-and-comments.md)** _(active)_ — UIX code expresses stable domain contracts through canonical identifier grammar and comments limited to non-obvious rationale and durable constraints. _Read before introducing or renaming symbols, recurring vocabulary, projections, predicates, or explanatory comments._
- **[registrations-and-lifetimes](./registrations-and-lifetimes.md)** _(active)_ — Cleanup-requiring behavior registers through lifecycle helpers and belongs to an explicit DisposableBag lifetime. _Read before registering callbacks, listeners, IPC, protocols, timers, or any other behavior that requires cleanup._
- **[renderer](./renderer.md)** _(active)_ — Renderer UI preserves equivalent visual, keyboard, and accessibility meaning while component styles retain explicit ownership and cascade order. _Read before creating or changing interactive UI, accessibility behavior, component stylesheets, or surface CSS composition._
- **[state-and-capabilities](./state-and-capabilities.md)** _(active)_ — Current authority, asynchronous work, cleanup, and caching remain separate while consumers receive narrowly scoped, lazily resolved capabilities instead of owners. _Read before introducing mutable or asynchronous state, caches, state owners, replacement boundaries, or scoped access to owned state._

<!-- INDEX:END -->
