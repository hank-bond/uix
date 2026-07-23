---
summary: "FeatureDefinition.contribute returns facet contributions for resources, channels, agent tools, Agent system-prompt sections, Pi skills, turn state, agent context, and surfaces; the substrate registers each facet under the feature id with reload-scoped lifetimes."
status: active
---

# Contributions

Feature entries contribute behavior declaratively from `FeatureDefinition.contribute(ctx)`. The returned object may include these facets:

```ts
interface FeatureContributions {
  resources?: readonly ResourceContribution[];
  channels?: readonly ChannelContribution[];
  agentTools?: readonly AgentToolContribution[];
  agentSystemPrompt?: string;
  agentSkills?: readonly string[];
  turnState?: TurnStateContributions;
  agentContext?: readonly AgentContextContribution[];
  surfaces?: readonly string[];
}
```

The substrate registers every facet under the owning feature id. That id prefixes contribution namespaces and is the identity used for diagnostics and cleanup.

## Current facets

- **Resources** — route handlers for `uix-resource://...` URLs.
- **Channels** — typed backend request handlers plus backend-published events.
- **Agent tools** — pi tool definitions installed into the owned agent session.
- **Agent system prompt** — one stable Markdown section per feature, appended in manifest order when the Pi runtime starts or reloads.
- **Agent skills** — Pi skill files or directories resolved relative to the feature entry file and supplied through Pi's `resources_discover` lifecycle.
- **Turn state** — named, schema-bound cells of branch-scoped private state. Each cell creates and restores one complete JSON snapshot independently under a substrate-derived id such as `canvas.documents`; the coordinator commits only changed snapshots.
- **Agent context** — model-visible hidden context sections materialized at agent-run prep.
- **Surfaces** — frontend surface entry files, resolved relative to the feature entry's directory; each module default-exports a `defineSurface(...)` result.

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

The Agent system-prompt section is for short, always-relevant feature semantics and authoring contracts. It is static for one Pi runtime and should not carry per-turn state; use agent context for that. Larger task-specific workflows belong in a skill so Pi can advertise only its description and let the Agent load the full `SKILL.md` on demand. UIX does not parse skills: Pi owns discovery, validation, catalog formatting, and loading.

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

Each feature activation gets a per-feature `DisposableBag`. The substrate enrolls the provisional settings scope and each facet registration in that bag; grouped item/facet registration cleans up everything already acquired if a later registration throws. Only a complete activation produces an activated feature instance that joins the active feature composition. Reload disposes that composition before activating replacement feature instances, while a failed activation disposes only its own provisional bag and does not abort siblings. A feature author does not receive the bag directly; cleanup is owned by the substrate registration path.

There is no command-palette contribution API today.

See [`features.md`](./features.md) and [`lifetimes.md`](./lifetimes.md).
