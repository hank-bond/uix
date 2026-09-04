---
summary: "Move Canvas document reads onto the first Agent-bound web route in nine small review units, ending with direct iframe loading through both hosts."
---

# Agent-bound Canvas document route

## Goal

Prove the first production path through the [Agent-bound feature web namespace specification](../docs/specs/agent-bound-feature-web.md). A Canvas iframe loads the selected Agent viewpoint's HTML from a typed, feature-local `GET` route.

The connection's attachment selects the Agent. No routing identity appears in the contract or request payload. Electron and the server use the same contract and handler. Retargeting issues a new private binding. Accepted requests finish against their original Agent, while retarget or close rejects later use of the old binding.

This plan covers only document reads. Writeback and prompt actions remain on their current channel and `postMessage` bridge. Each boundary keeps one read path and one write path. The final unit deletes the old Canvas read path.

## Dependency

[Substrate-scoped channel contracts](./archive/substrate-scoped-channel-contracts.md) have landed. Web routes use the same backend ownership rule: contracts contain local vocabulary, while UIX derives contribution scope from the Workspace and Agent factories. Channel surfaces declare every namespace they consume because they may target several providers. R1 web clients remain scoped to the mounted feature because cross-feature route consumption is outside this plan.

The completed channel migration established backend ownership and explicit frontend targeting. This plan now applies backend ownership to web routes while deriving the R1 browser target from its mounted feature.

## Progress

- The channel-contract dependency landed through `e7f7acd`.
- W1 is ready for review. `path-pattern.ts` now owns feature-relative pattern normalization and URL-part encoding and decoding. Resource routes wrap that codec while retaining their existing logical URLs and transport behavior. Focused API/runtime tests and `npm run check` pass.

## R1 boundary

The first route supports the production behavior needed by Canvas document loading:

```text
GET /documents/:key*
→ 200 complete HTML document
```

R1 includes:

- a schema-only route contract with typed path and query values
- Workspace-time contract admission and one handler per Agent feature instance
- one private binding per attachment-target generation
- guarded dispatch to the Agent instance selected when the request is accepted
- a feature-scoped browser `url()` capability
- equivalent Electron custom-protocol and server HTTP delivery
- complete-document base injection
- direct Canvas iframe loading
- removal of the `canvas.read` channel request and bootstrap HTML transfer

R1 excludes:

- web-route writes, request bodies, `ETag`, `If-Match`, revisions, and `412` handling
- typed `request()` calls, JSON, text, or HTML-fragment responses
- static asset roots, HTMX, and reusable Canvas assets
- worktree, source-file, or Git-diff routes
- code-review template presentation
- a general application router, middleware model, or permissions layer

Later work must extend this route shape rather than replace it. Body codecs, more response forms and statuses, and `request()` can build on the same declaration, responder, and binding model.

## Build invariants

- Each unit is one commit-sized concept, passes `npm run check`, and stops for review.
- Preparatory refactors preserve production behavior and add no compatibility path.
- Route declarations contain no routing identity.
- Browser code never constructs or persists a private binding.
- Each binding names one attachment-target generation.
- Revocation rejects new requests without cancelling accepted requests.
- Workspace resources and Agent-bound routes keep separate registries even when they share a host transport.
- Dynamic responses default to `Cache-Control: no-store`.
- Injected base and shim markup never enter stored Canvas HTML, anchored reads, or writeback.

## Review units

### W1: Extract the reusable path-pattern codec

Extract feature-relative path and query handling from logical resource-address encoding. Migrate `ResourceRoute` to the extracted codec without changing any `uix-resource://` URL or resource behavior.

This unit decides only the route-pattern vocabulary. It adds no methods, responses, Agent handlers, bindings, or browser APIs.

Likely ownership:

- `packages/api/src/resource-routes.ts`
- a focused path-pattern module under `packages/api/src/`
- existing resource-route tests plus focused codec tests

**Review gate:** Existing workspace and feature resource URLs remain byte-for-byte compatible. Existing codec cases still pass through the extracted implementation. They cover static and parameter routes, terminal wildcards, malformed encoding, absent or duplicate queries, and schema validation. No Agent-bound route type exists yet.

### W2: Admit GET document contracts and bind Agent handlers

