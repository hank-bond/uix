---
summary: "The code-proximate migration has landed: every centralized src/docs/ page split into user-implementation how-tos or code-adjacent facts. How-to placement and examples remain future work."
status: active
---

# Code-proximate documentation

Implement [`2026-08-02-code-proximate-documentation.md`](../../docs/decisions/2026-08-02-code-proximate-documentation.md) without creating a partially hand-maintained source map.

## Unit one: Authoring rules · **landed 2026-08-02**

Align the documentation framework, contributing guidance, code-comment convention, and style guide around the narrowest-owner placement test.

Define the source-file header as one required summary sentence followed by at most one elaboration paragraph. Define caller-facing JSDoc, implementation why-comments, directory guidance, local Markdown leaves, and repository-level documents as separate scopes. Apply Diátaxis only after information earns a discrete document.

_Landed: the placement test, source-file header model, and controlled vocabulary are enforced in `docs/architecture/conventions/{naming-and-comments,source-organization,reserved-words}.md`, and `vocabulary:check` runs Vale across the repo. The repository-wide header migration shipped as [`file-summary-migration`](./file-summary-migration.md)._

## Unit two: Generated source indexes · **landed 2026-08-02**

Extend the documentation tooling to generate source-directory indexes from first-line production-file summaries, local Markdown frontmatter, and immediate child `AGENTS.md` summaries.

Define included source kinds, exclusions for tests, generated, or vendored content, summary validation, generated-block shape, and stale-index checks. A source directory and `AGENTS.md` must route among multiple production owners; one production file and its tests remain at the parent boundary. Parent indexes must not recursively flatten real descendant ownership boundaries.

_Landed: `scripts/docs-index.mjs` discovers source roots, derives file entries from first-line summaries, local Markdown entries from frontmatter, and child-directory entries from nested `AGENTS.md` frontmatter; it enforces the multi-owner boundary rule and fails `npm run docs:check` on stale indexes. Every source ownership boundary carries a generated index._

## Unit three: Representative migration · **landed 2026-08-03**

Migrate one coherent multi-file source ownership boundary together with the generator. Add its production-file headers and `AGENTS.md`, move caller-facing contracts into JSDoc, preserve cross-file coordination in directory guidance or a local leaf, and remove duplicate descriptive prose only after preserving non-obvious knowledge.

Use the migration to confirm that each summary distinguishes siblings and that conceptual relationships remain discoverable without maintaining reverse-import prose.

_Landed: the `src/main` and `src/renderer` boundaries migrated together with the generator (`3302d24 refactor: align source docs with ownership boundaries`), producing the current source `AGENTS.md` routing files._

## Ongoing migration: split every src/docs/ page · **landed 2026-08-04**

The goal is to migrate: split every page in `src/docs/` into exactly one of two destinations, while continuing to migrate remaining ownership boundaries during ordinary repository work. Where the how-tos finally rest is deferred until the split completes.

- **How-to** — task-shaped content for builders and their agents implementing UIX applications ("what do I need to know to implement my app"). The four `add-a-*` guides (`add-a-feature`, `add-a-channel`, `add-a-resource`, `add-a-surface`) are the target shape: task sections of the reference pages fold into them or earn a new guide.
- **Code** — fact-shaped content: contract JSDoc in `src/api`, source headers, owner `AGENTS.md` guidance, and conventions. Where JSDoc and generated indexes already carry the fact, migrating means deleting the duplicate prose.

Reconsider each existing `src/docs/` page individually against these buckets. Preserve rationale, external constraints, failure history, invariants, and workflows before deleting face-value implementation descriptions. Do not preserve the old location solely for compatibility.

When the last page moves or is deleted, remove the transitional "shipped reference" route and its "Update when" note from `docs/AGENTS.md` and `docs/style-guide.md`, and update `docs/architecture/current-state.md`'s reference to the shipped reference.

_Landed: all 13 reference pages split into the six how-tos (`add-a-feature`, `add-a-channel`, `add-a-resource`, `add-a-surface`, `add-an-action`, `add-settings-to-a-feature`) or code-adjacent facts at their owners. The transitional route and both "Update when" notes are removed, and `current-state.md` now points at the how-to tree. Where the how-tos finally rest is deferred to [`backlog.md`](../backlog.md)._
