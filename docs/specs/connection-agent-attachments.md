---
summary: "An attachment binds one workspace connection to one Agent viewpoint. Retargeting changes future work without moving accepted work or peer connections."
kind: reference
status: draft
implementation: incomplete
---

# Connection–Agent attachments

## Contract

A _connection–Agent attachment_ binds one logical workspace connection to one Agent viewpoint. The host owns the physical connection. The workspace runtime resolves the target Agent instance, and the attachment holds its guard. Future requests and events use that target without adding routing fields to feature payloads.

In this version, one physical connection owns one attachment, and one attachment targets one Agent viewpoint at a time. A client needs a separate connection for each Agent it displays concurrently.

UIX accepts a request when the attachment records its current target and creates an independent guard for the request. A private web binding is a temporary host address or token. It lets an HTTP request use the attachment without revealing its identity to feature code.

An Agent viewpoint belongs to a durable session branch. The current policy provides one primary Agent for each session. A later version may run several branch Agents in one session without changing how attachments work.

## Dependencies

This specification depends on [`shared-live-object-guards.md`](./shared-live-object-guards.md), [`agent-viewpoints.md`](./agent-viewpoints.md), and [`agent-instances.md`](./agent-instances.md). It uses the exported `Workspace`, `SessionTarget`, `PreparedDispatch`, and `RuntimeEvent` APIs. [`web-host.md`](./web-host.md) defines browser locations, web transport, connection admission, and reconnect behavior.

## Boundary

The attachment owns one connection's current Agent target, retargeting, event observation, private web binding, and disposal. It also creates the independent guard that protects each accepted operation.

The host owns the physical connection and disposes the attachment when that connection closes. The Agent-instance supervisor resolves, creates, retains, and tears down Agent instances. The channel and feature-web registries own handlers, validation, and logging policy.

An attachment is not the only reason an Agent instance may remain alive. Accepted turns and operations hold their own guards. Scheduled or headless work also acquires a guard directly instead of creating a fake connection or attachment.

An attachment cannot move between workspaces. A workspace URL change creates a new logical connection, workspace guard, and attachment. A host may reuse lower-level transport machinery, but clients still observe a new connection.

## Requirements

### Creation and identity

- A workspace connection **must** create exactly one attachment before it dispatches Agent-bound operations.
- Attachment creation **must** resolve an accepted initial target atomically.
- Creating an attachment **may** expose restored session state but **must not** require booting the Agent's model-bearing Pi runtime.
- When connection admission selects a fallback or creates a session, it **must** return the durable session target selected for the attachment.
- Two connections resolving the same primary session target **must** share the same live Agent instance under the current policy while retaining independent attachments.
- Attachment identity **must** exist only for the current workspace execution and **must not** become durable application state.
- Feature payloads **must not** include attachment, connection, workspace, session, branch, or Agent routing fields.

### Retargeting

- Retargeting is limited to Agent viewpoints within the attachment's workspace.
- Retargeting **must** acquire the proposed target before disposing the current target guard.
- A failed acquisition **must** leave the attachment on its previous accepted target.
- After a successful retarget, future operations and events **must** use the new target.
- Retargeting **must not** wait for previously accepted work against the old target to finish.
- Retargeting **must not** move or interrupt peer attachments, including peers attached to the same old Agent.
- The physical connection **must** remain usable across a successful retarget, Agent reload, or internal replacement needed to continue the same logical binding.
- UIX **may** mutate the attachment or replace internal objects as long as clients observe the behavior above.

### Accepted operations

- Channel and feature-web requests **must** use the same attachment behavior when UIX accepts them.
- On acceptance, UIX **must** record the attachment's current target and retain an independent guard for that Agent instance.
- Retargeting or disposing the attachment after acceptance **must not** retarget or cancel the accepted operation.
- An accepted operation **must** dispose its guard exactly once after completion or failure.
- An operation presented after attachment disposal **must** be rejected.
- An accepted operation **may** request a retarget after the attachment closes. It **may** guard that Agent instance for its remaining work but **must not** change the closed attachment.
- Process shutdown **may** cancel accepted operations through the host's coordinated shutdown path.

### Events

- An attachment **must** observe only events whose scope matches its current target or workspace.
- Retargeting **must** prevent later old-target events from reaching that connection.
- Peer attachments targeting the same Agent **must** independently receive matching events.
- A host broadcast mechanism **must not** decide which connections receive an event.
- Closing one attachment **must** stop only its event observation.

### Feature-web binding

- UIX **must** mint one private web binding for each accepted attachment-target generation.
- The binding is a correctness and lifecycle value, not a security boundary.
- When UIX accepts a feature-web request, it **must** record the current target. It **must** hold an independent guard as it does for a channel request.
- Hosts **may** encode the binding physically in a path, opaque token, custom-scheme location, or another private form.
- Feature code and persisted feature content **must not** receive, construct, copy, validate, or persist the physical binding.
- Browser code **may** observe the generated physical URLs but **must not** depend on the binding value.
- Retargeting **must** revoke the old web binding for future requests. It **must** provide the replacement binding before consumers generate more URLs and without a new physical connection.
- Closing the connection or attachment **must** permanently revoke its web binding.
- Two attachments to the same Agent **must** have independent web-binding lifetimes. Retargeting or closing one **must not** invalidate the other.
- A feature-web request accepted before revocation **may** finish against its recorded target. A request presented afterward **must** be rejected.

### Connection loss, reconnect, and shutdown

- Closing a physical connection **must** dispose its attachment.
- Connection loss **must not** cancel already accepted Agent turns or operations.
- Reconnect **must** create a new physical connection and a new attachment. A closed attachment or web binding is never reclaimed.
- After reconnect, a client **must** read current state instead of reviving the old attachment or replaying missed transient events.
- A later warm-instance policy belongs to the Agent-instance supervisor, not attachments.
- Server termination and Electron application quit **must** both stop new connections, cancel cancellable Agent work, dispose attachments, and wait for workspace teardown.

## Conformance

A conforming implementation demonstrates these outcomes:

1. Two connections targeting one session share the current primary Agent while closing either attachment leaves the other operational.
2. Retargeting one attachment moves only its future requests and events. Peer attachments remain on their existing targets.
3. Failed retarget acquisition preserves the old target and connection behavior.
4. A request accepted before retarget or disconnect completes against the Agent instance it already guarded. A later request uses the new target or is rejected after closure.
5. A private feature-web location reaches the same target as a channel request. Retargeting revokes that location without affecting a peer connection.
6. Reconnect creates a new attachment and reads the current session snapshot without reviving the old attachment or replaying missed transient events.
7. Connection loss leaves an accepted Agent turn running, while coordinated host shutdown cancels it and waits for teardown.
8. A workspace change creates a new logical connection and attachment rather than retargeting the existing attachment across workspace runtimes.

## Degrees of freedom

A conforming implementation may choose:

- The internal attachment object shape and whether retargeting replaces internal objects.
- The physical web-binding representation.
- The Agent-instance retention policy after all ordinary guards dispose.
- Host-specific physical connection and transport implementations.
- Internal guard, registry, and prepared-operation types.

These choices must not add routing fields to feature payloads or change accepted requests, peer isolation, revocation, or operation lifetimes.

## Open questions

- Which durable identity will address an Agent branch once several Agents may run concurrently in one session?
- How should an event identify its recipients when one session contains several branch Agents?
