---
summary: "Canvas reads now use viewpoint web routes in both hosts, with direct iframe loading and reviewed reload and query-validation fixes."
status: landed
---

# Viewpoint Canvas document route

Completed and archived after W1–W9 and the R1 audit fixes. Final verification passed with 1027 tests and three skipped tests. The final audit commit is `68daa88`.

## Goal

Prove the first production path through the [viewpoint web namespace specification](../../docs/specs/viewpoint-web-namespaces.md). A Canvas iframe loads the selected Agent viewpoint's HTML from a typed, feature-local `GET` route.

The connection's attachment selects the Agent. No routing identity appears in the contract or request payload. Electron and the server use the same contract and handler. Retargeting issues a new private binding. Accepted requests finish against their original Agent, while retarget or close rejects later use of the old binding.

This plan covers only document reads. Writeback and prompt actions remain on their current channel and `postMessage` bridge. Each boundary keeps one read path and one write path. The final unit deletes the old Canvas read path.

## Dependency

[Substrate-scoped channel contracts](./substrate-scoped-channel-contracts.md) have landed. Web routes use the same backend ownership rule: contracts contain local vocabulary, while UIX derives contribution scope from the Workspace and Agent factories. Channel surfaces declare every namespace they consume because they may target several providers. R1 web clients remain scoped to the mounted feature because cross-feature route consumption is outside this plan.

The completed channel migration established backend ownership and explicit frontend targeting. This plan now applies backend ownership to web routes while deriving the R1 browser target from its mounted feature.

The route work also exposed older channel names that describe an Agent instead of their viewpoint scope. `AgentInstance` also has two paths to the same channel registry. [`viewpoint-channel-naming.md`](../viewpoint-channel-naming.md) records that independent cleanup. It follows the new scope-naming guidance but does not block this plan.

## Progress

- The channel-contract dependency landed through `e7f7acd`.
- W1 landed in `96d3c71`. `path-pattern.ts` now owns feature-relative pattern normalization and URL-part encoding and decoding. Resource routes wrap that codec while retaining their existing logical URLs and transport behavior.
- W2 landed in `ba6f123`. `@uix/api` now defines schema-only `GET` document contracts with typed path and query input, inferred handlers, and contract-bound responders. Runtime admission intentionally supports only the R1 `GET` → `200` complete-document behavior. Workspace activation derives the feature namespace, each Agent instance owns its handler registry, and Canvas binds `/documents/:key*` to its viewpoint-local document buffer.
- W3 landed in `415f0c2`. Every accepted attachment now exposes one opaque `AttachmentWebBinding` for its current target generation and notifies host observers of replacements. The runtime-private binding registry retains the exact Agent generation, rejects revoked values, and lets already-retained target guards outlive retarget or close. Retarget acquires and registers the replacement before revoking the previous binding. Peers remain independent.
- W4 landed. The workspace runtime's web dispatch retains the Agent generation named by a live binding. It validates the feature-local route, invokes that instance's handler under a tracked operation, and returns a host-neutral response. Direct runtime coverage proves independent Canvas documents, status mapping, retarget behavior, revoked-binding rejection, replacement dispatch, and failure cleanup.
- W5 is complete. The shared content handler and host registrars remain. HTML route admission enforces shallow literal paths, and viewpoint dispatch rejects directory aliases without changing resource matching. Canvas uses `/view` with required typed `key` query input, including nested keys. Routes omit unused input schemas rather than declaring empty objects, and omitted path and query schemas produce empty handler input objects. One admission schema owns declaration structure and the derived author-facing type. Admission preserves authored input schemas and their refinements, rejects unsupported fields, and reports schema failures by input location. Response adaptation returns the handler's body unchanged with content type and cache headers. The document-address type, HTML processing module, base injection, and fragment rewriting are deleted. Verification: `npm run check` passed, including 895 passing tests and 3 skipped tests. Physical URL construction and validation remain in W6 through W8.
- W6 landed on 2026-09-05. `@uix/api` derives typed directory-relative references and immutable `WebRouteClient` instances whose `toUrl()` validates a host-provided physical feature root. The shared workspace mount accepts a host-owned `AttachmentWebRootsObservable` that changes independently of connection recovery. Each surface receives a route provider scoped internally to its feature id and the current roots snapshot. Feature code supplies only its shared contract and typed values. Retained clients keep their old physical roots. Electron and server do not provide these roots until W7 and W8. Verification: `npm run check` passed with 900 tests passing and 3 skipped.
- W7 is complete and reviewed.
  - **Binding control:** Electron provides initial and replacement binding snapshots through a separate host-only control path. A schema defines their structure, and preload validates each snapshot. The renderer subscribes before reading the initial snapshot, rejects older revisions, and starts the shared workspace client with the resulting feature roots.
  - **Addressing:** Physical roots use `uix-resource://{feature}.viewpoint.{workspace}/{binding}/`. Workspace resource and surface-module addresses remain unchanged. The encoder uses the substrate's feature-id grammar. The protocol adapter rejects alternate page directories, acquires a workspace guard, and passes viewpoint requests to the workspace runtime for dispatch.
  - **Cleanup:** The renderer page owns the roots observable from creation, including during the initial read. The Playwright test owns its cleanup through a disposal stack. Tests cover malformed control data and disposal while the initial read is pending.
  - **Browser coverage:** Playwright launches the real Electron host with production Canvas and Chat alongside a test-only Canvas route surface. Assertions cover rendered styles, native relative and fragment links, target changes without surface remounting, and revocation after retarget or window close. A feature with an underscore in its id also mounts without declaring web routes. Production Canvas reads remain unchanged.
  - **Convention changes:** State and observable names describe their roles. The shared API validator establishes the `FeatureWebRootUrl` brand, which the host encoder, roots observable, surface provider, and route client preserve. Type tests reject arbitrary strings and unrelated address brands. Validation tests cover web-host and custom-scheme roots, malformed input, and browser normalization.
  - **Checks:** The `npm run check` command passed with 959 tests passing and three skipped. That command includes the Playwright test, which writes a screenshot to `out/test-results/electron-viewpoint.png`.

