---
summary: "FeatureDefinition.contribute returns feature-owned resource, channel, agent, state, context, and surface facets under reload-scoped lifetimes."
kind: reference
status: active
---

# Contributions

Feature entries contribute behavior declaratively from `FeatureDefinition.contribute(ctx)`. The returned object may include these facets:

```ts
interface FeatureContributions {
  resources?: readonly ResourceContribution[];
  channels?: readonly ChannelContribution[];
  agentTools?: readonly AgentToolContribution[];
  agentToolOverrides?: readonly AgentToolOverrideContribution[];
  agentSystemPrompt?: string;
  agentSkills?: readonly string[];
  turnState?: TurnStateContributions;
  agentContext?: readonly AgentContextContribution[];
  surfaces?: readonly string[];
}
```

The substrate registers every facet under the owning feature id. That id prefixes contribution namespaces and identifies diagnostics and cleanup.

Ordinary agent tools reach Pi as `${featureId}__${name}`. The separate `agentToolOverrides` facet keeps exact authored names for intentional replacements and application vocabulary.

## Current facets

- **Resources:** Route handlers for `uix-resource://...` URLs. A `ResourceContribution` stores its callback as `handler`. The substrate resolves owner-scoped ids before the resource registry makes the resource live.
- **Channels:** Typed backend request handlers plus backend-published events.
- **Agent tools:** Pi tool definitions installed into the owned agent session. The substrate resolves owner-scoped ids and final Pi names before making each tool live. `agentTools` are always feature-namespaced. `agentToolOverrides` intentionally register exact names. A competing exact-name claim fails and rolls back the later feature's activation rather than silently selecting an implementation. UIX starts Pi without active built-in tools, so every available coding tool comes from the workspace's explicit feature composition.
- **Agent system prompt:** One stable Markdown section per feature, appended in manifest order when the Pi runtime starts or reloads.
- **Agent skills:** Pi skill files or directories resolved relative to the feature entry file and supplied through Pi's `resources_discover` lifecycle.
- **Turn state:** Named, schema-bound cells of branch-scoped private state. Each cell creates and restores one complete JSON snapshot independently under a substrate-derived id such as `canvas.documents`. The coordinator commits only changed snapshots.
- **Agent context:** Model-visible hidden context sections materialized at agent-run prep.
- **Surfaces:** Frontend surface entry files, resolved relative to the feature entry's directory. Each module exports `surface`, a `defineSurface(...)` result.

Turn-state cells use one TypeBox schema for both directions:

```ts
turnState: {
  documents: defineTurnStateCell({
    schema: DocumentStateSchema,
    createSnapshot: () => currentDocumentState,
    restore: (state) => replaceDocumentState(state),
  }),
  selection: defineTurnStateCell({
    schema: SelectionStateSchema,
    createSnapshot: () => currentSelectionState,
    restore: (state) => replaceSelectionState(state),
  }),
}
```

`createSnapshot()` always returns that cell's complete current value. The substrate validates it as plain JSON and compares it with the nearest committed value, so changing `selection` does not re-persist `documents`. Nested fields within one cell remain atomic. TypeBox codecs are rejected because persisted and restored values use the same plain-JSON representation. `restore(undefined)` means that the selected branch has no value for the cell and the feature must replace prior working state with its defaults. The restore scheduler applies selected-branch state on startup, session replacement, and serialized feature reload.

The Agent system-prompt section is for short, always-relevant feature semantics and authoring contracts. It is static for one Pi runtime and should not carry per-turn state. Use agent context for that. Larger task-specific workflows belong in a skill so Pi can advertise only its description and let the Agent load the full `SKILL.md` on demand. UIX does not parse skills: Pi owns discovery, validation, catalog formatting, and loading.

At mount, the substrate wraps surface stylesheets in `@scope ([data-uix-surface="<name>"])`. Write selectors unscoped because they cannot reach other surfaces or host chrome.

Name-global at-rules remain an exception. CSS gives `@font-face`, `@keyframes`, and `@property` one document-wide namespace. Prefix those names with the feature, for example `"UIX Iosevka"`.

Surface refs are strings in the contribution because the surface pipeline bundles them on demand from disk:

```ts
export const feature = {
  id: "hello",
  contribute() {
    return {
      surfaces: ["./workspace/HelloSurface.tsx"],
    };
  },
};
```

## Lifetimes

Each feature activation gets a per-feature `DisposableBag`. The substrate adds the provisional settings handle and every returned facet capability to that bag.

Grouped registration cleans up acquired capabilities if a later operation throws. Only a complete activation produces an instance in the active composition.

Reload disposes that composition before activating replacements. A failed activation disposes only its provisional bag and does not abort siblings.

Feature authors do not receive the bag directly. The substrate registration path owns cleanup.

There is no command-palette contribution API today.

See [`how-to/add-a-feature.md`](./how-to/add-a-feature.md) and [`lifetimes.md`](./lifetimes.md).
