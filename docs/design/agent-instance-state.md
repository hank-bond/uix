---
summary: "Settled: an agent instance is one live agent execution attached to a session at a branch viewpoint, and its agent instance state is the working state at that viewpoint. Attach is separate from boot, bind is creation-time wiring, and an instance stays retained while attachments hold it."
kind: explanation
status: resolved
---

# Agent instance state

## Purpose

The host and runtime split lets several live agent executions share one workspace runtime. This note settles the vocabulary that separates the durable session, the live agent, and the branch-restored feature state each agent needs.

## Settled model

A _session_ is the durable conversation tree. An _agent instance_ is one live agent execution attached to a session at a branch viewpoint. Its _agent instance state_ is the working state at that session-branch viewpoint: the turn-state projection, agent context, Pi installation, and feature buffers that belong to the branch. Connections on one primary instance share that state, while instances on different sessions keep independent state.

The workspace runtime keeps the accepted feature composition, settings, stores, and contribution definitions. Each agent instance instantiates the stateful feature parts for its branch rather than sharing one workspace-global projection.

The lifecycle vocabulary is settled:

- `attach` establishes a connection's owned, retargetable handle on an agent instance.
- `boot` is the discrete provisioning step: when no instance is live for the target, the runtime boots one first, then the connection attaches.
- `bind` remains creation-time wiring only and does not describe the connection-to-instance relationship.
- An instance stays retained while at least one attachment holds it and tears down at a safe boundary when the last one leaves.
- Concurrent attaches share one boot through single-flight.

The canonical URL names one attachment's target. A workspace may retain a fallback session for launcher convenience; that value is not a global active session.

The controlled vocabulary lives in the [`lexicon`](../architecture/conventions/lexicon/AGENTS.md). [`agent-session-routing.md`](./agent-session-routing.md) owns the routing and lifecycle behavior.

## Log

### 2026-08-09: execution scopes decouple feature state from workspace

Separated durable sessions, live agents, and branch-restored feature working state. The workspace runtime owns one feature composition and workspace scope. Each live agent owns the turn-state projection, agent context, Pi installation, and branch-dependent buffers.

### 2026-08-09: vocabulary settled

Locked `agent instance` and `agent instance state` as the terms. The scope is the branch of the session, not the session itself: with two agents sharing one session later, each sits at its own branch viewpoint. Chose `attach` over `bind` because binding creates the artifact at creation time, while attaching is a later step over two independently existing participants. Chose `boot` as the discrete provisioning step, `single-flight` for shared boots, `retain` for the retention relationship, and `teardown` for safe lifecycle end. Retired `mount`, `lease`, `endpoint`, `port`, `coalesce`, and `retire` in the relevant senses.