Add the contract and contributions needed for a typed GET route with path/query schemas and one declared `200` complete-HTML response. The Workspace contribution admits the contract under its feature scope. Each Agent contribution binds that Agent's handler under the same scope.

Add a per-Agent route-handler registry beside the per-Agent channel registry. Canvas is the first caller. It declares `/documents/:key*` in shared code. Its Agent factory binds a handler that reads canonical HTML from that instance's `CanvasDocumentBuffer`. A contract-bound responder replaces raw `Response` construction.

This unit does not expose the route through a host. Focused registry tests invoke the admitted contract and Agent handler directly.

Likely ownership:

- a new author-contract module under `packages/api/src/`
- `packages/api/src/feature.ts`
- `packages/runtime/src/features/contributions.ts`
- `packages/runtime/src/agent/instance.ts`
- a focused Agent web route registry under `packages/runtime/src/`
- Canvas shared addressing and backend contributions

**Review gate:** The authored Canvas contract has no feature identity. Installation derives `canvas` from the active feature. Duplicate local routes fail atomically, and malformed keys never invoke the handler. Two independently constructed Canvas Agent instances return their own content through the same local contract.

### W3: Give attachments generation-scoped web bindings

Give each attachment target a private web binding. Retargeting acquires the next target before revoking the old binding. Closing the attachment revokes its current binding.

Expose only what a host needs to bootstrap and observe that binding. Keep token creation, validation, generation checks, and lookup private to the runtime. Do not reuse attachment, session, or Agent-instance identity as the binding.

This unit does not dispatch a route yet.

Likely ownership:

- `packages/runtime/src/workspace.ts`
- `packages/runtime/src/runtime.ts`
- a focused binding registry/value under `packages/runtime/src/`
- attachment lifecycle tests

**Review gate:** Two attachments to one Agent have independent bindings. Retarget emits one replacement generation without changing the physical connection. Closing or retargeting removes the old generation from lookup. A target guard retained before the transition remains usable. Binding values never enter feature context or route payloads.

### W4: Dispatch through the retained Agent

Resolve a live binding and retain its selected Agent instance. Then match the feature-local contract, validate path/query input, invoke that Agent's handler, and validate its result. Dispatch returns a host-neutral web result, below physical URL and browser response handling.

Return `400` for invalid declared input and `404` for an unknown route or revoked binding. Return `405` for a method mismatch and `500` for an unexpected handler or response failure. R1 supports only the declared successful complete-document result. Later response forms remain deferred.

**Review gate:** Direct runtime tests invoke the same Canvas route through two attachment bindings and receive different Agent documents. A request accepted before retarget completes against the old retained instance. The same old binding is rejected afterward, and the replacement reaches the new instance. Handler failure disposes every retained operation guard.

### W5: Adapt bound routes onto the shared content transport

Carry Agent web dispatch through the existing content transport while keeping `ResourceRegistry` responsible for workspace resources. Workspace resource contributions remain attachment-free. Runtime composition chooses the resource or Agent-bound path before calling the host transport.

The host supplies the physical feature root for a complete document. Shared adaptation injects that root as the effective base and produces the browser `Response`. The feature handler never sees the physical address. Tests use a synthetic root until the Electron and server units provide real ones. This prevents custom-scheme URLs from leaking into server HTML.

**Review gate:** Existing workspace resource URLs and responses remain unchanged. A bound logical request reaches Agent dispatch through the same registered content transport. Given a synthetic physical feature root, complete-document adaptation injects that root. Authored or duplicate base elements cannot redirect relative resolution.

### W6: Add the feature-scoped browser URL client

Add a framework-neutral URL client and the React adapter used by current surfaces. The client combines a route, typed values, the mounted feature's scope, and the host's current binding. Its synchronous `url()` returns a browser address.

A target change replaces the bound client and rerenders its consumers. An old client remains tied to its revoked binding. Keep this separate from the connection generation used for server reconnection.

Do not add `request()` yet. Do not let a surface name its own feature id. Cross-feature route consumption remains outside R1.

Likely ownership:

- the new API route module
- `packages/api/src/workspace.ts` or its eventual focused browser submodule
- `packages/client/src/workspace/surface-host.tsx`
- focused browser-client and surface-mount tests

