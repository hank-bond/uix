---
summary: "Make resource locations route-based: feature authors declare a resource route and origin policy, while the substrate owns URL generation/parsing across Electron and future hosted transports."
status: landed
---

# Spec: resource routes

Related plan: [contribution-id-derivation](./contribution-id-derivation.md) established derived resource type ids such as `canvas-doc`. Related runtime direction: [workspace-runtime-foundation](./workspace-runtime-foundation.md) expects a future `resourceClient.url(...)` so surfaces do not hand-author transport URLs.

## Goal

Resource contributions should describe **what location shape they serve**, not hand-build protocol URLs. The resource facet should derive the resource type address (`canvas-doc` today), generate renderer URLs, parse incoming requests, and hide Electron custom-protocol vs future web-server hosting from feature code.

Canvas is the first migration target: it should keep owning `CanvasKey` validation, but stop owning host/path URL mechanics such as `encodeCanvasKeyHost` / `decodeCanvasKeyHost`. Its authored documents need a feature-isolated browser origin, not per-document origin partitioning.

## Target model

A resource has two coordinates:

- **Resource type** — feature + local name, derived by the facet (`canvas` + `doc` → `canvas-doc`).
- **Resource location** — route params/query for one concrete served thing (`main`, `reports/security-review`, cache-bust token, etc.).

A resource contribution declares a local name, a route, optional query schema, and an origin policy:

```ts
{
  name: "doc",
  path: "/:key*",
  query: Type.Object({
    v: Type.Optional(Type.String()),
  }),
  origin: "feature",
  handle({ request, params, query }) {
    const key = parseCanvasKey(params.key.join("/"));
    // serve canvas document
  },
}
```

Origin policy is intentionally coarse for now:

- `"workspace"` means the resource belongs to the shared app/workspace origin.
- `"feature"` means the resource belongs to one isolated origin for this feature within the workspace.

Hosted UIX maps these to shapes like `https://{workspace}.uix.sh/...` for workspace resources and `https://{feature}.{workspace}.uix.sh/...` for feature-isolated resources. Route params affect only resource location, never origin partitioning.

The substrate provides the inverse URL builder. The helper name may change once it moves behind a Workspace resource client, but the operation is deterministic conversion from resource type + route params into a transport URL:

```ts
toResourceUrl("canvas", "doc", {
  params: { key: ["reports", "security-review"] },
  query: { v: "1" },
});
```

Transport-specific output is not feature-owned. Electron encodes resource requests under one substrate protocol scheme (`uix-resource://...`) and uses the URL host for workspace/feature origin partitioning; hosted UIX encodes the same route as HTTP paths and workspace/feature subdomains.

## Design constraints

- **One declaration, two directions.** The same route declaration must generate renderer URLs and parse backend requests.
- **Feature validates domain semantics.** The substrate parses route params/query; canvas still validates `CanvasKey`. The substrate should not learn canvas's slash-slug grammar.
- **Origin policy is explicit.** Canvas requires iframe origin isolation from the workspace/host, so the route contract says whether a resource belongs to the shared workspace origin or to the feature's isolated origin instead of hiding that decision in a feature-owned host codec.
- **Small DSL.** Do not build Express. Start with static segments, `:param`, `:splat*`, and typed query parsing.
- **Transport portability.** Feature code must not depend on Electron protocol shape. The route contract should adapt to local Electron and future web-server/hosted transport.

## Proposed units

### R1 — Route model and pure codec tests

_Landed: `src/shared/resource-routes.ts` defines the route model, normalized route representation, branded `ResourceUrl`, one `uix-resource` transport scheme with host-based origin partitioning, and pure encode/decode tests._

Add shared route normalization helpers for resource routes:

- `ResourceRoute` author shape (`path`, optional `query`, `origin: "workspace" | "feature"`).
- Parse route patterns into a small internal representation.
- Encode params/query into a branded `ResourceUrl` string for the Electron transport.
- Decode an incoming URL back into params/query.
- Validate reversible cases and rejected malformed params in unit tests.

Settled R1 choices: splats are spelled `:key*`; normal params decode as `string`; splat params decode as `readonly string[]`; generated URLs are branded strings, with encode/decode helpers external to the value; scheme is a permission/transport class, not the semantic resource type; workspace id is supplied by the workspace/runtime layer, not defaulted by the pure codec.

### R2 — Resource registry request wrapper

_Landed: resource contributions now declare `path`, `query`, and `origin`; the registry registers one `uix-resource` protocol handler, dispatches against normalized routes, and passes parsed context to handlers._

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

_Landed as a direct shared codec: `encodeResourceUrl(...)` builds branded resource URLs from normalized route metadata. Canvas calls it through a small feature helper while the future Workspace resource client is not yet in place._

Expose a resource URL builder that takes feature id + resource name + params/query and uses the registered/normalized route metadata. First cut can be a direct helper while canvas is still hardcoded; later W6 can move it behind `resourceClient.url(...)` or a scoped feature resource client.

### R4 — Migrate canvas resource

_Landed: canvas declares `path: "/:key*"`, `origin: "feature"`, and query validation; backend serving reads parsed route params; renderer iframe URLs use `uix-resource://canvas.<workspace>/doc/...`; writeback trust checks feature origin plus `event.source`._

Canvas contributes:

- `name: "doc"`
- route for canvas document keys
- feature-isolated origin policy
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

1. Resolved: origin is `"workspace" | "feature"`; route params never drive origin partitioning.
2. Resolved: generated URLs are branded strings (`ResourceUrl`), not mutable `URL` objects.
3. Current direction: route/resource mismatches map to 404, malformed matching locations/query map to 400, and domain not-found remains contribution-owned.
4. Resolved: query validation uses TypeBox immediately.
