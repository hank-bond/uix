---
summary: "H4 routes applications and events by durable workspace and session identity. Explicit agent-instance identity and event scope wait for a concrete ephemeral-execution or stale-work requirement."
kind: explanation
status: accepted
---

# Defer agent-instance routing identity

## Context

The initial attachment contract exposed an ephemeral `AgentInstanceId` and agent-instance event scope before any production behavior consumed either one. H4 supports one primary agent per session, routes activity to attachments by durable session identity, and uses manager object identity to guard lifecycle races.

Future branch-bound application routing uses durable branch identity rather than ephemeral execution identity. Ephemeral call-and-response agents may need a distinct execution identity, but their routing and stale-work semantics remain undefined.

## Decision

H4 exposes workspace and session event scopes only. Runtime attachments expose their durable accepted session identity and do not expose an agent-instance id. The agent instance manager does not mint ids without a concrete consumer.

A later unit may introduce explicit agent-instance identity together with the behavior that requires it, such as ephemeral execution routing or stale-work rejection. That unit must define the identity's lifetime and visibility rather than reserving a public shape in advance.

## Consequences

- Hosts route H4 agent activity by durable session scope.
- Future branch routing uses `branchId`.
- Manager lifecycle races use internal object identity.
- Ephemeral agent identity and event scope remain deferred with ephemeral call-and-response agents.

## Supersedes

This decision supersedes the agent-instance id and event-scope portions of [`2026-08-09-attachments-target-agent-instances.md`](./2026-08-09-attachments-target-agent-instances.md). Its attachment, retention, single-flight boot, and safe-teardown conclusions stand.
