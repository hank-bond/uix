---
summary: "Backend channel contributions inherit producer scope, while surfaces declare and validate each consumed namespace against the live registry projection."
kind: reference
status: accepted
implementation: conforming
---

# Feature channels

## Contract

A feature channel groups typed request operations and backend-published events. Backend and browser code share one schema-only contract. UIX installs handlers and publishers under the producer's trusted feature scope, while a mounted surface receives typed clients derived from the same contract.

A surface declares a map from every consumed provider namespace to its shared contract. The map may include its owning feature, another feature, or the substrate. UIX accepts each entry only while the backend channel registry includes that namespace in its live projection.

## Boundary

Feature channels provide private vertical communication between a feature's backend and browser surfaces. They also support direct provider-owned imports for tightly coupled features. They do not provide public protocol identity, provider discovery or selection, permissions, or implementation-independent cross-feature capabilities. Those concerns belong to public capability protocols.

Agent-scoped channel dispatch additionally depends on [connection-agent attachments](./connection-agent-attachments.md) for accepted Agent selection and operation lifetime.

## Requirements

### Contracts and scope

- A channel contract **must** contain request and event schemas but no feature, workspace, session, attachment, or transport identity.
- UIX **must** derive backend channel scope from the feature whose Workspace or Agent factory contributes the contract or handlers.
- A feature contribution **must not** register handlers or publish events under another feature's scope.
- Substrate-owned channels **must** use reserved scopes while following the same contract, validation, and client model as feature channels.
- A feature **may** split its channel vocabulary across multiple contracts. All such contracts share the feature's canonical scope.
- Request and event names **must** be unique within one canonical feature scope. Duplicate registration **must** fail without leaving a partial contribution active.
- Identical local names in different feature scopes **must not** collide.

### Requests and events

- Every request descriptor **must** declare TypeBox request and response schemas.
- UIX **must** validate a request before invoking its handler and validate the returned value before completing the request.
- An Agent-scoped request **must** invoke the handler from the Agent guard retained when dispatch was accepted. Retargeting must not move accepted work.
- Every event descriptor **must** declare a TypeBox event schema.
- A feature-bound publisher **must** canonicalize events only within the scope UIX granted it.
- A browser client **must** validate received event payloads before invoking a feature callback.
- Contract logging policy may summarize sensitive payloads without changing validation or routing semantics.

### Browser binding and direct imports

- A mounted surface **must** declare each consumed channel contract under its provider namespace.
- Each namespace key **must** also identify the corresponding typed client passed to the surface renderer.
- A surface **may** consume contracts from its own feature, other features, and reserved substrate providers in the same declaration.
- Selecting a frontend namespace grants no handler-registration or event-publication authority in that scope.
- The backend channel registry **must** own the live set of namespaces backed by admitted contracts, independently of the surface registry.
- UIX **must** expose a read-only projection of those registered namespaces to the frontend as part of the accepted workspace composition.
- The namespace projection **must not** infer availability from active feature names or surface contributions.
- Before rendering a mounted feature, UIX **must** verify that every declared namespace appears in that accepted projection.
- A missing namespace **must** fail visibly during client binding. It must not leave an event subscription silently waiting on a provider that is not active.
- Built-in provider namespaces such as `agent` and `uix` participate in the same availability check.
- Feature reload **must** replace the accepted namespace projection and cause mounted consumers to rebind or revalidate their channel clients.

## Conformance

A conforming implementation demonstrates these outcomes:

1. Two features declare the same local request name and receive distinct canonical channel IDs derived from their producer scopes.
2. A contract and handler contribution contain no authored owner identity, yet registration and publication remain confined to the active feature.
3. A surface declares own-feature and provider-owned contracts together under explicit namespace keys and receives a typed client for each key.
4. A namespace declaration affects only frontend consumption and cannot redirect backend contribution or publication authority.
5. An event-only backend contract appears in the namespace projection for exactly its registration lifetime, even when its feature contributes no surface.
6. A mounted feature that names a missing or renamed provider fails during client binding rather than creating an inert subscription.
7. Invalid requests, responses, and events are rejected at their respective runtime boundaries.
8. Duplicate local members roll back atomically, and reload replaces the available namespace projection with the newly accepted composition.

## Degrees of freedom

A conforming implementation may choose the surface declaration shape, canonical ID encoding, namespace projection transport, registry data structures, and browser framework adapters. These choices must preserve substrate-owned backend scope, explicit frontend targets, availability validation, typed payload validation, and lifecycle replacement.
