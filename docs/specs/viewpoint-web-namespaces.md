---
summary: "A feature can provide typed web routes and static assets in each viewpoint through substrate-bound addresses. Contracts remain generic while installation establishes namespace and scope."
kind: reference
status: draft
implementation: incomplete
---

# Viewpoint web namespaces

## Contract

A _viewpoint web namespace_ gives one feature instance at an Agent viewpoint private web addresses for its assets and routes. A feature declares schema-only contracts once. Its browser content reaches those routes through derived relative paths, a typed browser route capability, and ordinary browser requests.

For each request, UIX resolves the originating connection's attachment to select the Agent and feature instance. UIX then validates declared input, invokes the matching handler, validates the declared response, and adapts the result onto the active host.

Requests and responses use ordinary finite web semantics. Electron may use its privileged protocol or localhost HTTP. The web host uses HTTP. Feature code does not depend on that transport choice.

## Dependencies

This specification depends on [`connection-agent-attachments.md`](./connection-agent-attachments.md) for Agent selection, accepted-request lifetime, retargeting, and revocation. It depends on [`agent-viewpoints.md`](./agent-viewpoints.md) for each feature instance's branch state and on [`web-host.md`](./web-host.md) for public origins, connection admission, and browser transport. It also follows the feature activation, lifetime, and TypeBox conventions.

## Boundary

The viewpoint web namespace owns declared route and asset names, path matching, request and response codecs, response statuses, and active-route lifetime. UIX derives relative paths from each route contract and binds them to the attachment when a client or document needs a physical address.

The attachment selects the Agent feature instance and guards every accepted request. UIX mints a private web binding for each attachment-target generation and rotates it on retarget. The host encodes that binding and converts browser requests into the host-neutral web form.

Feature handlers own their reads, mutations, effects, and application behavior. Namespace isolation is lifecycle and correctness behavior, not a hostile-code boundary. The namespace does not define hydration, templates, components, application routing, rollback behavior, Agent working locations, or cross-feature protocols. HTMX, React, custom elements, and plain browser code are ordinary consumers.

## Requirements

### Scope and lifetime

- Every active Agent feature instance at a viewpoint **must** receive its own feature-local web namespace.
- Identical route paths or asset paths from different features **must not** collide.
- Route contracts **must** be schema-only values that backend and browser code share.
- An authored contract **must not** include a feature identity. UIX **must** derive the route and asset namespace from the active feature contribution.
- A feature **must** admit its web contracts once at workspace feature activation.
- Each Agent feature factory **must** later contribute handlers bound to those admitted contracts.
- Features **must not** add or remove routes imperatively or choose an Agent target for a route.
- Active routes and assets **must** share the Agent feature generation's lifetime. UIX **must** remove them when it disposes that instance or generation.
- Feature reload **must** replace affected routes and assets without leaving old handlers reachable.
- New trusted backend source becomes active only through feature admission and reload. A browser request **must not** execute a source file merely by naming it.
- A feature **must not** treat another feature's private routes as an integration API. Features **must** publish a typed contract when they intend to integrate.

### Route contracts

- Each route contract **must** declare one HTTP method and a feature-relative path pattern.
- Several contracts in one namespace **may** share one normalized path pattern only when each declares a different method. UIX **must** reject a duplicate method and normalized path pair.
- UIX **must** match and route declared path patterns so features do not have to implement their own router.
- UIX **must** establish a path match before selecting its declared method, then validate only that contract's input.
- A route pattern **may** provide a terminal wildcard when a feature deliberately routes a subtree itself.
- A route contract **must** separately declare TypeBox schemas for path parameters, query parameters, request headers, and body that it accepts.
- A route contract **may** omit the path or query schema when it accepts no values in that section. UIX **must** provide an empty object for that omitted section in handler input.
- Declared path parameter names **must** match the properties of the path schema. A parameterized path **must** declare that schema.
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
- An `html-document` response body **must** be an HTML string intended as a complete browser page. This response kind defines serving behavior, not document identity or persistence.
- An HTML-fragment response is a string with an HTML content type. UIX returns it unchanged and does not parse or validate it.
- A text response is a string with a plain-text content type.
- A JSON response **must** be validated against its TypeBox schema before encoding.
- A handler **must** return one declared status through a contract-bound responder. It **must not** construct a raw response object.
- The responder **must** require typed body and header values that match the declared status.
- UIX **must** encode the typed result into the host-neutral web response and apply host-owned header policy.
- Invalid input returns `400`, an unknown route returns `404`, and a method mismatch returns `405`. A matching path with no declared contract for the request method returns `405` before validating input declared by another method. An unexpected handler or validation failure returns `500`.
- Dynamic responses default to `Cache-Control: no-store`.
- Responses are finite. SSE, WebSockets, and other indefinite streaming responses are outside this version.

### Complete HTML responses and relative addressing

