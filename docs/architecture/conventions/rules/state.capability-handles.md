---
summary: "Consumers receive scoped capability handles minted by the owner, never the owner itself."
kind: reference
---

# Hand out scoped capabilities, not owners

**Rule: must.** State lives in one central owner, such as a store or registry. Consumers never receive the owner itself. They receive a handle containing operations over one bound slice. The owner mints handles through a method such as `forX(id)`. Handle methods need no addressing parameter because the closure already selected the target.

**Approved example:**

```ts
// registry mints a scope-bound settings handle: get(key), not get(scopeId, key)
const settings = registry.forScope(featureId);

// store mints a location: two methods over one tree position, path pre-bound
const location = manifest.settingsNamespace("agent");
```

**Nonconforming example:** Pass the whole registry to a consumer that only needs one scope's settings.

**Reason:** Handles hide by construction rather than enforcement. Code holding only `get(key)` cannot accidentally couple to another owner's slice. A module's reach remains visible from the handles in its context. Only the handle crosses the boundary, so later process separation becomes a transport swap instead of a redesign.
