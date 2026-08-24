---
summary: "A connection attaches to one agent instance at a session-branch viewpoint. Boots are single-flight and separate from attach. An instance stays retained while attachments hold it and tears down at a safe boundary. Each instance owns its state at its viewpoint. The canonical URL names the attachment's target."
kind: explanation
status: superseded
---

# Attachments target agent instances

## Context

The server must support several connections to one workspace-session sharing a live agent and independent session targets per connection. It must also leave a future path to multiple branch-bound agents on one session tree. The implemented model of one workspace-global selected session cannot express these.

## What changes

- A **session** is a durable conversation tree. An **agent instance** is one live agent execution attached to a session at a branch viewpoint.
- An **attachment** is a connection's owned, retargetable handle on one agent instance. It is the routing identity for that connection's requests, can retarget to another instance, and disposes when the connection drops.
- **Boot** is the discrete provisioning step. When no instance is live for the target, the runtime boots one first, then the connection attaches. Concurrent attaches share one boot through single-flight. **Bind** remains creation-time wiring only.
- The first policy resolves each session to one **primary agent instance**. Two connections on the same session share that instance and its events.
- An instance stays **retained** while at least one attachment holds it. When the last attachment leaves, an idle instance tears down immediately. A running instance finishes its turn and tears down at the safe boundary. A new attach cancels pending teardown.
- A primary instance accepts one active turn. A competing prompt rejects as busy rather than queuing.
- Each instance owns its **agent instance state** at its session-branch viewpoint: the turn-state projection, agent context, Pi installation, and branch-dependent feature buffers. The workspace runtime keeps the accepted feature composition, settings, stores, and contribution definitions.
- Events carry workspace, session, or agent-instance delivery scope. The host delivers them to matching attachments. Transport broadcast is not a delivery semantic.
- The canonical URL names one attachment's target. A workspace may retain a **fallback session** for the workspace-only route and launcher. That value is not a global active session.

## Why this shape

The scope is the branch of the session, not the session. Two agents on one session later sit at different branch viewpoints and must not share one restored feature projection. Distinguishing instance identity from session identity leaves that path open without designing branch coordination now.

Attach is separate from boot because the two are orthogonal concerns: provisioning the instance versus binding the connection to it. Retaining by attachments replaces an exclusive-lease vocabulary, since several attachments share one instance.

Safe-boundary teardown commits final branch-scoped feature state when the instance tears down, not whenever one attachment leaves. A later warm-retention policy can follow without changing attachment semantics.

## Deferred

Configurable warm retention, always-on instances, host-authored background retention, multiple branch-bound agents on one session, and ephemeral call-and-response agents remain future policy.

## Distilled from

[`agent-session-routing.md`](../design/agent-session-routing.md) and [`agent-instance-state.md`](../design/agent-instance-state.md). Built by [`electron-server-split.md`](../../plans/electron-server-split.md).
