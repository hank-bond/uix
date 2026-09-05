---
summary: "Add a resource to a feature: declare an address handle in shared code, contribute a handler, and create transport URLs and origins."
kind: how-to
read_when: "Read when adding a resource to a feature, or when asked to add a resource."
---

# Add a resource to a feature

A **resource** contributes feature-owned browser content through a logical `uix-resource://` address: iframe documents, fonts, images, surface assets, or another browser-loadable response. Electron serves that address as a custom protocol, while the server maps it to a workspace-qualified HTTP content route. Features declare semantic routes without observing either physical transport.

Files involved:

- [`packages/api/src/resources.ts`](../../packages/api/src/resources.ts), `createResourceAddressHandle`, `ResourceContribution`, `ResourceRequestContext`
- [`packages/api/src/resource-routes.ts`](../../packages/api/src/resource-routes.ts), route normalization and URL encode/decode
- [`packages/runtime/src/resource-registry.ts`](../../packages/runtime/src/resource-registry.ts), the workspace resource registry

The Canvas static iframe resource in [`src/features/canvas/backend/contributions/resources.ts`](../../src/features/canvas/backend/contributions/resources.ts) is a current example. Its Agent-viewpoint HTML still travels through a selected channel handler rather than the Workspace resource request.

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
- `origin: "feature"` puts feature identity in the logical host. `origin: "workspace"` puts it in the path. Electron preserves that origin partition, while the current server maps both forms onto its configured deployment origin.

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

`ResourceRequestContext` holds the original `Request`, parsed path parameters, and the parsed query value. The handler returns a standard `Response`. The registry resolves owner-scoped ids, rejects duplicate claims, and parses untrusted logical URLs before calling feature code, so your handler receives validated values. A response without an explicit cache policy defaults to `no-store` on the server. Use immutable caching only when the URL names exact bytes or a specific revision. The server strips feature-authored cross-origin grants and derives its grants from the configured public-origin policy.

## Create URLs and origins

Renderer-shared code creates a logical address from the handle, then resolves it through the current workspace client before giving it to the browser:

```ts
import {
  resolveWorkspaceResourceUrl,
  useWorkspaceClient,
} from "@uix/api/workspace";

const workspace = useWorkspaceClient();
const logicalUrl = reportAddress.toUrl({
  workspaceId: workspace.workspaceId,
  params: { reportId: "weekly" },
});
const url = resolveWorkspaceResourceUrl(workspace, logicalUrl);

const logicalOrigin = reportAddress.toOrigin(workspace.workspaceId);
const origin = resolveWorkspaceResourceUrl(workspace, logicalOrigin);
```

`toUrl()` returns a branded logical `ResourceUrl`. It validates address fields, parameter names, parameter shapes, and query values before encoding. `toOrigin()` returns its logical origin. `resolveWorkspaceResourceUrl()` preserves those addresses in Electron and maps them to workspace-qualified HTTP origins in the server host. Resolve origins too before using them for checks such as iframe `postMessage` validation.

## Verify

Reload the workspace. Then load an iframe whose `src` is the generated URL, or request the URL directly, and confirm the response.
