---
summary: "Add a resource to a feature: declare an address handle in shared code, contribute a handler, and create transport URLs and origins."
kind: how-to
read_when: "Read when adding a resource to a feature, or when asked to add a resource."
---

# Add a resource to a feature

A **resource** contributes feature-owned browser content through the substrate `uix-resource://` protocol: iframe documents, fonts, images, surface assets, or another browser-loadable response. Features declare semantic routes without registering Electron protocols.

Files involved:

- [`packages/api/src/resources.ts`](../../packages/api/src/resources.ts), `createResourceAddressHandle`, `ResourceContribution`, `ResourceRequestContext`
- [`packages/api/src/resource-routes.ts`](../../packages/api/src/resource-routes.ts), route normalization and URL encode/decode
- [`packages/runtime/src/resource-registry.ts`](../../packages/runtime/src/resource-registry.ts), the transport registry

The Canvas static frame resource in [`src/features/canvas/backend/contributions/resources.ts`](../../src/features/canvas/backend/contributions/resources.ts) is a current example. Its Agent-viewpoint HTML still travels through a selected channel handler rather than the Workspace resource request.

## Declare an address in shared code

Put the address handle in feature-shared code so backend and renderer both consume the same declaration. Use `createResourceAddressHandle`:

```ts
// features/reports/shared/resources.ts
import { createResourceAddressHandle } from "@uix/api/resources";

export const reportAddress = createResourceAddressHandle({
  featureId: "reports",
  name: "document",
  path: "/:reportId",
  origin: "feature",
});
```

- `featureId` and `name` identify the resource. The substrate derives the resource type as `${featureId}-${name}`.
- A `:name` segment accepts one string. A terminal `:name*` segment accepts a string array.
- An optional TypeBox `query` schema validates query values.
- `origin: "feature"` gives the resource a feature-isolated browser origin. `origin: "workspace"` shares the workspace origin and places feature identity in the path.

The declaration normalizes without throwing. A throw means a segment name, shape, or origin value is invalid.

## Contribute a handler

Backend code passes the handle's normalized `route` and a handler through the feature's `resources` facet:

```ts
// features/reports/backend/resources.ts
import { reportAddress } from "../shared/resources";

export const reportResource = {
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

Return it from `workspace(ctx)`:

```ts
// features/reports/index.ts
export const feature = defineFeature({
  id: "reports",
  workspace() {
    return { resources: [reportResource] };
  },
});
```

`ResourceRequestContext` holds the original `Request`, parsed path parameters, and the parsed query value. The handler returns a standard `Response`. The registry resolves owner-scoped ids, rejects duplicate claims, and parses untrusted URLs before calling feature code, so your handler receives validated values.

## Create URLs and origins

Renderer-shared code calls the handle with a workspace id and route values:

```ts
const url = reportAddress.toUrl({
  workspaceId,
  params: { reportId: "weekly" },
});

const origin = reportAddress.toOrigin(workspaceId);
```

`toUrl()` returns a branded `ResourceUrl`. It validates address fields, parameter names, parameter shapes, and query values before encoding. `toOrigin()` returns the exact browser origin for security checks such as iframe `postMessage` validation.

## Verify

Reload the workspace. Then load an iframe whose `src` is the generated URL, or request the URL directly, and confirm the response.
