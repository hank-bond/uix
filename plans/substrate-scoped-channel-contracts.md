---
summary: "Move backend channel ownership into substrate-established feature scope, while surfaces declare every consumed namespace in one validated client map."
---

# Substrate-scoped channel contracts

This plan implements the [feature channels specification](../docs/specs/feature-channels.md).

## Goal

Channel contracts should describe requests and events, not claim their own feature identity. UIX already knows the active feature when it installs Workspace and Agent contributions. The surface host also knows which feature contributed each mounted surface.

Use those trusted scopes to derive backend canonical channel ids. A surface declares every consumed namespace as the key of its channel-contract map, regardless of whether the provider is itself, another feature, or the substrate. Keep existing wire ids such as `canvas.writeback`, `agent.prompt`, and `uix.surfaces` unchanged.

This migration establishes the ownership pattern that Agent-bound feature web contracts will follow.

## Delivered implementation

- `ChannelContract` contains only local request and event vocabulary.
- Workspace and Agent contribution installation derive backend namespaces from the active feature id.
- Feature event publishers derive their namespace from the factory context UIX creates.
- The channel registry owns a reference-counted catalog of live namespaces and projects it with the accepted surface composition.
- Surfaces declare every consumed namespace in one contract map and receive a matching typed client map.
- Chat consumes `agentChannels`. Canvas consumes both `canvasChannels` and `agentChannels`.

## Accepted behavior

- An authored `ChannelContract` contains request and event schemas but no feature id.
- An authored channel contribution cannot select its canonical feature namespace.
- UIX derives backend channel ids from the feature scope that owns the contribution.
- A feature-owned event publisher can publish only within the scope UIX gave it.
- A mounted surface declares a map from every consumed namespace to its contract and receives one typed client per key.
- A mounted feature client rejects any declared namespace absent from the backend channel registry's accepted projection instead of leaving subscriptions inert.
- Frontend namespace selection changes only the client target. It does not grant event-publication or backend-contribution authority in that namespace.
- Duplicate local channel names still fail within one feature scope.
- Request and event validation, attachment routing, Agent handler selection, logging policy, and lifetimes remain unchanged.
- This is a breaking source migration. Do not retain an overload or compatibility path for self-scoped contracts.

## Progress

- C1 is committed as `f25cad3`.
- C2 is committed as `20c0685`.
- C3 is ready for review. Author guidance and the architecture record now teach substrate-owned backend scope and explicit namespace-keyed surface clients. Focused conformance tests and `npm run check` pass.

## Review units

### C1: Derive backend ownership from feature scope

Remove `feature` from `ChannelContract`, `ChannelContribution`, and the value returned by `withHandlers()`. Derive canonical ids from the feature id already passed through Workspace contribution installation, Agent contribution installation, and feature-bound publisher creation.

Migrate Canvas, substrate Agent channels, substrate workspace channels, runtime fixtures, and publisher tests. Replace owner-mismatch tests with tests proving that authored contract data has no way to redirect a contribution or publisher into another namespace.

**Review gate:** Workspace handlers, Agent handlers, and events retain their existing canonical wire ids. Duplicate detection and schema validation still hold. Backend feature code has no authored namespace field.

### C2: Declare and validate frontend channel namespaces

Change surface channel-client construction to one namespace-keyed contract map. `SurfaceMount` creates one typed client per key before rendering. Migrate Chat to its `agent` client and Canvas to its `canvas` and `agent` clients. UIX-owned direct clients continue to name `agent` and `uix` explicitly.

Project the backend channel registry's live namespaces with the accepted surface composition. Validate every surface map key against that read-only projection. Namespace lifetime follows admitted contracts, including event-only contracts and multiple contracts under one namespace. Do not infer availability from feature or surface lists.

Defer multiple contracts under one namespace at a single surface binding until a caller needs them. A later API may accept `ChannelContract | readonly ChannelContract[]` and merge clients while rejecting duplicate local members.

**Review gate:** Canvas receives typed `canvas` and `agent` clients from one declaration. Chat receives its typed `agent` client. UIX clients reach reserved namespaces explicitly. A missing or renamed provider fails visibly before its surface renders, and registry disposal removes a namespace only after its final contract lifetime ends.

### C3: Update author guidance and run conformance

Update channel and surface documentation to teach substrate-owned backend scope and explicit namespace-keyed surface clients. Remove examples and comments that describe contracts as owning or including a feature id.

Run focused API, channel-registry, feature-contribution, surface-host, and workspace-client tests, followed by `npm run check`.

**Review gate:** Documentation, type errors, and conformance tests all reinforce the same scoping path, and the complete repository check passes.

## Likely files

- `packages/api/src/channels.ts`
- `packages/api/src/channel-resolution.ts`
- `packages/api/src/workspace.ts`
- `packages/runtime/src/channel-registry.ts`
- `packages/runtime/src/features/contributions.ts`
- `packages/client/src/workspace/surface-host.tsx`
- `packages/client/src/workspace/session-context.tsx`
- `src/features/chat/workspace/surface.tsx`
- `src/features/canvas/shared/channels.ts`
- `src/features/canvas/workspace/Canvas.tsx`
- `src/features/canvas/workspace/surface.tsx`
- `src/docs/add-a-channel.md`
- Associated API, runtime, client, loader, and feature tests.

## Deferred

- General third-party cross-feature discovery and provider selection.
- Permissions for consuming a published cross-feature contract.
- Agent-bound feature web contracts and route transport.
- Changes to canonical channel wire ids or attachment routing.
