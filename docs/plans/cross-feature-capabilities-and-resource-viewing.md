---
summary: "Establish publisher-qualified public protocols, optional typed provider/client routing, substrate-owned document resources, and framework-neutral resource-viewer registration in review-gated units whose remaining identity, distribution, selection, document, and transport details are settled before implementation."
status: active
---

# Cross-feature capabilities and resource viewing

This plan records the high-level shape agreed so far for cross-feature interoperability. It intentionally does not choose API signatures, wire shapes, matching rules, persistence behavior, or package-source mechanics that have not yet been discussed. Each unit begins with a design review that fills only the details needed for that unit. The reasoning and rejected alternatives are retained in [cross-feature interoperability](../design/cross-feature-interoperability.md).

## Agreed model

### Protocols are shared interfaces, not provider implementations

A public protocol is owner-neutral vocabulary shared at authoring time. Its module defines a qualified protocol id and version, request/response schemas for semantic operations, event schemas where applicable, and TypeScript types derived from those schemas. A provider registers executable implementations against the protocol; a consumer imports the protocol and asks the substrate for an optional typed client. The substrate owns provider availability, validation, and routing. Consumers never import provider implementations.

Runtime schema discovery may support generic consumers, but it cannot give authored TypeScript compile-time types. A statically typed consumer imports the public protocol module; a dynamically discovered consumer treats values as `unknown` and validates them at runtime.

Capability protocols build on the existing schema-validation and channel transport machinery rather than creating a second wire system. Backend-to-backend calls may use an in-process route and frontend calls may cross the workspace transport, but both present the same protocol-derived client semantics.

### Public protocol identity is separate from friendly feature naming

Human-facing feature names such as `Calendar` need not be unique. Non-UIX public protocol ids are publisher-qualified; UIX reserves the `uix` authority for protocols it defines. Multiple providers may intentionally implement one shared protocol. Two incompatible contracts are different protocols or different versions; conflicting schemas claiming the same protocol id and version fail loudly rather than resolving by load order.

Public protocol versions are immutable: an incompatible public shape receives a new version. Interoperability between incompatible protocols requires an explicit adapter rather than structural guessing. The exact qualified-id syntax, the authority mechanism, and the relationship to the current plain `FeatureDefinition.id` remain open.

### Horizontal protocols are explicit package exports

Feature-private schemas used vertically between one feature's backend and surfaces remain internal. Schemas intended for horizontal use across features live in explicit public protocol modules and are exported through the package's supported entry points.

A protocol may be a subpath export of its provider's package while it serves one feature family, or a small independent package once unrelated publishers consume it. Installing or importing a protocol package does not activate the provider feature; workspace manifest composition remains the activation authority.

Protocol dependencies use ordinary package mechanics at authoring time: registry packages, Git dependencies pinned to a revision, local dependencies, or workspace packages. Separate installed copies must interoperate by qualified id, version, and validated contract rather than JavaScript object identity. Automatic acquisition of remote feature source from manifest references is not part of the current decision.

### Documents are general shared resources

The substrate may own a general document resource without understanding its semantics. A canonical, host-neutral resource identity names current content and its revisions; any number of surfaces or features may subscribe to changes to that same identity. Writers commit through the document owner, and subscribers react to document update events rather than messaging one another.

Opening a resource and synchronizing its content are separate concerns. Resource-viewer routing chooses presentations; all opened presentations remain reactive because they independently bind to the same document resource.

A representation media type describes bytes or text such as HTML or JSON. A protocol or document kind describes semantic meaning such as a versioned calendar event shape. A URI scheme identifies the resource authority, and a viewer role distinguishes presentations such as source editing and rendered HTML. MIME type alone is not a capability identity.

### Resource viewers are live renderer capabilities

A resource viewer registers a framework-neutral implementation identity, serializable matching metadata, and a private opener callback. The substrate owns registration lifetime, the live catalog, resource-to-viewer matching, invocation routing, and unavailable-provider handling. It exposes plain TypeScript/JavaScript APIs; framework-specific hooks are adapters over that core.

The surface where an interaction originates owns its presentation. Chat may render a context menu for a resource link, and a file browser may render its own `Open With` menu by querying the same live viewer catalog. The workspace host does not globally capture and interpret every right click. Consumers see serializable viewer descriptors and invoke by id; they do not receive another surface's callback or import its code.

Multiple viewers may intentionally accept one resource. This permits the same HTML document to be opened as source in an editor, rendered in Canvas, or opened in both. Exact selector fields, default selection, preferences, and multi-view behavior remain open.

### Domain resource identity is not a browser fetch URL

Canonical resource identities must survive Electron and a hosted client. Electron's `uix-resource://...` URLs are browser delivery URLs for modules, assets, or rendered content; they are not durable document identities. A hosted runtime may deliver the same resource through HTTP or WebSocket-backed APIs. A viewer that needs a browser-fetchable URL asks the host for an opaque transport URL rather than constructing or persisting one.

Literal machine-local `file://` URLs therefore do not form the canonical hosted-compatible identity. The exact workspace-resource coordinate, including how it relates to mutable agent cwd and files outside a workspace, remains open.

### Agent exposure remains feature-owned

