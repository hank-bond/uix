---
summary: "Add settings to a feature: declare a shared schema and default, read and write through ctx.settings, and consume them from a surface."
kind: how-to
read_when: "Read when adding settings to a feature, or when asked to add settings to a feature."
---

# Add settings to a feature

Durable settings live on the feature's manifest entry in `uix.workspace.json`. Features declare one schema and optional whole-object default in feature-shared code, so backend and surface import the same keys, validation, defaults, and TypeScript types.

Files involved:

- [`packages/api/src/settings.ts`](../../packages/api/src/settings.ts), `defineSettings`
- [`packages/api/src/workspace.ts`](../../packages/api/src/workspace.ts), `useFeatureSetting`
- [`packages/runtime/src/workspace-settings.ts`](../../packages/runtime/src/workspace-settings.ts), the persistence substrate

## Declare a settings definition in shared code

```ts
// features/notes/shared/settings.ts
import { defineSettings } from "@uix/api/settings";
import { Type } from "typebox";

export const notesSettings = defineSettings({
  schema: Type.Object({
    maxNotes: Type.Number(),
  }),
  default: { maxNotes: 100 },
});
```

Wire it onto the feature definition. `defineFeature(...)` derives the accepted keys and key-specific get/set/onChange values from the definition:

```ts
// features/notes/index.ts
import { defineFeature } from "@uix/api/feature";
import { notesSettings } from "./shared/settings";

export const feature = defineFeature({
  id: "notes",
  settings: notesSettings,
  contribute(ctx) {
    const max = ctx.settings.get("maxNotes");
    ctx.settings.onChange("maxNotes", (next) => {});
    return {};
  },
});
```

Settings live on the corresponding manifest feature entry, not in a top-level feature-id map:

```json
{
  "features": [
    {
      "entry": "./features/notes/index.ts",
      "settings": { "maxNotes": 100 }
    }
  ]
}
```

The manifest entry does not repeat the feature id. The loaded `FeatureDefinition.id` is the only feature identity.

## Hydration rules

The loader merges the whole-object default into persisted values and validates the completed scope before either feature hook runs. Defaults fill and persist missing values, so they are not a runtime fallback layer.

- `defineSettings(...)` closes the object schema, so unknown persisted keys fail rather than being silently retained or deleted.
- A property with no default must be optional in the schema if it may be absent.
- The schema must allow `null` as an explicit persisted value.
- `undefined` is not a durable setting value and `set()` rejects it.
- Plain objects merge recursively, so newly added default fields materialize without clobbering existing fields.
- Arrays, scalars, and `null` are atomic values.

Settings writes commit only after every returned facet registers successfully. A failed hook or registration disposes the provisional scope and leaves durable settings unchanged.

## Read and write from a surface

Surfaces receive a feature-bound settings client through the surface host. Import the shared definition for types:

```tsx
import { useFeatureSetting } from "@uix/api/workspace";
import { notesSettings } from "../shared/settings";

function NotesPanel() {
  const maxNotes = useFeatureSetting(notesSettings, "maxNotes");
  if (maxNotes.loading) return null;
  if (maxNotes.error) return <p>{maxNotes.error.message}</p>;
  return <p>{maxNotes.value}</p>;
}
```

`useFeatureSetting(definition, key)` type-checks `key` against the shared definition and types the returned value and setter from that property. The main process remains authoritative and validates the complete candidate scope on every `set()`.

## Verify

Reload the workspace. The default materializes in `uix.workspace.json`, `ctx.settings` reads it in the backend, and `useFeatureSetting` shows it in the surface. An invalid persisted value fails loudly so the user or agent can fix the file.
