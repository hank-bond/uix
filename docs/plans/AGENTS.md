---
summary: "Active build specs for what's about to be built — deliverables and their units — plus a backlog of seeds not yet promoted to their own spec."
status: active
---

# Plans

Specs for things we intend to build — slugged by deliverable. A plan only needs to be **valid**, not actively worked. Shipped plans move to [`archive/`](./archive/). Plans cite the [`../decisions/`](../decisions/) they assume and the [`../design/`](../design/) thread they came from.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[backlog](./backlog.md)** _(active)_ — Short seeds for planned UIX deliverables that aren't standalone specs yet; promoted to their own file once they grow past a line.
- **[canvas-anchored-edit-channel](./canvas-anchored-edit-channel.md)** _(active)_ — Build spec for the value-first canvas anchored edit channel: the anchor pool (P0), the anchored editing core (U1), and the live bidirectional canvas channel (U2) on customTools — later units (pi refactor, FS parity, versioning) are out of scope here.
- **[persistence-and-session-foundation](./persistence-and-session-foundation.md)** _(active)_ — Build spec for persistence on pi's session file: file-backed session + history rehydration (C0) and promoting UIX-core bindings to an in-process pi extension (C1) are the foundation; versioned content store (C2), per-turn canvas pointers (C3), anchor-state continuity (C4), and tree preview/restore (C5) are specified for later.

<!-- INDEX:END -->
