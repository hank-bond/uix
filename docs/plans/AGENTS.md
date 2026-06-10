---
summary: "Active build specs for what's about to be built — deliverables and their units — plus a backlog of seeds not yet promoted to their own spec."
status: active
---

# Plans

Specs for things we intend to build — slugged by deliverable. A plan only needs to be **valid**, not actively worked. Shipped plans move to [`archive/`](./archive/). Plans cite the [`../decisions/`](../decisions/) they assume and the [`../design/`](../design/) thread they came from.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[backlog](./backlog.md)** _(active)_ — Compact seeds for planned UIX deliverables that need enough context to be actionable but aren't standalone specs yet.
- **[canvas-anchored-edit-channel](./canvas-anchored-edit-channel.md)** _(active)_ — Build spec for the value-first canvas anchored edit channel: the anchor pool (P0), the anchored editing core (U1), and the live bidirectional canvas channel (U2) on customTools — later units (pi refactor, FS parity, versioning) are out of scope here.
- **[durable-transcript-identity](./durable-transcript-identity.md)** _(active)_ — Build keyed-on-persist transcript identity: main observes pi session appends (D0), items go pre-key→keyed with one in-place rekey and born-keyed tool rows (D1), durable block state rides uix.* custom entries written by main with pre-key effects queued (D2), and one branch-walk rehydrator joins state for replay and every uix.* consumer (D3).
- **[persistence-and-session-foundation](./persistence-and-session-foundation.md)** _(active)_ — Build spec for persistence on pi's session file: file-backed session + history rehydration (C0) and promoting UIX-core bindings to an in-process pi extension (C1) are landed foundation; versioned content store with anchor state in commit meta (C2), submit-boundary entries — turn-state pointers, the agent-visible human canvas diff, change-only pane visibility (C3), anchor rehydration from version meta (C4), and tree preview/restore (C5) are specified for later.

<!-- INDEX:END -->
