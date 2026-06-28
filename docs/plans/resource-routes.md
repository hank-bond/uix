---
summary: "Make resource locations route-based: feature authors declare a resource route and origin policy, while the substrate owns URL generation/parsing across Electron and future hosted transports."
status: active
---

# Spec: resource routes

Related plan: [contribution-id-derivation](./contribution-id-derivation.md) established derived resource type ids such as `canvas-doc`. Related runtime direction: [workspace-runtime-foundation](./workspace-runtime-foundation.md) expects a future `resourceClient.url(...)` so surfaces do not hand-author transport URLs.

## Goal

Resource contributions should describe **what location shape they serve**, not hand-build protocol URLs. The resource facet should derive the resource type address (`canvas-doc` today), generate renderer URLs, parse incoming requests, and hide Electron custom-protocol vs future web-server hosting from feature code.

Canvas is the first migration target: it should keep owning `CanvasKey` validation, but stop owning host/path URL mechanics such as `encodeCanvasKeyHost` / `decodeCanvasKeyHost`.

## Target model

A resource has two coordinates:

- **Resource type** — feature + local name, derived by the facet (`canvas` + `doc` → `canvas-doc`).
- **Resource location** — route params/query for one concrete served thing (`main`, `reports/security-review`, cache-bust token, etc.).

A resource contribution declares a local name, a route, optional query schema, and an origin policy:

```ts
{
  name: "doc",
  route: "/:key*",
  query: Type.Object({
    v: Type.Optional(Type.String()),
  }),
  origin: { perParam: "key" },
  handle({ request, params, query }) {
    const key = parseCanvasKey(params.key.join("/"));
    // serve canvas document
  },
}
```

The substrate provides the inverse URL builder. The helper name may change once it moves behind a Workspace resource client, but the operation is deterministic conversion from resource type + route params into a transport URL:

```ts
toResourceUrl("canvas", "doc", {
  params: { key: ["reports", "security-review"] },
  query: { v: "1" },
});
```

Transport-specific output is not feature-owned. Electron may encode the isolated origin as a custom-protocol host; hosted UIX may encode the same route as an HTTP path or subdomain.

## Design constraints

- **One declaration, two directions.** The same route declaration must generate renderer URLs and parse backend requests.
- **Feature validates domain semantics.** The substrate parses route params/query; canvas still validates `CanvasKey`. The substrate should not learn canvas's slash-slug grammar.
- **Origin policy is explicit.** Canvas requires per-document iframe origin isolation, so the route contract must express which param controls origin isolation instead of hiding that decision in a feature-owned host codec.
- **Small DSL.** Do not build Express. Start with fixed segments, `:param`, `:splat*`, and typed query parsing.
- **Transport portability.** Feature code must not depend on Electron protocol shape. The route contract should adapt to local Electron and future web-server/hosted transport.

## Proposed units

### R1 — Route model and pure codec tests

Add shared route normalization helpers for resource routes:

- `ResourceRoute` author shape (`route`, optional `query`, optional `origin`).
- Parse route patterns into a small internal representation.
- Encode params/query into a URL path/host representation for the Electron transport.
- Decode an incoming URL back into params/query.
- Validate reversible cases and rejected malformed params in unit tests.

Open design choice for R1: exact route DSL spelling for splats and how route params are represented (`string` vs `string[]`).

### R2 — Resource registry request wrapper

Change `ResourceContribution.handle` from raw `Request` to parsed context:

```ts
handle(ctx: {
  request: Request;
  params: Record<string, string | readonly string[]>;
  query: unknown;
}): Response | Promise<Response>
```

The registry wraps `protocol.handle` callbacks, parses the request URL against the registered route, validates query payloads, and returns a 404/400-style response for non-matches or invalid locations.

### R3 — Substrate URL builder for renderer/workspace code

Expose a resource URL builder that takes feature id + resource name + params/query and uses the registered/normalized route metadata. First cut can be a direct helper while canvas is still hardcoded; later W6 can move it behind `resourceClient.url(...)` or a scoped feature resource client.

### R4 — Migrate canvas resource

Canvas contributes:

- `name: "doc"`
- route for canvas document keys
- per-key origin policy
- query param for cache-bust token

Canvas removes URL host encode/decode from feature code. It keeps `CanvasKey`, `CanvasKeySchema`, and `parseCanvasKey` as domain validation for route params.

### R5 — Docs and cleanup

Update architecture/current-state and the workspace/resource plans. If the route model is stable enough, add user-facing substrate docs under `src/docs/` for resource contributions.

## Non-goals

- Full HTTP router compatibility.
- Public extension API finalization for resources.
- Reworking document-store `doc://...` durable resource ids.
- Moving canvas/chat into Workspace surfaces; this plan should support that later work but not depend on it.

## Open questions

1. Should `origin: { perParam: "key" }` accept a splat param directly, or should origin inputs be separately declared from path params?
2. Should generated URLs be strings (`href`) or `URL` objects at the helper boundary?
3. How should invalid parsed params map to responses: generic 404, explicit 400, or contribution-provided not-found handling?
4. Does query validation use TypeBox immediately, or do we defer typed query until after route params land?