- W8 is complete and reviewed.
  - **Binding control:** The server includes the initial binding in WebSocket `ready` and sends ordered `web_binding` control messages on target changes. Browser roots update before channel traffic and before reconnect recovery notifications. Retarget does not replace the socket or advance its connection version. Stale socket messages cannot replace roots.
  - **Addressing:** Physical roots use `/workspaces/:workspace/viewpoints/:binding/:feature/` under the configured public origin. One content transport dispatches resources and viewpoint requests. Each HTTP request owns a workspace guard. Runtime dispatch retains the binding-selected Agent. Shallow-page validation rejects alternate directories and URL-parser aliases, while resource locations remain unchanged.
  - **Cleanup and policy:** WebSocket setup owns its subscriptions and heartbeat through one disposable acquisition. The shared HTTP boundary retains its existing cache, hardening, and configured-origin CORS policy. An HTTP client that leaves during handler execution no longer strands a workspace guard after its response close event has already fired.
  - **Browser coverage:** Playwright launches the built server with production Canvas and Chat and a test-only Canvas route surface. It proves independent sessions and binding lifetimes, same-socket retarget without surface remounting, and revoked URLs. Native relative and dynamic fragment links work without changing canonical HTML bytes. Accepted reads complete against their original Agent after retarget or close. Production Canvas reads remain unchanged.
  - **Convention review:** HTTP requests and workspace pages compose cleanup in disposal stacks. Regression tests prove that failed unmounts and subscriptions do not interrupt remaining cleanup. URL inputs use a declared structural schema, while encoded roots preserve the shared brand. Names distinguish operations, capabilities, and state. Browser fixtures pair listeners and timers with cleanup and use a native input label.
  - **Workspace page naming:** `openWorkspacePage()` opens the page's stateful browser integration without navigating. Its returned `workspacePage` owner and internal `pageLifetime` span session navigation and physical WebSocket replacements. The module and test use the `workspace-page` basename. The `acquisition` stack remains the initial rollback and ownership-transfer scope.
  - **Simplification:** The WebSocket binder derives its complete initial message from the attachment instead of accepting separately assembled target fields. All wire message types and the server-message union derive from their declared schemas.
  - **Checks:** `npm run check` passed with 997 tests passing and three skipped, including both hosts' Playwright tests.

