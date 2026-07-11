---
summary: "Architecture-of-record for the cockpit as it currently is — living docs that always track HEAD: subsystem shape, code conventions, and open questions."
status: active
---

# Architecture

Living docs for the current state of UIX: what is built, how subsystems are shaped, code conventions, and unresolved architecture questions. Read here when changing cockpit internals or checking the architecture-of-record.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[concepts](./concepts.md)** _(active)_ — Canonical UIX concept vocabulary: feature, facet, installer, driver, hook, contribution point, contribution, capability handle, registry, store, buffer, coordinator, assembler, reload reconciliation, and agent-context-local terms, with boundaries from pi extension vocabulary.
- **[conventions](./conventions.md)** _(active)_ — Code conventions for the cockpit — lifetimes, naming, capability handles, comments, accessible UI, module exports, validation, logging, imports, and lifecycle helpers.
- **[current-state](./current-state.md)** _(active)_ — Architecture-of-record for what is currently built in UIX and what is in flight.
- **[human-paced-implementation](./human-paced-implementation.md)** _(active)_ — Working mode for UIX implementation sessions: align on design first, split work into the smallest meaningful buildable chunks, and review each chunk for human understanding and explicit cosign before moving on. _Read before making multi-step UIX changes with a human in the loop, especially when design and implementation are evolving together._
- **[open-questions](./open-questions.md)** _(active)_ — Parking lot for named but unresolved questions across the UIX substrate, documentation, and future apps.
- **[principles](./principles.md)** _(active)_ — Design principles that guide planning and review — the rules we reach for when deciding how to shape a feature or API.

<!-- INDEX:END -->
