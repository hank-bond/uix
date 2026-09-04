---
summary: "Add a surface to a feature: author an entry with defineSurface, declare its channel namespaces, and mount it in the workspace."
kind: how-to
read_when: "Read when adding a surface to a feature, or when asked to add a surface."
---

# Add a surface to a feature

A **surface** is a feature-owned React entry module the workspace mounts in the layout. Contributions identify surface files relative to the feature entry.

Files involved:

- [`packages/api/src/workspace.ts`](../../packages/api/src/workspace.ts), `defineSurface`, `SurfaceContribution`
- [`packages/runtime/src/features/surface-pipeline.ts`](../../packages/runtime/src/features/surface-pipeline.ts), bundling and serving
- [`packages/client/src/workspace/surface-host.tsx`](../../packages/client/src/workspace/surface-host.tsx), mounting, style scoping, error boundaries

The reference for a real surface is [`src/features/chat/workspace/surface.tsx`](../../src/features/chat/workspace/surface.tsx).

## Contribute the surface entry

Declare the surface file in the feature's `surfaces` facet:

```ts
// features/notes/index.ts
export const feature = defineFeature({
  id: "notes",
  workspace() {
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

`name` is a lowercase id token within the feature. Omit `channels` when the surface needs only local state or other workspace contexts.

To bind channels, map each provider namespace to its shared contract. `render` receives a typed `ChannelClient` under every matching key:

```tsx
import { agentChannels } from "@uix/api/agent-channels";
import { notesChannels } from "../shared/channels";

export const surface = defineSurface({
  name: "notes",
  channels: {
    agent: agentChannels,
    notes: notesChannels,
  },
  render({ agent, notes }) {
    return <Notes client={notes} agent={agent} />;
  },
});
```

The key is both the canonical provider namespace and the local client name. UIX validates every declared namespace against the live backend channel registry before rendering. This rule applies equally to the surface's feature, another feature, and reserved substrate providers such as `agent`. See [`add-a-channel.md`](./add-a-channel.md) for the contract side of this pairing.

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

Reload the workspace. The surface mounts in composition order and receives its declared typed clients. A missing channel namespace or failing surface renders an attributed error card without unmounting its siblings.
