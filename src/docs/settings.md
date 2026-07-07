---
summary: "Feature-scoped durable workspace settings: features declare TypeBox schemas with explicit defaults, the loader hydrates missing values into manifest feature entries, and backend code reads/writes validated values through ctx.settings."
status: active
---

# Settings

Features declare durable settings on their `FeatureDefinition`, before `context()` and `contribute()` run:

```ts
import type { FeatureDefinition } from "@uix/api";
import { Type } from "typebox";

const StatusBarSettings = Type.Object({
  order: Type.Array(Type.String()),
  hidden: Type.Array(Type.String()),
});

export default {
  id: "chat",
  settings: [
    {
      key: "statusBar",
      schema: StatusBarSettings,
      default: {
        order: ["model", "context"],
        hidden: [],
      },
    },
  ],
  contribute(ctx) {
    const statusBar = ctx.settings.get("statusBar");
    // ...
    return {};
  },
} satisfies FeatureDefinition;
```

Settings live on the corresponding manifest feature entry, not in a top-level feature-id map:

```json
{
  "features": [
    {
      "entry": "./features/chat/index.ts",
      "settings": {
        "statusBar": {
          "order": ["model", "context"],
          "hidden": []
        }
      }
    }
  ]
}
```

The manifest entry does not repeat the feature id. The loaded `FeatureDefinition.id` is the only feature identity; the loader binds settings to the manifest entry while activating that feature.

## Hydration and validation

During feature activation the loader validates each declared setting's default, hydrates missing values, and writes the expanded settings back to `uix.workspace.json` on a debounce.

Rules:

- every declared setting must have `key`, `schema`, and explicit `default`;
- missing / `undefined` values hydrate from the default;
- `null` is an explicit persisted value and must be allowed by the schema;
- plain objects merge recursively so newly added default fields materialize without clobbering existing fields;
- arrays, scalars, and `null` are atomic values;
- unknown persisted setting keys fail that feature's activation rather than being silently deleted;
- invalid persisted values fail loudly so the user or agent can fix the file.

Defaults fill missing values only. If a later feature version changes a default after a workspace has already materialized a value, the workspace keeps its current value.

## Backend API

Backend feature code uses `ctx.settings`:

```ts
const value = ctx.settings.get("statusBar");
ctx.settings.set("statusBar", { order: ["context", "model"], hidden: [] });
const unsubscribe = ctx.settings.onChange("statusBar", (next) => {});
```

`set()` validates against the declared schema, updates memory, schedules an atomic write to `uix.workspace.json`, and fires `onChange` synchronously. External edits to the workspace file are picked up on `/reload`; there is no public file watcher API.
