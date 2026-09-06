---
summary: "Rename viewpoint-scoped feature channel code for its actual scope and remove the duplicate AgentInstance channel-registry path without changing behavior or wire ids."
---

# Viewpoint channel naming

## Status

Deferred. This cleanup does not block the viewpoint web-route work.

## Goal

Apply the scope guidance in [`naming.md`](../docs/architecture/conventions/naming.md) to feature channels created once per viewpoint. Keep generic channel machinery unqualified, and name the viewpoint scope only where it distinguishes one contribution or operation from another.

The substrate `agentChannels` contract keeps its name because it controls the Agent: prompts, turns, models, and authentication.

## Changes

- Rename `agentChannelContracts` to `viewpointChannelContracts`.
- Rename `AgentChannelHandlerRegistry` to `ChannelHandlerRegistry`.
- Rename `registerAgentChannelContracts` to `registerViewpointChannelContracts`.
- Rename `registerAgentChannelHandlers` to `registerChannelHandlers`.
- Rename viewpoint channel invocation fields and methods from `Agent` or `Feature` to `Viewpoint`.
- Remove `AgentInstance.featureChannels` and use `AgentInstance.features.channels` as the only registry path.
- Update tests, source summaries, and channel author guides.

## Invariants

- Keep canonical wire ids such as `canvas.writeback`, `agent.prompt`, and `uix.surfaces` unchanged.
- Keep request validation, response validation, event publication, attachment routing, reload admission, and lifetimes unchanged.
- Do not add compatibility aliases.

## Review gate

One channel registry path exists on `AgentInstance`. Generic channel types have generic names, viewpoint contribution and invocation boundaries name their scope, and the complete repository check passes.
