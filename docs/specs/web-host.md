---
summary: "A web host exposes launcher, workspace-session, live-channel, and content access to a standard browser through deployment-authorized public origins while keeping runtime and feature contracts host-neutral."
kind: reference
status: accepted
---

# Web host

## Contract

A _web host_ exposes UIX launcher and workspace clients to a standard browser. It projects a workspace catalog before any workspace runtime is active. It resolves canonical workspace-session locations. It binds live browser connections to runtime attachments. The host separates the live control plane from the content plane. Live connections include requests, responses, events, and content references. HTTP includes the referenced content itself.

Loopback and remotely reachable deployments are profiles of the same host contract. Loopback addressing is not part of the concept. A remote deployment is not created by changing a bind address alone.

## Trust model

One web-host instance is one trust domain. It serves the workspace user or a mutually trusted group. The host provides strong isolation between trust domains. Those domains are deployments, users, or hosted tenants. It provides only weak, cooperative isolation among code and content admitted within one workspace.

Manifest-selected surface modules, feature backends, Canvas documents, and agent-authored content share the same trust domain. The host may isolate documents in iframes for separate document, CSS, global-object, and lifecycle scope. It must not present iframes or origin separation as hostile-code containment. Stronger per-feature or third-party content isolation belongs to a later hosted or marketplace profile, not to this specification.

Admission is deployment-provided rather than host-implemented. A trusted network boundary or an authenticated ingress may admit requests. The host performs no login, holds no user identity, and issues no credentials in this version. It still validates request authorities and browser origins against its configured public-origin policy.

## Dependencies

This specification has no accepted requirement-specification dependencies. It applies the repository conventions and the exported workspace supervision, attachment, prepared-dispatch, catalog, document-store, and logical-resource contracts.

## Boundary

The web host owns process lifecycle, listener integration, browser-visible routing, physical live transport, admission enforcement, and browser security policy. It also owns workspace catalog adaptation, workspace supervision, content transport encoding, and browser client bootstraps. It owns the host-side workspace registry that the catalog projects.

It depends on deployment-provided listener configuration and public-origin and admission policy. It depends on a workspace registry source, runtime dependencies, and optional trusted-ingress configuration.

The web host does not own feature channel semantics, workspace behavior, or app feature composition. It does not own identity-provider implementation, user provisioning, or login and credential management. It does not own tenancy orchestration, virtual-machine provisioning, external ingress, or marketplace isolation.

## Requirements

### Public identity and locations

- The web host **must** derive every browser-visible location through its deployment public-origin policy.
- A loopback-only deployment **may** derive the public origin from the accepted bound address.
- A non-loopback deployment **must** receive an explicit public origin.
- The host **must not** infer public locations from an untrusted request or forwarding header.
- The web host **must** address each exposed workspace by a stable opaque workspace id.
- A browser-visible workspace id **must not** be a filesystem path or another storage location.
- The host-side workspace registry **must** load at boot without booting any workspace runtime.
- In this version the registry is read-only. Changing it requires a host restart.
- The served catalog **must not** reveal filesystem paths or storage locations.
- The workspace catalog **must** expose canonical workspace locations without booting their workspace runtimes.
- The catalog projection **must** be versioned and machine-readable.
- A workspace-only location **must** serve the workspace shell without creating a session or attachment.
- The browser's live connection to that location **must** create a new session as its accepted target and return the accepted session id.
- The client then **must** make its location canonical.
- A direct request or reload of a canonical workspace-session location **must** attach to that existing durable session.
- A successful in-page session change **must** retarget the live attachment before the client changes its canonical location.
- That session change **must** enter browser history.
- Browser back and forward navigation **must** retarget the live attachment to the location's session.
- A failed retarget **must** preserve the previous attachment target and location.

### Admission and transport security

