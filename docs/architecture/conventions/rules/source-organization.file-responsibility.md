---
summary: "A source file owns one responsibility, named after the stable responsibility it implements, and changes as one thing."
kind: reference
---

# Files express responsibility

**Rule: must.** A source file owns one responsibility. Name its basename for that stable responsibility: the owned domain noun plus any role or operation needed to distinguish it within the owning directory. A modifier, lifecycle state, or current caller is not a complete responsibility name. Keep declarations beside the behavior that gives them meaning. A responsibility is a coherent unit of behavior or state: a capability, an operation, a role, or a state boundary. A reader seeks it out as one thing, and it changes as one thing.

**Approved example:** `pending-user-identity.ts` names the entity and identity responsibility shared by pending-row creation, reconciliation, and presentation. A short primary name such as `workspace.ts` remains complete when its directory provides the domain and siblings cannot be confused with it.

**Nonconforming example:** `pending.ts` names only a lifecycle state, so a reader cannot tell what is pending or what the file owns. A `utils.ts`, `helpers.ts`, `common.ts`, or `types.ts` that accumulates unrelated responsibilities also has no stable responsibility name.

**Reason:** Three tests decide whether a file's responsibility is clean. The filename test: its basename plus owning directory lets a reader predict why they would open it and distinguish it from siblings. A source summary cannot repair a vague basename. The expressibility test: one sentence of at most 30 words must state the file's whole high-level responsibility. The coupling test: two files that are always read or edited together are one responsibility expressed as two. File length is not a criterion. Splitting for length alone manufactures boundaries.
