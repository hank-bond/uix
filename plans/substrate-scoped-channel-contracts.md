---
summary: "Move channel ownership out of authored contracts and into substrate-established feature scope, while making every cross-feature client target explicit."
---

# Substrate-scoped channel contracts

## Goal

Channel contracts should describe requests and events, not claim their own feature identity. UIX already knows the active feature when it installs Workspace and Agent contributions. The surface host also knows which feature contributed each mounted surface.

Use those trusted scopes to derive canonical channel ids. Require a caller to name the target only when it deliberately consumes another feature's or the substrate's contract. Keep existing wire ids such as `canvas.writeback`, `agent.prompt`, and `uix.surfaces` unchanged.

This migration establishes the ownership pattern that Agent-bound feature web contracts will follow.

## Current implementation

- `ChannelContract.feature` currently provides the target to `createChannelClient()` and is checked against the feature id already held by backend contribution and publisher paths.
- `registerWorkspaceFeatureContributions()` and `registerAgentFeatureContributions()` already receive the active feature id.
- `FeatureEventPublisherFactory` is already created for one feature id.
- `SurfaceMount` receives `SurfaceEntry.featureId` and already uses it to scope settings and actions.
- Chat deliberately consumes the substrate-owned `agentChannels`. Canvas consumes its own contract through its mounted surface and separately consumes `agentChannels` for prompt actions.

## Accepted behavior

- An authored `ChannelContract` contains request and event schemas but no feature id.
- An authored channel contribution cannot select its canonical feature namespace.
- UIX derives backend channel ids from the feature scope that owns the contribution.
- A feature-owned event publisher can publish only within the scope UIX gave it.
- A mounted surface binds an ordinary contract to the feature id on its `SurfaceEntry`. Feature code does not repeat that id.
- A caller consuming another feature's or the substrate's channel contract must select that target explicitly at the client binding site.
- Cross-feature selection changes only the client target. It does not grant event-publication or backend-contribution authority in the target namespace.
- Duplicate local channel names still fail within one feature scope.
- Request and event validation, attachment routing, Agent handler selection, logging policy, and lifetimes remain unchanged.
- This is a breaking source migration. Do not retain an overload or compatibility path for self-scoped contracts.

## Review units

### C1: Derive backend ownership from feature scope

Remove `feature` from `ChannelContract`, `ChannelContribution`, and the value returned by `withHandlers()`. Derive canonical ids from the feature id already passed through Workspace contribution installation, Agent contribution installation, and feature-bound publisher creation.

Migrate Canvas, substrate Agent channels, substrate workspace channels, runtime fixtures, and publisher tests. Replace owner-mismatch tests with tests proving that authored contract data has no way to redirect a contribution or publisher into another namespace.

**Review gate:** Workspace handlers, Agent handlers, and events retain their existing canonical wire ids. Duplicate detection and schema validation still hold. Backend feature code has no authored namespace field.

### C2: Inherit own-feature scope and name imported targets

Change renderer channel-client construction so UIX resolves a target scope before creating the client. `SurfaceMount` uses `SurfaceEntry.featureId` for its surface's own contract. Add one explicit caller-side form for imported contracts, then migrate Chat and Canvas Agent-channel consumption plus UIX-owned `agent` and `uix` client sites.

Keep the low-level canonical-id constructor behind the resolved scope. Do not make ordinary own-feature surface code repeat its feature id. The exact helper name and object shape may follow existing API naming conventions. Types and call sites must still distinguish own contracts from imported contracts.

**Review gate:** A Canvas surface reaches `canvas.*` through inherited scope. Chat and Canvas reach `agent.*` only through an explicit imported target. UIX clients reach `uix.*` explicitly. An implicit cross-feature binding cannot silently address the imported provider.

### C3: Update author guidance and run conformance

Update channel and surface documentation to teach substrate-owned scope first and explicit imported targets second. Remove examples and comments that describe contracts as owning or including a feature id.

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
