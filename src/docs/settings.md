---
summary: "Feature-scoped durable workspace settings: features declare TypeBox schemas with defaults, the loader hydrates missing fields into each manifest feature entry, and backend code reads/writes validated values through ctx.settings."
status: active
---

# Settings

Features declare durable settings on their `FeatureDefinition`, before `context()` and `contribute()` run:

```ts
import { Type } from "typebox";

const StatusBarSettings = Type.Object({
  order: Type.Array(Type.String(), { default: ["model", "context"] }),
  hidden: Type.Array(Type.String(), { default: [] }),
});

export default {
  id: "chat",
  settings: [{ key: "statusBar", schema: StatusBarSettings }],
  contribute(ctx) {
    const statusBar = ctx.settings.get("statusBar");
    // ...
  },
};
```

Settings live on the corresponding feature entry in `uix.workspace.json`:

```json
{
  "features": [
    {
      "id": "chat",
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

During feature activation the loader hydrates missing fields from schema defaults and writes the expanded settings back to the workspace file. Defaults only fill missing fields; they never overwrite existing persisted values. If a later feature version changes a default, existing workspaces keep their current value. Invalid persisted values fail loudly so the user or agent can fix the file.

Backend feature code uses `ctx.settings`:

```ts
const value = ctx.settings.get("statusBar");
ctx.settings.set("statusBar", { order: ["context", "model"], hidden: [] });
const unsubscribe = ctx.settings.onChange("statusBar", (next) => {});
```

`set()` validates against the declared schema, updates memory, fires `onChange` immediately, and debounces an atomic write to `uix.workspace.json`. External edits to the workspace file are picked up on `/reload`; there is no public file watcher API.
