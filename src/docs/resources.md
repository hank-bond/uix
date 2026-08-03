---
summary: "Feature resources declare normalized routes and handlers while shared address handles create validated workspace-origin or feature-origin browser URLs."
kind: reference
status: active
---

# Resources

A resource contribution serves feature-owned browser content through the substrate `uix-resource://` protocol. Features declare semantic routes without registering Electron protocols.

Use resources for iframe documents, fonts, images, surface assets, or another browser-loadable response owned by a feature backend.

## Declare an address

Shared feature code creates one `ResourceAddressHandle`:

```ts
import { createResourceAddressHandle } from "@uix/api/resources";

export const reportAddress = createResourceAddressHandle({
  featureId: "reports",
  name: "document",
  path: "/:reportId",
  origin: "feature",
});
```

The definition contains the owning feature id, local resource name, path pattern, optional TypeBox query schema, and origin policy.

A `:name` segment accepts one string. A terminal `:name*` segment accepts a string array. Query values validate against the declared schema.

`origin: "feature"` gives the resource a feature-isolated browser origin. `origin: "workspace"` shares the workspace origin and places feature identity in the path.

## Contribute a handler

Backend code passes the normalized route and a handler through the feature's `resources` facet:

```ts
const reportResource = {
  name: "document",
  route: reportAddress.route,
  async handler({ params }) {
    const html = await loadReport(String(params.reportId));
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
```

`ResourceRequestContext` contains the original `Request`, parsed path parameters, and parsed query value. The handler returns a standard `Response`.

The resource registry resolves owner-scoped ids and rejects duplicate claims. It parses untrusted URLs before calling feature code.

## Create URLs and origins

Renderer-shared code calls the handle with a workspace id and route values:

```ts
const url = reportAddress.toUrl({
  workspaceId,
  params: { reportId: "weekly" },
});

const origin = reportAddress.toOrigin(workspaceId);
```

`toUrl()` returns a branded `ResourceUrl`. It validates address fields, parameter names, parameter shapes, and query values before encoding.

`toOrigin()` returns the exact browser origin for security checks. Canvas uses this value to validate iframe `postMessage` traffic.

The handle is a transitional hybrid because renderer code still creates transport URLs. A future contained-surface substrate may internalize these operations.

## Boundaries

The protocol scheme identifies a transport and permission class, not a semantic document type. Domain ids such as `doc://canvas/main` remain separate from browser fetch URLs.

Feature resources cannot serve surface JavaScript bundles from their isolated origins. The substrate surface pipeline uses a reserved origin and a narrow Content Security Policy (CSP).

Resource handlers are reload-scoped feature contributions. Disposal removes their routes without unregistering the application-wide Electron protocol.

See [`contributions.md`](./contributions.md) for registration and [`surfaces.md`](./surfaces.md) for surface files and assets.
