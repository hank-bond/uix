---
summary: "The local document store persists mutable current content and immutable metadata-bearing versions behind namespace and document identifiers."
status: active
---

# Document store

This directory owns the local filesystem implementation of the substrate document-store contract. Feature-facing interfaces remain under `src/api/`, and feature-specific buffers retain responsibility for canonicalization, editor semantics, and domain events.

The filesystem layout under the workspace state root is private implementation detail. Features address documents by namespace and document id, so another durable backend can replace local files without changing feature contracts.

Apply these invariants when changing this boundary:

- Keep mutable current content separate from immutable document versions.
- Derive a version id from namespace, document id, content, and caller-owned metadata; recreating the same snapshot reuses the existing version.
- Validate document ids before deriving storage paths, and accept only full hexadecimal version ids.
- Return `null` for absent current content or versions instead of exposing filesystem errors.
- Keep domain-specific normalization, caching, and invalidation outside the generic store.

## Contents

<!-- INDEX:START -->

<!-- Generated from source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[store.test.ts](./store.test.ts)** Verifies namespaced current content, immutable metadata-bearing versions, and document-id validation in the local store.
- **[store.ts](./store.ts)** Persists mutable document content and immutable metadata-bearing versions behind namespace and document identifiers.

<!-- INDEX:END -->
