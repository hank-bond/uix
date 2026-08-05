---
summary: "Name each contribution stage with its approved lifecycle term, from Contribution through RegisteredX or a capability role."
kind: reference
---

# Name each contribution stage

**Rule: must.** Use the approved lifecycle term for each stage of a contribution.

**Approved example:** Use this sequence, omitting `Normalized` when no canonicalization pass is necessary and introducing `RegisteredX` only when the registry creates a separate live record:

```text
Contribution
→ NormalizedContribution
→ ResolvedContribution
→ RegisteredX (when registry acceptance adds state)
→ CatalogEntry or Projection
```

Name the value returned to the contributor by its capability, such as `Handle`, `Updater`, `Appender`, or `Disposable`. When a registry stores a resolved contribution unchanged, membership expresses liveness: keep the resolved value type and use a container name such as `#registeredTools`. Use a `RegisteredX` type when registry acceptance creates a new record with added registry-owned state, as `RegisteredAction` adds `running`.

Agent context demonstrates both outcomes in one facet:

```text
ResolvedAgentContextUpdateContribution
→ RegisteredAgentContextUpdateContribution (adds hasValue and value)

ResolvedAgentContextAppendContribution
→ RegisteredAgentContextAppendContribution (adds values and inFlight)

ResolvedAgentContextMaterializedContribution
→ registry membership (stored unchanged)
```

**Nonconforming example:** Do not use `Registration` for a registry-ready contribution, a live registered entity, or a returned capability. Do not introduce a `RegisteredX` alias, field-copy interface, or one-field wrapper solely to rename an unchanged resolved shape.

**Reason:** One term for each represented stage lets a reader identify ownership and liveness from the name without creating types that contain no new information.
