---
summary: "Code-related documentation lives at its narrowest owning source boundary, while generated AGENTS.md indexes route agents and repository docs retain cross-boundary knowledge."
kind: explanation
status: accepted
---

# Code-proximate documentation

UIX places knowledge according to its change coupling with code. Code remains the primary description of implemented structure and behavior. Documentation records knowledge about that code: responsibility, correct usage, ownership, rationale, coordination, constraints, and external context.

One export owns its caller-facing contract JSDoc. One implementation site owns its non-obvious why-comment. One file owns a short responsibility header. One source directory owns guidance about its boundary, dependency direction, composition points, and conceptual coordination. A local Markdown leaf can join several files under that same owner. Repository-level documentation retains workflows, conventions, invariants, external context, decisions, and design history that cross source ownership boundaries.

Every authored source file carries one indexable first-line summary and may add one short file overview when its boundary needs explanation. Generated source indexes derive direct file entries from those summaries and derive child-directory entries from nested `AGENTS.md` frontmatter. Parent indexes do not flatten every descendant file. Direct code relationships remain imports. JSDoc and directory guidance identify only non-obvious conceptual relationships.

This hierarchy serves agents that need broad semantic navigation without loading the repository. The root map and nested directory summaries expose ownership boundaries. An agent descends into the matching directory, reads only relevant child summaries, follows imports for direct dependencies, and follows explicit documentation links for conceptual dependencies. The amount of nested summary context supplied at session start is a retrieval-policy choice that can change without changing the authored structure.

Diátaxis remains the need taxonomy for discrete documents. Placement comes first: find the narrowest durable owner. If the result is a discrete document, classify it as tutorial, how-to, reference, or explanation. File summaries, code comments, and routing indexes do not need a Diátaxis kind.

Source-directory routing among owners and the implicit handling of colocated tests are refined separately in [`2026-08-02-source-agents-route-multiple-owners.md`](./2026-08-02-source-agents-route-multiple-owners.md).

This decision supersedes the audience-based placement in [`2026-05-30-documentation-split.md`](./2026-05-30-documentation-split.md). Distribution can still expose selected documentation to feature authors, but whether a page ships does not determine its source location.

**Rejected:** Central prose inventories of implemented files and exports. Hand-maintained importer lists. Mandatory implementation narration. Placing all feature-facing documentation in one tree regardless of ownership. And flattening every source-file summary into the always-loaded root context.