**Review gate:** A Canvas surface can derive a typed document URL without providing `canvas`, a workspace id, session id, or binding token. A retained client from an old target generation produces only its old, revoked address. A binding update recreates the mounted client without remounting the whole workspace. It does not conflate target change with physical reconnection.

### W7: Carry bindings through the Electron host

Teach the Electron attachment/window composition and preload-backed workspace client to bootstrap the current binding before the shared workspace client mounts. Deliver later binding-generation changes over an Electron-owned control path, update the browser binding snapshot, and rerender bound consumers.

The Electron adapter maps the host-neutral bound route onto the privileged `uix-resource` protocol. It supplies its physical feature root to complete-document adaptation. The process-wide resource transport still acquires a workspace guard and delegates semantic dispatch to the runtime. It does not interpret feature contracts or select an Agent itself.

This unit proves the host path through the Canvas document route but does not switch the iframe yet.

**Review gate:** An Electron renderer URL reaches the attachment-selected Canvas route through the privileged protocol. Retarget updates the renderer binding before bound consumers render again. The previous URL fails, and window close revokes the route. Existing workspace resource and surface-module URLs remain unchanged.

### W8: Carry bindings through the server host

Include the initial binding in the accepted WebSocket bootstrap and add one server-owned control message for later target-generation changes. The browser WebSocket adapter updates its binding snapshot without replacing the socket. Map bound logical addresses to workspace-qualified HTTP locations while keeping the binding opaque.

An HTTP request continues to acquire its own workspace guard. It then presents the binding and server-encoded physical feature root to runtime dispatch. It must not create a second attachment or infer an Agent from the workspace/session URL. Origin policy, response hardening, and CORS remain server-owned.

This unit proves the host path through the Canvas document route but does not switch the iframe yet.

**Review gate:** A browser URL reaches the attachment-selected Canvas route over HTTP. Two connections to different sessions receive their own content. Retarget on the existing WebSocket updates only that connection's binding. The old HTTP URL fails, and accepted HTTP work drains under its retained guards. Existing workspace content URLs remain unchanged.

### W9: Move Canvas reads onto the document route

Switch the Canvas iframe from the workspace-scoped static bootstrap resource to its bound document `url()`. The Canvas handler serves canonical authored HTML with the existing browser shim injected as derived markup. The substrate injects the bound base. The iframe no longer waits for a parent `canvas:load` message.

Keep the current writeback and prompt messages. The parent still validates expected iframe source/origin, persists through `canvas.writeback`, and submits prompts through `agent.prompt`. Update serialization so both the injected base and injected shim are omitted from writeback. Reject an authored `<base href>` during Canvas canonicalization.

Delete the workspace Canvas iframe resource and all `canvas.read` request code. Also delete the ready/load message vocabulary and obsolete bootstrap code. `canvas.changed` still invalidates the selected key and causes the iframe to load the current bound document again.

**Review gate:**

- Canvas document bytes never cross a channel request or parent `postMessage` load.
- Electron and server both load the selected Agent's Canvas directly in the iframe.
- Two attachments targeting different sessions render different `main` documents.
- Agent writes still publish invalidation and reload the direct document URL.
- Human writeback and trusted prompt actions retain their existing behavior.
- Injected base and shim markup never enter the managed document, anchored tool output, or subsequent writeback.
- The old Canvas read/resource path is deleted rather than retained as compatibility.
- Focused API, runtime, host, browser, and Canvas tests pass, followed by `npm run check`.

## Documentation at the owning unit

Update source summaries and generated indexes with the unit that adds or removes each owner. W9 updates the current architecture and Canvas implementation documentation. It describes direct Agent-bound document loading. The broader specifications remain marked `implementation: incomplete` because writeback routes, static assets, additional codecs, and `request()` remain outstanding.

Do not publish a general route-authoring how-to from R1. The public feature web namespace is still intentionally narrow. Add that guide when a second route shape proves the API beyond complete-document GET.

## After R1: code-review template iteration

After R1, a separate Canvas-template loop can start with embedded review fixtures and inline styles/scripts. It should shape the code-review document before UIX standardizes live data routes or reusable components.

A live source or Git-diff route is not part of R1. It should wait until `AgentFeatureContext` exposes the viewpoint's worktree root. It can then arrive with its first code-review caller. Static assets and HTMX can follow when the template first extracts repeated code or loads a fragment. Do not guess them inside the document-route commit.