- If any declared response status uses `html-document`, the route path **must** be `/` or one literal, non-dot path segment such as `/view`.
- Except for `/` itself, a complete-page route **must not** end in `/`. It **must not** contain nested segments, path parameters, or wildcards.
- UIX **must** enforce this restriction during feature contract admission. An invalid declaration **must** fail feature activation with an error that identifies the route and the required shape.
- When a complete-page route selects content by an identifier, the contract **must** declare that identifier as query input rather than a path parameter.
- The host **must** encode complete-page URLs so their browser-resolved containing directory equals the bound feature root.
- UIX **must** validate that relationship when constructing complete-page URLs. The host **must not** serve the page through an alternate URL whose containing directory differs from that root.
- UIX **must** return the handler's HTML response body unchanged, with an HTML content type. The substrate **must not** parse or serialize that body, inject a base element, rewrite links, or add addressing cleanup markers.
- Relative addressing **must** use native browser URL resolution from the page URL. UIX **must not** require a script or a DOM rewrite to preserve same-page `#` navigation.
- Routes that declare only other response kinds are not subject to the complete-page path restriction. HTML fragments inserted into a page use the containing page's base rather than the fragment fetch URL.

Viewpoint binding selects the Agent generation that handles a request. The complete-page path restriction instead makes directory-relative references predictable within that binding. A nested content identifier in the query does not change the page's containing directory.

For example, a host may generate this physical page URL:

```text
https://host.example/workspaces/w/viewpoints/BINDING/canvas/view?key=reports/main
```

Native browser resolution gives these results:

| Authored reference | Resolution |
| --- | --- |
| `assets/site.css` | The same bound feature root followed by `assets/site.css`. |
| `api/data` | The same bound feature root followed by `api/data`. |
| `#details` | The same page URL, including its query, with the fragment `details`. |
| `?key=other` | The same page route and binding with a different content identifier. |

The physical encoding in this example is not prescribed. These rules apply to pages loaded in iframes and separate browser windows, including links added by scripts or inserted HTML fragments.

Relative addressing is not confinement. Origin-rooted references such as `/assets/site.css`, parent traversal such as `../`, absolute URLs, and authored `<base>` elements retain their browser meanings. The substrate does not rewrite them into the feature namespace. A feature may reject authored bases through its own content validation. Stylesheet references and JavaScript module imports retain their native resolution relative to the containing asset URL.

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
- The relative path builder **must** return a directory-relative reference rather than an origin-rooted pathname, including when the declared route path is `/`.
- UIX **must** derive a typed browser route capability from each contract and the current binding.
- The capability **must** synchronously derive physical URLs for markup and provide typed request execution.
- A derived physical URL **must** be usable in images, links, forms, iframes, scripts, and custom fetch calls.
- Typed request execution **must** send the declared method, typed headers and body, and return a typed status result with cancellation.
- A mounted surface **must** receive a feature-scoped capability bound to its attachment-target generation.
- A complete browser page **must** load from a physical URL satisfying the complete-page path restriction. Its containing directory establishes the bound feature root for ordinary directory-relative requests.
- When the attachment retargets, UIX **must** recreate its browser route capabilities, rerender mounted consumers, and reload affected documents through the new binding.
- Capabilities bound to the old generation **must** fail new requests rather than reach the new Agent.

## Conformance

A conforming implementation demonstrates these outcomes:

1. A schema-only contract yields a typed relative path builder, a typed browser route capability, and a contract-bound responder. Feature code writes no routing identity.
2. Two attachments target different Agents and invoke the same route. Each request reaches its own Agent feature instance.
3. Two features declare identical local paths without collision. Private routes do not become a cross-feature API.
4. Malformed path, query, header, or body input never invokes a handler. An invalid typed response is rejected before encoding.
5. Complete-page route admission accepts `/` and `/view`, and rejects nested, parameterized, wildcard, dot-segment, and trailing-slash page routes. The same path restriction does not apply to routes declaring only other response kinds.
6. URLs used in markup and typed browser requests reach the same handler through both host transports.
7. Retargeting revokes the old binding for new requests. Accepted requests finish against their recorded Agent, and mounted clients are recreated.
8. Feature reload removes old routes and assets and exposes the replacement generation through the existing connection.
9. Both hosts generate complete-page URLs whose containing directory equals the bound feature root and reject nonconforming page locations. A content key containing `/` remains query input and does not change that directory.
10. Complete-page and fragment HTML response bodies reach the browser unchanged by the substrate. Directory-relative links retain the page's binding, and `#` navigation retains its query without injected markup. The same behavior holds for links added after page load.

## Degrees of freedom

A conforming implementation may choose:

- Exact public API names and internal registry types.
- Physical binding encodings and whether Electron uses a custom scheme or localhost HTTP.
- The internal router and JSON codec.
- Whether several Agent bindings deduplicate identical immutable asset bytes.
- Static-file implementation and cache duration.

These choices must preserve declared routes, substrate-owned scope, automatic attachment binding, relative authored addresses, typed responses, and equivalent host behavior.

## Open questions

- When should common `ETag` and `If-Match` behavior become an automatic route capability instead of declared headers?
- Which feature-source admission requirements must land before Agent-authored route changes can be activated conveniently?
