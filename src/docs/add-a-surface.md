---
summary: "Add a surface to a feature: author an entry with defineSurface, bind a channel contract, and mount it in the workspace."
kind: how-to
read_when: "Read when adding a surface to a feature, or when asked to add a surface."
---

# Add a surface to a feature

A **surface** is a feature-owned React entry module the workspace mounts in the layout. Contributions identify surface files relative to the feature entry.

Files involved:

- [`packages/api/src/workspace.ts`](../../packages/api/src/workspace.ts), `defineSurface`, `SurfaceContribution`
- [`src/main/features/surface-pipeline.ts`](../../src/main/features/surface-pipeline.ts), bundling and serving
- [`src/renderer/workspace/layout.tsx`](../../src/renderer/workspace/layout.tsx), mounting, style scoping, error boundaries

The reference for a real surface is [`src/features/chat/workspace/surface.tsx`](../../src/features/chat/workspace/surface.tsx).

## Contribute the surface entry

Declare the surface file in the feature's `surfaces` facet:

```ts
// features/notes/index.ts
export const feature = defineFeature({
  id: "notes",
  contribute() {
    return { surfaces: ["./workspace/surface.tsx"] };
  },
});
```

The loader resolves each reference against the feature directory. Manifest order and surface declaration order determine composition order.

## Define the surface

Each surface module exports `surface`, a `defineSurface()` result:

```tsx
// features/notes/workspace/surface.tsx
import { defineSurface } from "@uix/api/workspace";

export const surface = defineSurface({
  name: "notes",
  render() {
    return <Notes />;
  },
});
```

`name` is a lowercase id token within the feature. Omit `contract` when the surface needs only local state or other workspace contexts.

To bind a channel, pass the shared contract. `render` receives the fully typed `ChannelClient`:

```tsx
export const surface = defineSurface({
  name: "notes",
  contract: notesChannels,
  render(client) {
    return <Notes client={client} />;
  },
});
```

See [`add-a-channel.md`](./add-a-channel.md) for the contract side of this pairing.

## Add styles

Import native CSS module scripts and list the sheets explicitly:

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

The `styles` array is the cascade order: shared foundations precede component-owned sheets. The substrate wraps each sheet in the surface's scope at mount, so write plain selectors. Names from `@font-face`, `@keyframes`, and `@property` cannot be scoped, so prefix them with the feature.

## Verify

Reload the workspace. The surface mounts in composition order, and a channel-bound surface receives a typed client. A failing surface renders an attributed error card without unmounting its siblings.