- The web host **must** apply its deployment admission policy before it reveals a catalog or serves a workspace page.
- It **must** also apply the policy before session resolution, live connection admission, or content dispatch.
- One successful request **must not** imply admission for another request unless the admission policy provides that authority.
- A trusted network boundary or an authenticated trusted ingress may constitute the admission policy.
- The host **must** reject request authorities and browser origins that do not match its configured public-origin policy.
- It **must not** trust a client-authored `Host`, `Origin`, or forwarding header merely because the header is present.
- A deployment exposed to the public internet **must** provide browser-visible confidentiality and integrity for pages, live traffic, and content.
- TLS may terminate at trusted ingress when the connection from that ingress to the host is inside the deployment's trusted boundary.
- A deployment confined to an explicitly trusted encrypted network **may** serve plain HTTP and WebSocket traffic.
- The host **must not** present an authless plaintext deployment as safe on an untrusted network.
- Non-loopback binding **must** be explicit.
- The host **must not** expose an authless instance on interfaces the deployment did not configure.
- The web host **must** grant cross-origin read access only to browser origins derived from its configured public-origin policy.
- It **must never** grant cross-origin access to an unvalidated client-supplied origin.
- Browser security policy **must** deny unneeded script, connection, embedding, navigation, and resource capabilities.
- It **must** permit only the origins required by the active client.

### Workspace and connection lifetimes

- The web host **must** start and serve its launcher with zero active workspace runtimes.
- It **must** acquire a workspace through the workspace supervisor only after an admitted operation needs that workspace.
- Each accepted live browser connection **must** own one workspace guard and one runtime attachment for its accepted session target.
- The live connection **must** create its own session and attachment when the connection opened a workspace-only location.
- It **must** attach to the named session when it opened a canonical location.
- Closing the connection or the host **must** dispose the attachment and guard without affecting peer connections.
- The host **must not** create or hold a pending attachment across separate physical requests.
- No cross-request capability handoff is required.
- The live connection acquires and owns its attachment from connection setup onward.
- Ordinary live request messages **must** include only physical correlation, canonical channel identity, and canonical payload.
- They **must not** repeat workspace, session, attachment, tenancy, or authentication identity after the host binds the connection.
- The host **must** ask the bound attachment to prepare each accepted canonical request before it records or invokes the crossing.
- It **must** use the prepared channel policy for logging, invoke the prepared dispatch, and correlate exactly one terminal response to the request.
- A correlation identity in use by an unresolved request **must not** be reused.
- Reuse **must** be rejected as a protocol error without disturbing the original request.
- Accepted work **must** retain its own runtime authority through completion.
- Attachment retarget, connection closure, or another holder's guard disposal **must not** move or revoke that work.
- A mutating request that creates durable content **must**, when accepted, respond with the durable identity of the created record.
- Failure before durable creation **must** respond with an error so the client can restore the uncreated input.
- Failure after durable creation **must not** remove the durable record.
- The host **must** detect dead live connections, for example with periodic ping/pong. A disconnected client must not retain workspace or attachment ownership indefinitely.
- Host shutdown **must** stop new admission and notify live connections that the server is shutting down.
- It **must** cancel active Agent runs through their native cancellation.
- It **must** close physical connections and dispose pending and live attachment ownership.
- It **must** stop HTTP service and await workspace-supervisor teardown.
- A failed start **must** close every listener, socket, and runtime it opened before reporting failure.

### Reconnection

- The browser client **must** own reconnection.
- It **must** reconnect to the session named by the canonical location with capped backoff, create a new attachment, and rehydrate authoritative snapshots.
- Missed transient events **must** be replaced by the current snapshot rather than replayed.
- Pending client requests at the moment of connection loss **must** be rejected locally and **must not** be automatically resent.
- A client **may** safely retry a mutating request under the same client-supplied idempotency identity.
- The host **must** treat reuse with equivalent content as a return of the existing outcome and reuse with different content as an error.
- A full page reload may serve as the recovery fallback when the client cannot restore its projection from snapshots.

### Event delivery

- The web host **must** deliver each runtime event only to live attachments whose accepted target matches the event scope.
- Physical broadcast **must not** define delivery semantics.
- A live event message **must** include canonical channel identity and payload without adding workspace, session, tenancy, or authentication fields to the canonical payload.
- A connection loss may discard unacknowledged live events.
- The host **must not** claim recovery unless the client can re-establish the affected projection from an authoritative snapshot or ordered replay.

### Content plane

