---
summary: "The owner that invokes an action also issues, tracks, and honors the guards that prevent it."
kind: reference
---

# Keep guard authority with action ownership

**Rule: must.** The owner that invokes an action also issues, tracks, and honors the guards that prevent that action. Do not split guard authority and action invocation between independent owners.

**Scope:** Both guard naming forms. For `ThingGuard`, the guarded action is disposal of the named thing. For `ActionGuard`, it is the named action itself.

**Approved example:** `WorkspaceRuntime` owns reload invocation and its guard state. The Agent runtime receives only the guard-acquisition capability it needs:

```ts
using reloadGuard = acquireReloadGuard("Agent turn");
```

The workspace enforces that its private reload invocation cannot overlap a reload guard. A supervisor similarly owns both guards against child disposal and the child's teardown.

**Nonconforming example:** A separate `ReloadAdmission` owner issues guards and tracks active work, while `WorkspaceRuntime` must remember to consult it before replacing features.

**Reason:** Guard creation, tracking, enforcement, and action completion form one authority. Splitting them creates a path that can invoke the action without honoring its guards. A guard is not a permit to invoke the action, and guard disposal does not invoke it.

**Enforcement:** Architectural review checks that each guarded action has one authority for both guard acquisition and invocation.
