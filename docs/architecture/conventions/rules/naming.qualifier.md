---
summary: "Omit a prepositional qualifier that only repeats the receiver or parameter role."
kind: reference
---

# Add only result-determining qualifiers

**Rule: should.** Omit a prepositional qualifier that only repeats the receiver or parameter role.

**Approved example:** Use `cell.restore(state)`.

**Nonconforming example:** Do not use `cell.restoreFromState(state)` when state is the only accepted source.

**Exceptions:** Add a qualifier when its source identifies a materially different operation:

```ts
cell.restoreFromSnapshot(snapshot);
cell.restoreFromVersion(versionId);
```
