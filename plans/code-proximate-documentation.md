---
summary: "Establish code-proximate agent documentation in four units: placement and comment rules, generated source indexes, one representative source-boundary migration, then ongoing ownership-based migration without duplicate prose inventories."
status: active
---

# Code-proximate documentation

Implement [`2026-08-02-code-proximate-documentation.md`](../docs/decisions/2026-08-02-code-proximate-documentation.md) without creating a partially hand-maintained source map.

## Unit one: Authoring rules

Align the documentation framework, contributing guidance, code-comment convention, and style guide around the narrowest-owner placement test.

Define the source-file header as one required summary sentence followed by at most one elaboration paragraph. Define caller-facing JSDoc, implementation why-comments, directory guidance, local Markdown leaves, and repository-level documents as separate scopes. Apply Diátaxis only after information earns a discrete document.

## Unit two: Generated source indexes

Extend the documentation tooling to generate source-directory indexes from first-line production-file summaries, local Markdown frontmatter, and immediate child `AGENTS.md` summaries.

Define included source kinds, exclusions for tests, generated, or vendored content, summary validation, generated-block shape, and stale-index checks. A source directory and `AGENTS.md` must route among multiple production owners; one production file and its tests remain at the parent boundary. Parent indexes must not recursively flatten real descendant ownership boundaries.

## Unit three: Representative migration

Migrate one coherent multi-file source ownership boundary together with the generator. Add its production-file headers and `AGENTS.md`, move caller-facing contracts into JSDoc, preserve cross-file coordination in directory guidance or a local leaf, and remove duplicate descriptive prose only after preserving non-obvious knowledge.

Use the migration to confirm that each summary distinguishes siblings and that conceptual relationships remain discoverable without maintaining reverse-import prose.

## Ongoing migration

Migrate remaining ownership boundaries during ordinary repository work. For each boundary, preserve rationale, external constraints, failure history, invariants, and workflows before deleting face-value implementation descriptions.

Reconsider the existing `src/docs/` pages individually: move direct API facts to source contracts, local subsystem knowledge to its owner, and cross-boundary workflows or context to repository documentation. Do not preserve the old location solely for compatibility.
