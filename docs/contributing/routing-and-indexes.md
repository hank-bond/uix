---
summary: "AGENTS.md files combine owned directory guidance with generated child indexes, while one checked generator maintains documentation and source routes."
kind: how-to
read_when: "Read before adding or changing an AGENTS.md file, generated index, source summary route, or tree-level authoring spec."
---

# Routing and indexes

Every `AGENTS.md` combines handwritten directory guidance with one generated index. The guidance owns relationships, sequencing, shared invariants, composition, and dependency direction across its immediate children. The index is the sole directory-level description of those children.

Do not repeat or paraphrase child summaries in handwritten guidance. A parent does not flatten the contents of a real child ownership boundary.

## Source routing

A source directory earns an `AGENTS.md` when it groups multiple production files or child ownership boundaries. Do not create a source directory or `AGENTS.md` for one production file plus its tests. Keep that unit in its parent.

A source index lists direct production files, local Markdown leaves, and immediate child `AGENTS.md` summaries. It excludes colocated `*.test.*` and `*.spec.*` files because agents find tests by the production file's basename. The [`comments.md`](../architecture/conventions/comments.md) convention owns the indexed source-summary format, and [`source-organization.md`](../architecture/conventions/source-organization.md) owns the production boundaries.

## Documentation routing

Documentation indexes derive leaf entries from frontmatter and child-directory entries from nested `AGENTS.md` frontmatter. Container indexes include immediate child directories and top-level documents.

The root [`AGENTS.md`](../../AGENTS.md) orients the project and routes to directory indexes. Each lower index adds only the guidance owned at that level. Parent indexes expose child summaries without recursively copying descendant entries.

`README.md` files serve public GitHub-facing documentation. The tooling excludes them from agent indexes and documentation validation.

## Tree-level authoring specs

`contributing.md` is reserved for the authoring spec of one nested documentation level. A tree-level instance, such as [`contributing.md`](../architecture/conventions/contributing.md), holds the formats, admission tests, and structural checks for that tree. The repository-wide practice lives in this contribution subtree. Do not use the reserved name for a content document.

Tree-specific authoring specs remain with the trees that they govern. They refine the repository-wide practice rather than duplicating it.

## Generate and verify indexes

The index sits between `<!-- INDEX:START -->` and `<!-- INDEX:END -->`. [`docs-index.mjs`](../../scripts/docs-index.mjs) derives documentation entries from frontmatter and source entries from first-line summaries. It covers the configured documentation containers and layers plus supported source roots.

Add, move, or edit an indexed artifact, then run:

```sh
npm run docs:index     # regenerate the index blocks
npm run docs:check     # fail on stale indexes, malformed docs, or broken links
```

The check requires frontmatter and one H1 in living documentation Markdown files except `README.md`. It validates relative links, lifecycle values, `kind` tags, source ownership boundaries, and generated index freshness. Archived plans retain their historical body shape.

Prose outside the markers is authored. The block between them is derived. **Never hand-edit it.** The generator overwrites a manual edit, or the freshness check rejects it. To change an entry, edit the source summary or the document's `summary`, `read_when`, `kind`, or `status`, then regenerate the indexes.