- W9 is complete and reviewed.
  - **Production reads:** Canvas uses its feature-scoped document client for the iframe `src`. Key invalidation and target replacement reload that URL without transferring HTML through a read channel or parent load message.
  - **Derived markup:** The Canvas handler inserts its self-removing shim into a served copy, preserving every authored byte. The shim removes itself before authored scripts run. Canonicalization rejects authored `<base href>` elements, including those inside templates.
  - **Writeback:** The existing parent bridge retains source and origin checks, human writeback, and trusted prompt ordering. Effect cleanup rejects pending prompt continuation after viewpoint replacement or unmount.
  - **Removal:** The Canvas static resource, address helpers, read request and handler, ready/load vocabulary, and bootstrap module are deleted. Runtime tests now read through viewpoint routes.
  - **Browser coverage:** Both hosts exercise production Canvas for `main` and a nested key. Test controls invoke the real Agent write tool, proving invalidation-driven refresh. The server proves independent `main` documents across attachments. Both hosts prove native fragment navigation, human form writeback, shim removal, scripted-click rejection, and trusted prompt forwarding. Prompt completion uses a fixture receiver rather than starting a model run. The existing Lightpanda smoke assertion now expects the document route without changing test frameworks.
  - **Documentation:** Current architecture, Canvas implementation guidance, the resource guide, and server documentation describe direct document loading. Broader specifications remain incomplete.
  - **Convention review:** The iframe message schema owns its wire type and structural validation. The non-throwing refinement uses the `as` prefix. Naming, private exports, branded fixture keys, matching host contract names, and authoring prose follow the repository rules. One disposable page lifetime owns shim listeners, timers, and its explicit writeback trigger. Non-persisted page exit disposes them, while a browser-cached document retains its lifetime. A focused Chromium test proves that disposal cancels pending trusted prompts and writeback and stops subsequent input handling. Its DOM-aware TypeScript configuration remains separate from backend-only tests.
  - **Checks:** `npm run check` passed with 1013 tests passing and three skipped, including both hosts' Playwright tests and the shim lifetime test. Screenshots remain in `out/test-results/` for review.

### R1 audit fixes · complete and reviewed

