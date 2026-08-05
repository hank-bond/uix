---
summary: "A source file owns one responsibility, named after the stable responsibility it implements, and changes as one thing."
kind: reference
---

# Files express responsibility

**Rule: must.** A source file owns one responsibility. Name it after the stable responsibility it implements and keep declarations beside the behavior that gives them meaning. A responsibility is a coherent unit of behavior or state: a capability, an operation, a role, or a state boundary. A reader seeks it out as one thing, and it changes as one thing.

**Approved example:** A file whose whole responsibility one sentence of at most 30 words can state, such as `src/main/agent/driver.ts`.

**Nonconforming example:** A `utils.ts`, `helpers.ts`, `common.ts`, or `types.ts` that accumulates unrelated responsibilities.

**Reason:** Two tests decide whether a file's responsibility is clean. The expressibility test: one sentence of at most 30 words must state the file's whole high-level responsibility. The coupling test: two files that are always read or edited together are one responsibility expressed as two. File length is not a criterion. Splitting for length alone manufactures boundaries.
