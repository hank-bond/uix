---
summary: "Living architecture records for implemented subsystem shape, code conventions, design principles, and open questions at HEAD."
---

# Architecture

Living docs for the current state of UIX: what exists, how subsystems fit together, code conventions, and unresolved architecture questions. Read here when changing host internals or checking the architecture-of-record.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[concepts](./concepts.md)** _(reference)._ Canonical UIX vocabulary for feature lifecycles, contributions, state roles, runtime coordination, and boundaries from Pi terminology.
- **[conventions/](./conventions/AGENTS.md)** Prescriptive UIX code rules for ownership, naming, lifetimes, modules, logging, state, accessibility, and styles. _Read before changing exported vocabulary, ownership, lifecycles, contribution points, or capabilities. Otherwise open the matching rule directly._
- **[current-state](./current-state.md)** _(reference)._ Architecture record for the implemented UIX shell, feature runtime, workspace renderer, state services, agent integration, and first-party features.
- **[human-paced-implementation](./human-paced-implementation.md)** _(how-to)._ UIX implementation sessions align on design, build one small complete chunk, explain it, and wait for human approval before continuing. _Read before multi-step work whose design and implementation are evolving with a human._
- **[open-questions](./open-questions.md)** _(reference)._ Parking lot for named but unresolved questions across the UIX substrate, documentation, and future apps.
- **[principles](./principles.md)** _(reference)._ Design principles guide planning and review when shaping UIX features, state ownership, rollback, defaults, and public APIs.

<!-- INDEX:END -->