- Web handlers now acquire independent reload guards through the same owner as Agent turns and feature-channel handlers. Reload rejects while a guard is held, and guard acquisition rejects during reload. Regression tests cover successful and failed web operations, guard cleanup, replacement handlers, and unchanged attachment bindings after reload.
- Guard naming now distinguishes `ThingGuard` against disposal from `ActionGuard` against the named action. Handler and turn code uses `acquireReloadGuard()` rather than `acquireOperation()`. Tracked operations remain responsible for cancellation and completion. They are not permits or guards. The conventions record this distinction, and [`backlog.md`](../backlog.md#guard-naming-forms) tracks the broader naming audit separately.
- `WorkspaceRuntime` now owns reload guards and its serialized reload pipeline directly. The Agent runtime receives only guard acquisition. `ReloadAdmission` and the reload coordinator are deleted. Runtime tests cover active turns and handlers, guard disposal, queued reloads, restoration ordering, and recovery after reload failure. The focused `runtime-reload.test.ts` suite drives canonical dispatch through the real workspace owner. Test-only collaborator spies control commit, load, Agent replacement, Pi reload, and restoration failures. A throwing runtime listener exercises publication failure. It restores the former coordinator's failure matrix, cleanup aggregation, independent guard disposal, and exclusion through publication without adding production seams. [`lifetimes.guard-authority`](../../docs/architecture/conventions/rules/lifetimes.guard-authority.md) establishes this ownership rule.
- The attachment implementation, target-state helper, owner interface, and attachment logger now reside in [`attachment.ts`](../../packages/runtime/src/attachment.ts). Workspace composition retains attachment creation and collection ownership. The moved implementation and owner interface match their prior forms apart from module exports, and existing runtime and host tests exercise the extracted path.
- Query decoding preserves prototype-named keys in a prototype-free dictionary until validation. Undeclared `__proto__` input and duplicate keys return `400` instead of disappearing. Tests cover omitted and strict query schemas, encoded names, and rejection before handler invocation.
- **Convention review:** Reload authority and guard tracking share one owner. Agent consumers receive only guard acquisition, and tracked operations retain cancellation and completion ownership. Internal exports have named consumers, and no production injection exists solely for tests. New Boolean names use predicate forms. The focused test harness composes rollback, temporary-directory removal, attachment disposal, and listener cleanup in a disposal stack. Integration fixtures pair temporary global state and prepared dispatch with cleanup, and blocked operations complete even when assertions fail. Historical log entries retain their original wording. Deferred guard-naming migration remains separately tracked.
- `npm run check` and uncached `npm run lint` passed after guard-owner consolidation, reload-test migration, and attachment extraction. The suite has 1027 tests passing and three skipped, including both hosts' browser tests. The other coverage gaps identified by the audit remain outside these two selected fixes.

The rule in [`naming.host-role.md`](../../docs/architecture/conventions/rules/naming.host-role.md) governs names introduced in W7 and subsequent units. W7 also applies the constrained-string rule to the `FeatureWebRootUrl` type. The remaining host-name and constrained-string migrations are unscheduled entries in [`backlog.md`](../backlog.md#convention-migrations). Select those repository-wide audits independently of this plan.

## Testing choice

Use Playwright for browser and Electron coverage in this plan. Migrating existing Lightpanda tests is outside W7 through W9.

The W8 test uses Playwright's Chromium. Install it with `npx playwright install chromium`. It builds and launches an isolated server distribution and writes `out/test-results/server-viewpoint.png` for review.

The W7 test uses Electron's Chromium and records screenshots for review, not as pixel-diff baselines. The test launches hidden windows by default and asserts their visibility state. Set the `UIX_ELECTRON_TEST_SHOW_WINDOW` environment variable to `1` to display the window for debugging.

## R1 boundary

The first route supports the production behavior needed by Canvas document loading:

```text
GET /view?key=reports/main
→ 200 complete HTML response body
```

R1 includes:

- a schema-only route contract with typed path and query values
- Workspace-time contract admission and one handler per Agent feature instance
- one private binding per attachment-target generation
- guarded dispatch to the Agent instance selected when the request is accepted
- a feature-scoped browser `toUrl()` capability
- equivalent Electron custom-protocol and server HTTP delivery
- admission-enforced shallow `html-document` routes with content selection in typed query input
- native relative URL resolution from the bound page URL, without substrate HTML rewriting
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
- Workspace resources and viewpoint routes keep separate registries even when they share a host transport. This is the current migration boundary, not a permanent resource architecture. Branch-local app generation ownership must precede that migration.
- Dynamic responses default to `Cache-Control: no-store`.
- An `html-document` response kind requires `/` or one literal, non-dot path segment, with no trailing slash except for `/` itself.
- The physical complete-page URL's containing directory equals the bound feature root.
- The substrate returns the handler's HTML body unchanged. It adds no base, rewritten links, or addressing cleanup markers.
- Canvas-derived shim markup never enters stored Canvas HTML, anchored reads, or writeback.

## Review units

### W1: Extract the reusable path-pattern codec

Extract feature-relative path and query handling from logical resource-address encoding. Migrate `ResourceRoute` to the extracted codec without changing any `uix-resource://` URL or resource behavior.

This unit decides only the route-pattern vocabulary. It adds no methods, responses, Agent handlers, bindings, or browser APIs.

Likely ownership:

- `packages/api/src/resource-routes.ts`
- a focused path-pattern module under `packages/api/src/`
- existing resource-route tests plus focused codec tests

**Review gate:** Existing workspace and feature resource URLs remain byte-for-byte compatible. Existing codec cases still pass through the extracted implementation. They cover static and parameter routes, terminal wildcards, malformed encoding, absent or duplicate queries, and schema validation. No viewpoint route type exists yet.

### W2: Admit GET document contracts and bind viewpoint handlers

Add the contract and contributions needed for a typed GET route with path/query schemas and one declared `200` complete-HTML response. The Workspace contribution admits the contract under its feature-derived namespace. Each Agent contribution binds a handler in that viewpoint's registry under the same namespace.

Add a per-viewpoint route-handler registry beside the per-Agent channel registry. Canvas is the first caller. This unit landed with `/documents/:key*` in shared code. W5 migrates that declaration and its consumers to `/view` with typed `key` query input. Its Agent factory binds a handler that reads canonical HTML from that instance's `CanvasDocumentBuffer`. A contract-bound responder replaces raw `Response` construction.

This unit does not expose the route through a host. Focused registry tests invoke the admitted contract and Agent handler directly.

Likely ownership:

- a new author-contract module under `packages/api/src/`
- `packages/api/src/feature.ts`
- `packages/runtime/src/features/contributions.ts`
- `packages/runtime/src/agent/instance.ts`
- a focused web route registry under `packages/runtime/src/`
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

Resolve a live binding and retain its selected Agent instance. Then match the feature-local contract, validate path/query input, invoke that Agent's handler, and validate its response. Dispatch returns a host-neutral web response, below physical URL and browser response handling.

Return `400` for invalid declared input and `404` for an unknown route or revoked binding. Return `405` for a method mismatch and `500` for an unexpected handler or response failure. R1 supports only the declared successful complete-document result. Later response forms remain deferred.

**Review gate:** Direct runtime tests invoke the same Canvas route through two attachment bindings and receive different Agent documents. A request accepted before retarget completes against the old retained instance. The same old binding is rejected afterward, and the replacement reaches the new instance. Handler failure disposes every retained operation guard.

### W5: Adapt shallow HTML routes onto the shared content transport

Retain one host-owned content transport and the workspace runtime's registered content handler. Runtime composition dispatches each host-decoded request to either the workspace resource registry or the viewpoint route registry. Workspace resource contributions remain attachment-free, and their responses remain unchanged.

Enforce the complete-page path restriction when admitting any contract with an `html-document` response. Accept `/` and one literal, non-dot segment such as `/view`. Reject nested paths, path parameters, wildcards, and trailing slashes other than `/` itself. Preserve general path-pattern support for resource routes and response kinds without this restriction.

Migrate the Canvas declaration and handler to `/view` with a required typed `key` query value. Make unused path schemas optional and omit Canvas's empty `params` declaration. Preserve typed inference and reject undeclared input when schemas are absent. Migrate registry fixtures and runtime tests with it, including invalid-query coverage and retained-request tests. Delete the old `/documents/:key*` declaration rather than retaining it as a second read path.

Remove the uncommitted HTML parse and serialize pass, base injection, fragment-link rewriting, and cleanup markers. Delete `WebDocumentAddress`, `toWebDocumentHtml`, and their processing module rather than renaming them into another document abstraction. Retain `html-document` as a response-kind discriminator. Response adaptation sets the status, HTML content type, and `no-store` policy while returning the handler's body unchanged. Physical URL data belongs at URL construction and validation boundaries, not in response-body processing.

**Review gate:**

- Existing workspace resource URLs, response bodies, and headers remain unchanged through the shared content entry.
- Invalid complete-page route declarations fail feature activation with an actionable error.
- One schema owns declaration structure and the derived author type. Invalid declarations roll back both contract and handler contribution groups. Admission does not execute or rewrite nested input schemas. Path semantics remain explicit checks.
- Nested Canvas keys are query values, not path segments. Missing, malformed, or duplicate key query values never invoke the handler.
- A bound logical request reaches the selected Agent through the registered content transport. Retarget, close, and accepted-request behavior remain unchanged. Directory aliases such as `/view/` do not reach the page handler.
- The returned HTML body equals the handler's body, including its whitespace, relative URLs, and fragment links. No physical address enters that body through substrate processing.
- Focused tests pass, followed by `npm run check`.

### W6: Add the feature-scoped browser URL client · **landed 2026-09-05**

Add a framework-neutral URL client and the React adapter used by current surfaces. The client derives a browser address from a route, typed values, the mounted feature's scope, and the host's current binding. Its synchronous `toUrl()` returns that address. Complete-page URL construction validates that the browser-resolved containing directory equals the bound feature root. Relative path builders return directory-relative references, not origin-rooted paths.

A target change replaces the `WebRouteClient` and rerenders its consumers. An old client remains tied to its revoked binding. Keep this separate from the connection generation used for server reconnection.

Do not add `request()` yet. Do not let a surface name its own feature id. Cross-feature route consumption remains outside R1.

Likely ownership:

- the new API route module
- `packages/api/src/workspace.ts` or its eventual focused browser submodule
- `packages/client/src/workspace/surface-host.tsx`
- focused browser-client and surface-mount tests

**Review gate:** A Canvas surface can derive a typed document URL without providing `canvas`, a workspace id, session id, or binding token. A retained client from an old target generation produces only its old, revoked address. A binding update recreates the mounted client without remounting the whole workspace. It does not conflate target change with physical reconnection. Synthetic host addresses demonstrate that `assets/site.css`, `api/data`, `#details`, and `?key=other` use native URL resolution correctly, including nested key values in the query. A nonconforming physical complete-page address is rejected rather than corrected through HTML processing.

### W7: Connect viewpoint web routes through the Electron host

**Status:** Complete and reviewed.

Read the current binding for each attached Electron window before starting the shared workspace client. Send later binding changes through an Electron-owned control path. Replace the renderer's feature-root snapshot before notifying route consumers.

The Electron adapter maps the host-neutral bound route onto the privileged `uix-resource` protocol. A complete-page URL is the bound feature root or one literal segment beneath it, with content selection in the query. The adapter preserves that layout when decoding requests and rejects alternate page locations that violate it. The process-wide resource transport still acquires a workspace guard and delegates semantic dispatch to the runtime. It does not interpret feature contracts or select an Agent itself.

This unit proves the host path through the Canvas document route but does not switch the iframe yet.

**Review gate:** An Electron renderer URL reaches the attachment-selected Canvas route through the privileged protocol. Retarget updates the renderer binding before bound consumers render again. The previous URL fails, and window close revokes the route. Existing workspace resource and surface-module URLs remain unchanged. Complete pages resolve directory-relative requests and same-page fragments natively without base injection. A nested Canvas key does not change their resolution directory.

### W8: Carry bindings through the server host

**Status:** Complete and reviewed.

Include the initial binding in the accepted WebSocket bootstrap and add one server-owned control message for later target-generation changes. The browser WebSocket adapter updates its binding snapshot without replacing the socket. Map bound logical addresses to workspace-qualified HTTP locations while keeping the binding opaque.

An HTTP request continues to acquire its own workspace guard. It then presents the host-decoded binding, feature namespace, local path, and query to runtime dispatch. Complete-page URLs retain the bound feature root as their containing directory. The host rejects alternate page locations that violate that relationship. It must not create a second attachment or infer an Agent from the workspace/session URL. Origin policy, response hardening, and CORS remain server-owned.

This unit proves the host path through the Canvas document route but does not switch the iframe yet.

**Review gate:** A browser URL reaches the attachment-selected Canvas route over HTTP. Two connections to different sessions receive their own content. Retarget on the existing WebSocket updates only that connection's binding. The old HTTP URL fails, and accepted HTTP work drains under its retained guards. Existing workspace content URLs remain unchanged. Native browser resolution matches the Electron host for nested query keys, directory-relative references, and `#` links, including links added after page load.

### W9: Move Canvas reads onto the document route

**Status:** Complete and reviewed.

Switch the Canvas iframe from the workspace-scoped static bootstrap resource to its bound document `toUrl()`. The Canvas handler serves canonical authored HTML with the existing browser shim injected as derived markup. The shallow page URL establishes native relative addressing without substrate body processing. The iframe no longer waits for a parent `canvas:load` message.

Keep the current writeback and prompt messages. The parent still validates expected iframe source/origin, persists through `canvas.writeback`, and submits prompts through `agent.prompt`. Keep the Canvas-derived shim out of writeback. No substrate base or rewritten fragment attributes need cleanup. Reject an authored `<base href>` during Canvas canonicalization as a Canvas authoring rule, not a substrate response transformation.

Delete the workspace Canvas iframe resource and all `canvas.read` request code. Also delete the ready/load message vocabulary and obsolete bootstrap code. `canvas.changed` still invalidates the selected key and causes the iframe to load the current bound document again.

**Review gate:**

- Canvas document bytes never cross a channel request or parent `postMessage` load.
- Electron and server both load the selected Agent's Canvas directly in the iframe.
- Two attachments targeting different sessions render different `main` documents.
- Agent writes still publish invalidation and reload the direct document URL.
- Human writeback and trusted prompt actions retain their existing behavior.
- The substrate adds no base, rewritten fragment addresses, or addressing cleanup markers. Canvas-derived shim markup never enters the managed document, anchored tool output, or subsequent writeback.
- Nested Canvas keys in the query preserve directory-relative addressing. Same-page fragment links work both in the initial HTML and when added by scripts or inserted fragments.
- The old Canvas read/resource path is deleted rather than retained as compatibility.
- Focused API, runtime, host, browser, and Canvas tests pass, followed by `npm run check`.

## Documentation at the owning unit

Update source summaries and generated indexes with the unit that adds or removes each owner. W9 updates the current architecture and Canvas implementation documentation. It describes direct viewpoint document loading. The broader specifications remain marked `implementation: incomplete` because writeback routes, static assets, additional codecs, and `request()` remain outstanding.

Do not publish a general route-authoring how-to from R1. The public feature web namespace is still intentionally narrow. Add that guide when a second route shape proves the API beyond complete-document GET.

## After R1: code-review template iteration

After R1, a separate Canvas-template loop can start with embedded review fixtures and inline styles/scripts. It should shape the code-review document before UIX standardizes live data routes or reusable components.

A live source or Git-diff route is not part of R1. It should wait until `AgentFeatureContext` exposes the viewpoint's worktree root. It can then arrive with its first code-review caller. Static assets and HTMX can follow when the template first extracts repeated code or loads a fragment. Do not guess them inside the document-route commit.

## Attempt notes

### W5: base injection replaced by shallow page routes

- **Worked:** The shared content transport separates host delivery from resource and viewpoint dispatch. Retained-Agent dispatch and host-neutral response adaptation remain useful.
- **Did not work:** Base injection required fragment-link rewriting and writeback markers. Serve-time rewriting did not cover links added later by scripts or inserted fragments, and parsing and serializing the body changed more than addressing.
- **Requirement change:** Complete-page routes use `/` or one literal segment and select content through typed query input. Native page URL resolution retains the viewpoint binding without substrate body rewriting. The specification retains `html-document` as a response kind, not a document identity or persistence abstraction.
- **Outcome:** W5 is complete. The shared path codec tolerates empty segments for resources, so viewpoint dispatch separately rejects page-directory aliases. Tests cover feature-activation rejection, contribution rollback, nested query keys, revoked bindings, retained requests, and unchanged HTML response bytes.
- **Pending:** W6 validates generated complete-page addresses, and W7 and W8 prove the concrete host mappings. Canvas shim processing and authored-base rejection remain feature responsibilities.