- A canonical channel payload that names content **must** include a host-neutral immutable content reference, not a browser transport URL.
- The reference **must** name exact bytes or a specific revision.
- A convenience `latest`-style resolution **may** exist, but it **must** resolve to an immutable reference before use.
- It **must not** be persisted as a durable identity.
- The web host **must** map each accepted content reference to a browser-fetchable URL for the relevant workspace and session viewpoint.
- Feature and runtime code **must not** observe the browser transport encoding.
- The browser **must** fetch referenced content over HTTP rather than over the live connection.
- A content request **must** retain a workspace guard from accepted resolution through response completion.
- Its lifetime **must not** depend on any live connection.
- Content resolution **must not** create an Agent attachment.
- It **must not** boot an Agent instance unless resolving the referenced content actually requires one.
- The web host **must** reject a content request whose public authority, workspace encoding, origin, route, or admission does not match.
- Runtime content validation remains required after host decoding.
- Versioned immutable content **must** be served under a long-lived immutable cache policy.
- Mutable pages, catalog, session projections, and current-state responses **must not** be served under an immutable cache policy.
- The web host **must not** require host-specific transport URLs or privileges in content that is exported or frozen for standalone use.

### Failure behavior

- An unknown or inadmissible target **must not** create a usable attachment.
- The host **must not** reveal the target's existence beyond its admission policy.
- A malformed physical message **must not** reach canonical dispatch.
- The host **may** correlate a safe protocol error only after it validates the client-authored correlation id independently.
- Expected rejections **must** include a stable machine-readable code and a useful message.
- Unexpected internal failures **may** include diagnostic detail in this trust model.
- Boot, attachment creation, upgrade, dispatch, and response failures **must** dispose every host-owned capability acquired by the failed operation.
- Those capabilities include guards, attachments, subscriptions, and pending connections.
- Wire logging **must** use contract-owned redaction for known channels and a safe payload-omitting policy for unknown or malformed channels.
- A client-authored field **must not** select the logging policy.

## Conformance

A conforming web host demonstrates these outcomes:

1. The launcher and workspace catalog work with zero active runtimes. The first admitted workspace operation lazily boots only its target runtime.
2. Deployment-supplied public authority produces canonical page, live, and content locations even when the private listener has a different scheme, host, or port.
3. A trusted-network or ingress deployment admits requests without host login. Non-loopback operation requires an explicit public origin. Cross-origin grants derive only from the configured public-origin policy. Public-internet exposure requires TLS.
4. A workspace-only location creates a new session through its live connection and then canonicalizes. Several tabs can target the same or different sessions. Session changes and browser back/forward retarget the attachment before canonicalization and preserve the previous target on failure.
5. Content references are host-neutral and versioned. The browser fetches referenced content over HTTP. Content requests retain independent workspace authority and do not depend on any live connection. Versioned content caches immutably while mutable pages and projections do not. The served catalog contains no storage locations.
6. Reconnection with dead-connection detection rehydrates snapshots without replay. Pending requests are not resent. A mutating request returns the durable identity of its created record when accepted. A reused in-flight correlation identity is rejected while the original request is undisturbed. Every accepted request produces exactly one terminal response.
7. Boot failure, malformed messages, connection loss, and host shutdown leave no host-owned attachment or guard alive. They do not start teardown for an independently guarded peer.
8. Loopback and non-loopback profiles satisfy the same canonical channel, attachment, content-dispatch, and client contracts without feature-specific host branches.

## Degrees of freedom

A conforming implementation may choose:

- The HTTP library, browser live-transport mechanism, message encoding, and internal routing structure.
- Exact launcher, workspace, session, live, asset, and content pathnames.
- The browser-origin set. That set covers hosts, ports, and subdomains. It also covers whether resource content shares the workspace origin or uses separate origins in a multi-origin deployment.
- Direct TLS or trusted-ingress TLS termination, and the trusted-network definition for a plaintext profile.
- The admission mechanism and its trusted-network or trusted-ingress policy.
- The workspace registry's storage source and location, and how many workspaces one admitted host exposes.
- Runtime retention policy after the final guard disposes.
- Heartbeat interval, reconnect backoff, and cache duration when content identity makes immutable caching correct.
- Static asset packaging, and whether exported content is frozen as standalone files.

These choices may not weaken the requirements above or change canonical runtime and feature contracts.
