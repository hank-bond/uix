---
summary: "Exploring cross-feature interoperability through publisher-qualified shared protocols, optional typed providers, common document resources, and resource viewers while separating semantic capability, reactive state, presentation routing, and host delivery."
kind: explanation
status: exploring
---

# Cross-feature interoperability

## Current synthesis

Cross-feature integration has four distinct pieces that should not collapse into one generic bus.

A _public protocol_ is owner-neutral authoring vocabulary: a qualified id and immutable version, TypeBox request/response and event schemas, and derived TypeScript types. A provider feature registers implementations; a consumer feature imports the protocol module and asks the substrate for an optional typed client. The substrate validates availability and routes calls through the existing channel machinery. Provider implementations never become consumer dependencies. Protocol operations eventually carry the query, mutation, or effect semantics established by [rollback boundaries](./rollback-boundaries.md), without making transport responsible for rollback policy.

A _document resource_ is shared reactive truth with a host-neutral identity. Any number of features or surfaces may subscribe to one resource, and every writer commits through its owner. Views update because they observe the same document revision feed, not because Canvas, Monaco, Chat, or a calendar view message one another. Representation metadata such as MIME type describes content encoding; a protocol or document kind describes semantics.

A _resource viewer_ is a live renderer capability that advertises serializable matching metadata and privately retains its opener callback. The framework-neutral workspace registry owns lifetime, matching, catalog projection, and invocation. The feature where a human interaction originates owns its menu or link presentation: Chat or a file browser asks for matching viewers and renders `Open With`; the host does not infer resource meaning by globally intercepting every context-menu event.

A _host delivery URL_ is transport, not identity. Electron may expose bytes through `uix-resource://...`, while a hosted runtime may use HTTP or WebSocket-backed routes. Features persist and exchange domain resource identities, then ask the host for an opaque browser URL only when a browser or iframe must fetch content.

Public semantic protocols are distributed as ordinary package exports. A protocol can begin as a subpath of one feature package and move to a small independent package when unrelated publishers consume it. Installing the package does not activate the feature. Runtime schema discovery supports generic `unknown` consumers; statically typed authored consumers must import the protocol definition at build time.

Human-facing feature names are not machine identities. Different publishers may both call their product `Calendar`; non-UIX protocol identities are publisher-qualified, while UIX reserves its own authority. Multiple providers may implement one genuinely shared protocol. Incompatible contracts use different qualified ids or versions, and interoperability between them requires an explicit adapter rather than structural guessing.

The Agent is not an automatic subscriber to shared state. Each provider decides which domain tools, stable guidance, and changing state projections are useful to the Agent. Agent operations affect resources or domain semantics, never viewer presentation.

The active build plan is [cross-feature capabilities and resource viewing](../../plans/cross-feature-capabilities-and-resource-viewing.md).

## Alternatives retained

- **Import a provider-owned channel contract directly.** This already works mechanically and remains appropriate for tightly coupled features, but it makes an optional generic consumer depend on one implementation and cannot naturally select among multiple providers.
- **Have producer and consumer independently restate matching schemas.** Rejected as the normal typed path: duplicated contracts drift, semantic compatibility cannot be inferred from structural similarity, and JSON Schema equivalence is not a sound protocol identity. Shared protocol modules carry authored static types; qualified id/version carries runtime identity.
- **Discover the provider's schema only at runtime.** Valid for generic inspectors and generated UI, but authored TypeScript receives `unknown`; runtime discovery cannot retroactively create compile-time types.
- **Use MIME type as capability identity.** Rejected because MIME describes representation, not semantic operations. Scheme, representation, semantic protocol/kind, and viewer role remain separate matching axes.
- **Require globally unique friendly feature names.** Rejected. Publisher-qualified machine identities prevent collisions without monopolizing names such as `Calendar`.
- **Route resource opening through a provider-specific backend channel.** Useful as a short proof but wrong as the generic presentation model. Opening a tab is renderer state; a framework-neutral renderer registry routes to private callbacks, while backend effects continue through typed protocols/channels.
- **Let panes synchronize directly.** Rejected in favor of all views subscribing to the same document resource and revision feed.
- **Have the host capture every right click.** Rejected because the originating feature knows the resource and domain context. The substrate supplies a live catalog and invocation API; features own menus.
- **Persist literal local `file://` identities.** Rejected as the canonical model because they do not survive hosted execution or worktree movement. Local paths remain an adapter concern until canonical workspace coordinates are settled.
- **Use JavaScript protocol-token object identity.** Rejected because package managers may install multiple copies. Qualified id, version, and validated contract must establish agreement.

## Open axes

The plan deliberately leaves unresolved the exact identity syntax and authority, protocol descriptor and fingerprint rules, package and Git distribution conventions, provider cardinality and selection, document revisions and conflict policy, canonical resource coordinates, viewer selectors/defaults/instances, framework adapters, transport projection, and permissions. Protocol payload portability, package-version versus protocol-version policy, cancellation or streaming semantics, and resource creation/deletion lifecycle also need explicit decisions before their corresponding build units.

## Log

### 2026-07-28 — shared protocols, document resources, and resource viewers separated

The Monaco/file-link question exposed three integrations that initially looked like one cross-feature channel. Reactive views converge on one substrate-owned document resource; semantic feature calls use publisher-qualified public protocols with provider implementations and typed optional clients; presentation uses a live framework-neutral resource-viewer catalog. Electron resource URLs remain host delivery details. The VS Code parallels sharpened the shape: URI/document identity and change feeds for shared truth, selectors and `Open With` for presentations, and separately distributed protocol types for semantic extension APIs. The discussion also established that protocol packages, not duplicated schemas or dynamic discovery, are the authored TypeScript boundary, and that friendly feature names remain non-unique.
