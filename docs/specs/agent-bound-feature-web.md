---
summary: "An Agent feature can provide typed web routes and static assets at substrate-bound addresses. Feature code declares contracts, and UIX derives relative paths, a bound client, and validated responses."
kind: reference
status: draft
implementation: incomplete
---

# Agent-bound feature web namespaces

## Contract

An _Agent-bound feature web namespace_ gives one Agent feature instance private web addresses for its assets and routes. A feature declares schema-only contracts once. Its browser content reaches those routes through derived relative paths, a bound typed client, and ordinary browser requests.

For each request, UIX resolves the originating connection's attachment to select the Agent and feature instance. UIX then validates declared input, invokes the matching handler, validates the declared response, and adapts the result onto the active host.

Requests and responses use ordinary finite web semantics. Electron may use its privileged protocol or localhost HTTP. The web host uses HTTP. Feature code does not depend on that transport choice.

## Dependencies

This specification depends on [`connection-agent-attachments.md`](./connection-agent-attachments.md) for Agent selection, accepted-request lifetime, retargeting, and revocation. It depends on [`agent-viewpoints.md`](./agent-viewpoints.md) for each feature instance's branch state and on [`web-host.md`](./web-host.md) for public origins, connection admission, and browser transport. It also follows the feature activation, lifetime, and TypeBox conventions.

## Boundary

The feature web namespace owns declared route and asset names, path matching, request and response codecs, response statuses, and active-route lifetime. UIX derives relative paths from each route contract and binds them to the attachment when a client or document needs a physical address.

The attachment selects the Agent feature instance and guards every accepted request. UIX mints a private web binding for each attachment-target generation and rotates it on retarget. The host encodes that binding and converts browser requests into the host-neutral web form.

Feature handlers own their reads, mutations, effects, and application behavior. Namespace isolation is lifecycle and correctness behavior, not a hostile-code boundary. The namespace does not define hydration, templates, components, application routing, rollback behavior, Agent working locations, or cross-feature protocols. HTMX, React, custom elements, and plain browser code are ordinary consumers.

## Requirements

### Scope and lifetime

- Every active Agent feature instance **must** receive its own feature-local web namespace.
- Identical route paths or asset paths from different features **must not** collide.
- Route contracts **must** be schema-only values that backend and browser code share.
- An authored contract **must not** include a feature identity. UIX **must** derive route and asset scope from the active feature contribution.
- A feature **must** admit its web contracts once at workspace feature activation.
- Each Agent feature factory **must** later contribute handlers bound to those admitted contracts.
- Features **must not** add or remove routes imperatively or choose an Agent target for a route.
- Active routes and assets **must** share the Agent feature generation's lifetime. UIX **must** remove them when it disposes that instance or generation.
- Feature reload **must** replace affected routes and assets without leaving old handlers reachable.
- New trusted backend source becomes active only through feature admission and reload. A browser request **must not** execute a source file merely by naming it.
- A feature **must not** treat another feature's private routes as an integration API. Features **must** publish a typed contract when they intend to integrate.

### Route contracts

- Each route contract **must** declare one HTTP method and a feature-relative path pattern.
- UIX **must** match and route declared path patterns so features do not have to implement their own router.
- A route pattern **may** provide a terminal wildcard when a feature deliberately routes a subtree itself.
- A route contract **must** separately declare TypeBox schemas for path parameters, query parameters, request headers, and body that it accepts.
- An absent input section **must not** cause browser input from that section to be accepted silently.
- The initial body codec is JSON. Form, multipart, and other body codecs are deferred until a concrete caller requires them.
- UIX **must** decode and validate serialized input before invoking feature code.
- Path mismatch, method mismatch, or invalid input **must not** invoke a handler.
- A handler **must** receive typed decoded params, query, headers, body, an `AbortSignal`, and its normal Agent feature-instance capabilities. It **must not** receive a raw transport request.
- HTTP method describes routing behavior. It does not prove that trusted handler code is a query, mutation, or effect.

### Responses

- Every route contract **must** declare the response statuses its handler may return.
- Each declared status **must** name one content descriptor and may declare permitted response headers.
- The content descriptors are complete HTML document, HTML fragment, plain text, and schema-backed JSON.
- An HTML-fragment response is a string with an HTML content type. UIX returns it unchanged and does not parse or validate it.
- A text response is a string with a plain-text content type.
- A JSON response **must** be validated against its TypeBox schema before encoding.
- A handler **must** return one declared status through a contract-bound responder. It **must not** construct a raw response object.
- The responder **must** require typed body and header values that match the declared status.
- UIX **must** encode the typed result into the host-neutral web response and apply host-owned header policy.
- Invalid input returns `400`, an unknown route returns `404`, and a method mismatch returns `405`. An unexpected handler or validation failure returns `500`.
- Dynamic responses default to `Cache-Control: no-store`.
- Responses are finite. SSE, WebSockets, and other indefinite streaming responses are outside this version.

