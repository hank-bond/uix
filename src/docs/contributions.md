---
summary: "FeatureDefinition.contribute returns facet contributions for resources, channels, agent tools, turn state, agent context, and surfaces; the substrate registers each facet under the feature id with reload-scoped lifetimes."
status: active
---

# Contributions

Feature entries contribute behavior declaratively from `FeatureDefinition.contribute(ctx)`. The returned object may include these facets:

```ts
interface FeatureContributions {
  resources?: readonly ResourceContribution[];
  channels?: readonly ChannelContribution[];
  agentTools?: readonly AgentToolContribution[];
  turnState?: readonly TurnStateContribution[];
  agentContext?: readonly AgentContextContribution[];
  surfaces?: readonly string[];
}
```

The substrate registers every facet under the owning feature id. That id prefixes contribution namespaces and is the identity used for diagnostics and cleanup.

## Current facets

- **Resources** — route handlers for `uix-resource://...` URLs.
- **Channels** — typed backend request handlers plus backend-published events.
- **Agent tools** — pi tool definitions installed into the owned agent session.
- **Turn state** — feature-owned preparation of branch-scoped private state refs.
- **Agent context** — model-visible hidden context sections materialized at agent-run prep.
- **Surfaces** — frontend surface entry files, resolved relative to the feature entry's directory; each module default-exports a `defineSurface(...)` result.

A surface's `styles` sheets are wrapped in `@scope ([data-uix-surface="<name>"])` when the substrate adopts them at mount, so write selectors unscoped — they cannot reach other surfaces or the cockpit chrome. The exception is name-global at-rules (`@font-face`, `@keyframes`, `@property`): CSS gives their names one document-wide space no scoping can contain, so prefix those names with your feature (e.g. `"UIX Iosevka"`).

Surface refs are strings in the contribution because the surface pipeline bundles them on demand from disk:

```ts
export default {
  id: "hello",
  contribute() {
    return {
      surfaces: ["./workspace/HelloSurface.tsx"],
    };
  },
};
```

## Lifetimes

Each activated feature gets a per-feature `DisposableBag`. All facet registrations for that feature are enrolled in the bag. Reload clears the feature subtree, which disposes registrations before activating the new tree. A feature author does not receive the bag directly; cleanup is owned by the substrate registration path.

There is no command-palette contribution API today.

See [`features.md`](./features.md) and [`lifetimes.md`](./lifetimes.md).
