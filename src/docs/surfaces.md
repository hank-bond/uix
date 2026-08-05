---
summary: "Feature surface modules export defineSurface results that the workspace bundles, mounts, channel-binds, style-scopes, and isolates behind error boundaries."
kind: reference
status: active
---

# Surfaces

A surface is a feature-owned React entry module mounted in the workspace layout. Feature contributions identify surface files relative to the feature entry.

```ts
contribute() {
  return {
    surfaces: ["./workspace/surface.tsx"],
  };
}
```

The feature loader resolves each reference against the feature directory. Manifest order and surface declaration order determine composition order.

## Define a surface

Each surface module exports `surface`, a `defineSurface()` result:

```tsx
import { defineSurface } from "@uix/api/workspace";

export const surface = defineSurface({
  name: "hello",
  render() {
    return <section>Hello</section>;
  },
});
```

`name` is a lowercase id token within the feature. A surface can omit a channel contract when it needs only local state or other workspace contexts.

A channel-bound surface declares a shared contract. Its `render(client)` callback receives a `ChannelClient` derived from that contract.

```tsx
export const surface = defineSurface({
  name: "notes",
  contract: notesChannels,
  render(client) {
    return <Notes client={client} />;
  },
});
```

The substrate owns the only generic erasure needed for a heterogeneous surface list. Feature code keeps contract-derived request and event types.

## Runtime loading

The main surface pipeline bundles each entry with Esbuild when the renderer requests the composition. Feature-local TypeScript and JavaScript dependencies become part of that bundle.

The pipeline shares the page's React, TypeBox, and blessed `@uix/api` modules. This preserves React context identity between the workspace and dynamically loaded features.

Surface modules run as trusted code in the workspace page realm. Jiti and Esbuild are loaders, not security boundaries.

Each mount has an error boundary. A failed surface renders an attributed error card without unmounting sibling surfaces.

UIX does not provide a generic iframe surface mode. Canvas owns a contained iframe inside its trusted React surface for authored HTML.

## Stylesheets

Surface entry modules import native CSS module scripts and list their sheets explicitly:

```tsx
import chatStyles from "./Chat.css" with { type: "css" };

export const surface = defineSurface({
  name: "chat",
  styles: [chatStyles],
  render() {
    return <Chat />;
  },
});
```

The `styles` array is the cascade order. Shared foundations precede component-owned sheets.

At mount, the substrate adopts each sheet under `@scope ([data-uix-surface="<name>"])`. Feature selectors should remain unscoped in source.

CSS cannot scope names from `@font-face`, `@keyframes`, or `@property`. Prefix those document-global names with the feature.

Surface files can load feature-local fonts and images through the pipeline's read-only files route. Content-hash query values invalidate changed modules and styles.

## Workspace contexts

Every mounted surface receives these scoped services as needed:

- The workspace channel client.
- A feature-bound settings client.
- A feature-bound action registrar.
- Read-only workspace session capabilities.

A surface does not receive Electron, main-process registries, another feature's settings handle, or arbitrary backend owners.

See [`how-to/add-a-channel.md`](./how-to/add-a-channel.md), [`settings.md`](./settings.md), and [`actions.md`](./actions.md) for these services.
