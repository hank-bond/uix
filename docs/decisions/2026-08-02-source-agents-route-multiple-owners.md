---
summary: "Source AGENTS.md files route among multiple production owners; single-file units stay at their parent boundary, and colocated tests remain implicit."
kind: explanation
status: accepted
---

# Source AGENTS.md files route multiple owners

A source directory earns an `AGENTS.md` when it groups multiple production files or child ownership boundaries. The file provides routing among those owners and preserves documentation whose correctness spans more than one of them. Behavior and constraints owned by one source file remain in that file's header, JSDoc, or implementation comments.

A production file and its colocated tests do not form a multi-file ownership boundary. They stay together in the parent directory, the production file appears in the parent's generated index, and the test is found by its shared basename. Source indexes therefore exclude `*.test.*` and `*.spec.*` files.

This decision refines the source-index scope established by [`2026-08-02-code-proximate-documentation.md`](./2026-08-02-code-proximate-documentation.md). Its narrowest-owner placement remains unchanged; production ownership, rather than every authored source artifact, defines the routing tree.

**Rejected:** One `AGENTS.md` per source directory regardless of production-file count; treating tests as independent routing destinations; using directory guidance to restate behavior owned by one implementation file; and preserving single-file directories only for visual symmetry.
