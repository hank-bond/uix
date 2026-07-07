---
summary: "A manifest-backed workspace settings service hydrates feature-declared TypeBox setting schemas into feature entries, exposes validated ctx.settings, and writes atomically without live filesystem watching; tracked document publication is the future file-change primitive."
status: active
---

# Spec: workspace settings

The immediate need is durable workspace/feature settings, not a public arbitrary file-watching primitive. StatusBar layout in [agent-controls](./agent-controls.md) needs cross-session feature-scoped settings that are visible and agent-editable as ordinary workspace data. If the agent or a human edits `uix.workspace.json` while UIX is running, the user runs `/reload` to pick it up.

This plan replaces the earlier `ctx.files.watch/write` F0 with a smaller settings service. File watching remains valuable, but the better future primitive is tracked document publication: documents loaded into the document store can be published to visible paths and only those tracked paths are watched/imported. That design is now a backlog seed, not part of this settings slice.

No users yet beyond the author, so breaking changes to interfaces/manifest shape are free — favor the right design over back-compat.

## Vocabulary

- **Manifest enumerates** workspace composition and external dependencies.
- **Config changes execution** paths and substrate behavior.
- **Settings tune experience**: user-visible preferences and surface-level durable values, usually with defaults.
- **Turn-state anchors branch-specific runtime facts** that are not already represented in the transcript.

`uix.workspace.json` remains one workspace file. Its `features` entries enumerate the composition, and each feature entry carries that feature's settings.

## W0 — Manifest feature entries carry settings

Move workspace feature entries to objects:

```json
{
  "name": "My Workspace",
  "features": [
    {
      "id": "chat",
      "entry": "./features/chat/index.ts",
      "settings": {}
    }
  ]
}
```

The loader verifies that `features[i].id` matches the loaded `FeatureDefinition.id`. Settings are colocated with the feature they tune; there is no top-level `settings[featureId]` map in this version.

## W1 — Feature-declared setting schemas

Settings are declared on `FeatureDefinition`, before `context()` and `contribute()` run, so the loader can hydrate them before handing out `ctx.settings`:

```ts
import { Type } from "typebox";

const StatusBarSettings = Type.Object({
  order: Type.Array(Type.String(), {
    default: ["model", "thinking", "context"],
  }),
  hidden: Type.Array(Type.String(), { default: [] }),
});

export default {
  id: "chat",
  settings: [{ key: "statusBar", schema: StatusBarSettings }],
  contribute(ctx) {
    const statusBar = ctx.settings.get("statusBar");
    return {};
  },
};
```

Hydration uses TypeBox field-level defaults. Defaults fill only missing keys/fields and never overwrite existing persisted values. If a feature changes a default after a workspace has already materialized the old value, the workspace keeps its current value. New fields get added with defaults. Invalid persisted values fail loudly rather than being silently replaced.

## W2 — Feature-scoped settings API

Inject `ctx.settings` on the backend feature context:

```ts
interface FeatureSettings {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  onChange(key: string, handler: (value: unknown) => void): () => void;
}
```

Semantics:

- keys must be declared by that feature's `settings` definitions;
- values are validated against the declared TypeBox schema;
- memory is authoritative while running;
- `set()` updates memory and fires `onChange` synchronously;
- disk flush is debounced and atomic;
- `/reload` re-reads settings from disk;
- no live filesystem watcher in v1.

The first consumer is StatusBar layout in [agent-controls](./agent-controls.md) A1. Model/thinking selection is not workspace settings: pi already records model/thinking changes as branch-aware session entries, so agent controls should derive those through the agent/session status path.

## Boundary / future

- **Surface access**: surfaces should not read the manifest directly. If/when surfaces need generic settings access, add a substrate-owned feature-bound settings channel/client (`get`/`set`/`subscribe`) rather than per-feature boilerplate channels.
- **Tracked documents, not arbitrary watchers**: future Monaco/source/document features should use document-store tracked publication. A document can be published to a visible path; external/bash edits import new document versions and notify surfaces. This is the backlog item, not W0-W2.
- **Live external config edits**: if `/reload` is too coarse for settings, add a manifest-specific watcher inside the settings service; do not expose arbitrary `ctx.files.watch` to features for this.
- Not here: process-isolation fs enforcement, Deno/worker feature host, generic settings UI surface, source buffer service.