### Complete HTML documents

- A complete HTML document response **must** establish the bound feature root as its effective base.
- UIX **must** inject one `<base href>` element into the document head before the browser resolves relative resources.
- UIX **must** remove or override any authored `<base href>` so a document cannot escape feature-relative addressing.
- The injected base is derived content. It is not authored content and enters no managed document or durable feature state.
- The base element is a browser document behavior, not an iframe behavior. Any full document loaded in a browser window uses it.
- An HTML fragment response receives no base processing. It inherits the base of its containing document.
- UIX **must** preserve same-document fragment navigation for links whose address starts with `#`.
- A feature that binds every URL through its client may choose a full-document route without base injection.

### Static assets

- A feature **may** declare one static asset root in its private namespace.
- Asset lookup **must** stay relative to that declared root and **must not** escape it.
- Static assets **must** share the Agent feature generation's lifetime, even when several generations use the same primary worktree.
- Static assets **may** use content-hash cache busting and immutable caching when their address names exact bytes.
- A future Agent worktree implementation **may** resolve the same logical asset location against a different physical root without changing authored browser content.

### Web binding

- UIX **must** mint a private web binding for each accepted attachment-target generation.
- The binding **must** let an independent browser request reach the attachment that owns it.
- The binding is not a security boundary. It protects retarget and close correctness, not hostile code.
- UIX **must** encode the binding physically through the host. A path token, custom-scheme location, or similar private form is acceptable.
- Feature contracts, handler input, authored content, and persisted state **must not** contain the binding.
- Feature code **must not** construct, validate, copy, or persist the binding.
- Browser code **may** observe the physical URLs UIX generates. It must not depend on the binding value.
- Retargeting **must** revoke the old binding and issue a replacement without a new physical connection.
- Requests accepted before revocation **must** finish against the recorded target. Requests presented afterward **must** be rejected.
- Closing the connection or attachment **must** permanently revoke its binding.
- Two attachments to the same Agent **must** have independent binding lifetimes.
- The namespace mechanism **must not** require a separate web server for each workspace, Agent, or feature.

### Browser access

- UIX **must** derive a typed relative path builder from each route contract.
- The relative path builder output **must** contain no host, workspace, session, attachment, or binding value. Authored and persisted content may use it.
- UIX **must** derive a bound typed client from each contract and the current binding.
- The bound client **must** expose a `url()` operation for markup and a `request()` operation for typed calls.
- `url()` **must** return a physical address usable in images, links, forms, iframes, scripts, and custom fetch calls.
- `request()` **must** send the declared method, typed headers and body, and return a typed status result with cancellation.
- A mounted surface **must** receive a feature-scoped client bound to its connection generation.
- A full browser document loads from a bound `url()`. Its injected base then binds ordinary relative requests to the same feature root.
- When the attachment retargets, UIX **must** recreate the bound clients, rerender mounted consumers, and reload affected documents through the new binding.
- Clients bound to the old generation **must** fail new requests rather than reach the new Agent.

## Conformance

A conforming implementation demonstrates these outcomes:

1. A schema-only contract yields a typed relative path builder, a bound client, and a contract-bound responder. Feature code writes no routing identity.
2. Two attachments target different Agents and invoke the same route. Each request reaches its own Agent feature instance.
3. Two features declare identical local paths without collision. Private routes do not become a cross-feature API.
4. Malformed path, query, header, or body input never invokes a handler. An invalid typed response is rejected before encoding.
5. A complete HTML document resolves authored relative links under the injected feature base. Fragment responses remain unchanged.
6. `url()` in markup and `request()` reach the same handler through both host transports.
7. Retargeting revokes the old binding for new requests. Accepted requests finish against their recorded Agent, and mounted clients are recreated.
8. Feature reload removes old routes and assets and exposes the replacement generation through the existing connection.

## Degrees of freedom

A conforming implementation may choose:

- Exact public API names and internal registry types.
- Physical binding encodings and whether Electron uses a custom scheme or localhost HTTP.
- The internal router, JSON codec, and base-injection mechanism.
- Whether several Agent bindings deduplicate identical immutable asset bytes.
- Static-file implementation and cache duration.

These choices must preserve declared routes, substrate-owned scope, automatic attachment binding, relative authored addresses, typed responses, and equivalent host behavior.

## Open questions

- When should common `ETag` and `If-Match` behavior become an automatic route capability instead of declared headers?
- Which full-document forms must base injection preserve beyond `#` fragment links?
- How should a feature opt out of base injection while keeping ordinary relative requests reachable?
- Which feature-source admission requirements must land before Agent-authored route changes can be activated conveniently?