Shared document updates and capability availability do not automatically enter Agent context. Each feature contributes the tools, stable protocol guidance, and changing context projection that make its domain useful to the Agent. Agent operations mutate domain resources or invoke domain semantics; they do not manipulate resource viewers or surface presentation.

## Conceptual flows

These flows illustrate the agreed relationships, not final APIs.

### File link opened in one or more viewers

1. A tool transcript item or authored link identifies a host-neutral workspace document resource.
2. Chat asks the live viewer catalog which registered viewers accept that resource.
3. Chat owns left-click/default behavior and any `Open With` menu it presents.
4. The selected viewer opens a view instance and binds to the document resource.
5. Editor, Canvas, or another writer commits a new document revision.
6. Every view subscribed to that same resource reacts to the document update.
7. Electron or a hosted runtime uses its own transport adapter without changing the resource identity or viewer contract.

### Calendar protocol consumed by another feature

1. The Calendar publisher exports a versioned public protocol module containing semantic operation and event schemas.
2. A consuming feature declares an ordinary package dependency on that protocol and imports it for static types.
3. An active Calendar feature registers an implementation and publishes or owns calendar resources.
4. The consumer asks the substrate for an optional protocol-derived client bound to the selected provider or resource.
5. A semantic operation such as creating or moving an event runs through the provider implementation.
6. The provider commits the resulting calendar document/resource revision, and subscribed views react independently.
7. The Calendar feature separately decides what tools and changing state are useful to the Agent.

## Decisions still required

1. **Qualified identity:** settle publisher authority syntax, protocol-id syntax, version syntax, reserved namespaces, workspace-local publishers, and migration of the current feature-id model.
2. **Protocol declaration:** settle the protocol descriptor shape, supported operation/event forms, payload portability, schema normalization or fingerprinting, duplicate-definition checks, package-version versus protocol-version policy, simultaneous-version behavior, cancellation or streaming semantics, and what compatibility means within a version.
3. **Public/private boundary:** settle package export conventions and whether UIX needs tooling that verifies public protocol modules remain independent of provider implementation code.
4. **Distribution:** settle the recommended package layout, lock/pinning policy, Git-package conventions, and any later manifest source-acquisition mechanism.
5. **Capability runtime:** settle provider registration, optional client acquisition, one-versus-many provider cardinality, resource/provider binding, availability observation, failure semantics, and reload disposal.
6. **Transport projection:** settle how one capability registration produces in-process and remote routes without duplicating the existing channel registry or exposing provider callbacks across process boundaries.
7. **Document contract:** settle content representation, metadata, revisions, write preconditions, source provenance, update events, subscription scope, creation/deletion lifecycle, persistence, and conflict behavior.
8. **Resource coordinates:** settle canonical workspace, managed-document, calendar, and external-resource identities, including mutable cwd and hosted interpretation.
9. **Viewer matching:** settle selectors over scheme, media type, semantic protocol/kind, role, and resource-specific checks; settle default choice, explicit `Open With`, opening in multiple viewers, and persisted preferences.
10. **Viewer lifetime and instances:** settle whether viewer registration follows mounted surface lifetime or another feature lifetime, how hidden/unmounted surfaces become available, and how surface/view instance identity participates in opening and focus.
11. **Framework-neutral frontend API:** settle the plain workspace API and the boundaries of React or other framework adapters.
12. **Agent projection:** settle the minimum conventions for a capability provider to describe its semantic operations and changing resources to the Agent without automatically exposing all shared state.
13. **Permissions and trust:** settle whether capability invocation or resource access needs policy beyond the workspace's existing trust in manifest-loaded features.

## Provisional review units

The ordering is provisional; each unit stops for review before implementation details or the next unit are chosen.

### P0 — Protocol identity and authoring contract

Settle qualified identities, immutable versioning, the public protocol module boundary, and enough package distribution convention for two independently authored features to compile against one protocol. End with type-only examples and no runtime registry.

### P1 — Optional provider/client capability runtime

Settle and prove one minimal protocol registration and optional typed client path, including activation lifetime and schema validation. Reuse the existing channel machinery for transport projection rather than introducing a parallel wire format. Do not add document or viewer semantics in this unit.

### P2 — Shared document resource

Settle the smallest general document contract and prove that two independent consumers bound to one resource observe a committed update. Keep semantic document kinds, filesystem publication, history, and conflict sophistication out until separately decided.

### P3 — Framework-neutral resource viewers

Settle the viewer descriptor, live catalog, matching, and invocation contract. Prove that one resource may match multiple viewer implementations and that an originating feature can present and invoke those choices without importing either implementation. Do not assume a global context-menu UI.

### P4 — Host transport separation

Prove that canonical resource identity and capability/viewer APIs do not expose Electron delivery URLs. Establish the host seam that can provide Electron or hosted browser delivery without changing feature-facing identity.

### P5 — First product vertical

Choose a concrete vertical only after P0-P4 clarify the seams. Candidate proofs include a Chat resource link opened by source and rendered viewers or a semantic protocol consumed by a second feature; this plan does not select one yet.

## Explicitly outside the current agreement

This plan does not yet choose Monaco integration, file-browser structure, filesystem watching, automatic package fetching, layout/show-hide behavior, viewer UI styling, document snapshot/versioning implementation, generic Agent editing tools, or a standard UIX Calendar protocol. Those require separate discussion before they become requirements or build units.
