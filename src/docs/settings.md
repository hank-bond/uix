---
summary: "Durable settings in uix.workspace.json, two scopes: feature settings declared as TypeBox schemas and hydrated into manifest feature entries, and substrate-owned workspace namespaces (e.g. agent.defaultModel) under top-level settings."
status: active
---

# Settings

Durable settings live in `uix.workspace.json` in two scopes: **feature settings**, declared by a feature and stored on its manifest feature entry, and **workspace settings**, owned by the substrate and stored under the manifest's top-level `settings` object keyed by namespace. Both scopes share one validation/persistence substrate and one flat scope-id space — a feature id can never collide with a workspace namespace (activation fails on the duplicate).

## Feature settings

Features declare durable settings on their `FeatureDefinition`, before `context()` and `contribute()` run. Put the keyed feature settings in feature-shared code so backend and workspace surface code import the same keys, schemas, defaults, and TypeScript types:

```ts
// features/chat/shared/settings.ts
import { defineSettings } from "@uix/api/settings";
import { Type } from "typebox";

export const chatSettings = defineSettings({
  statusBar: {
    schema: Type.Object({
      order: Type.Array(Type.String()),
      hidden: Type.Array(Type.String()),
    }),
    default: {
      order: ["model", "context"],
      hidden: [],
    },
  },
});
```

```ts
// features/chat/index.ts
import type { FeatureDefinition } from "@uix/api";

import { chatSettings } from "./shared/settings";

export default {
  id: "chat",
  settings: chatSettings,
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

- every declared setting entry has a `schema`; the settings object's property name is the key;
- `default` is optional: omitting it declares an **optional setting** that reads `undefined` and writes nothing to the manifest until the first `set()`;
- missing / `undefined` values hydrate from the default (when one is declared);
- `null` is an explicit persisted value and must be allowed by the schema;
- plain objects merge recursively so newly added default fields materialize without clobbering existing fields;
- arrays, scalars, and `null` are atomic values;
- unknown persisted setting keys fail that feature's activation rather than being silently deleted;
- invalid persisted values fail loudly so the user or agent can fix the file.

Defaults fill missing values only. If a later feature version changes a default after a workspace has already materialized a value, the workspace keeps its current value.

## Backend API

Backend feature code uses feature-bound `ctx.settings` (a `SettingsHandle` — the same scope-neutral get/set/onChange shape workspace namespaces use):

```ts
const value = ctx.settings.get("statusBar");
ctx.settings.set("statusBar", { order: ["context", "model"], hidden: [] });
const unsubscribe = ctx.settings.onChange("statusBar", (next) => {});
```

`set()` validates against the declared schema, updates memory, schedules an atomic write to `uix.workspace.json`, and fires `onChange` synchronously. External edits to the workspace file are picked up on `/reload`; there is no public file watcher API. Reload mirrors first load: the manifest on disk is the source of truth, so pending debounced in-memory settings that have not flushed are discarded.

## Surface API

Workspace surfaces receive a feature-bound settings client through the surface host. Surface code imports its own shared feature settings for types and frontend validation:

```tsx
import { useFeatureSetting } from "@uix/api/workspace";

import { chatSettings } from "../shared/settings";

function StatusBar() {
  const statusBar = useFeatureSetting(chatSettings, "statusBar");

  if (statusBar.loading) return null;
  if (statusBar.error) return <p>{statusBar.error.message}</p>;

  return statusBar.value?.order.map((id) => <span key={id}>{id}</span>);
}
```

`defineSettings(...)` preserves the exact setting keys and type-checks each default against that setting's TypeBox schema. `useFeatureSetting(featureSettings, key)` type-checks `key` against the shared settings and types the returned value and setter from that key's schema. The main process remains authoritative and validates every `set()` against the registered backend schema.

## Workspace settings

The substrate owns a small set of workspace-level settings, keyed by namespace under the manifest's **top-level** `settings` object — beside `features`, not inside any feature entry:

```json
{
  "name": "My Workspace",
  "settings": {
    "agent": {
      "defaultModel": {
        "provider": "anthropic",
        "id": "claude-sonnet-4-5"
      }
    }
  },
  "features": []
}
```

Workspace namespaces are **not user-registerable**: the substrate registers the namespaces it needs before any feature loads. Today that set is exactly one:

- **`agent.defaultModel`** _(optional)_ — the workspace default model, used before a pi session exists and as the default for new sessions/branches that carry no `model_change` entry. Absent until the pilot first selects a model; a fresh manifest gains no `settings` block until then. See [`agent.md`](./agent.md) for how selection flows through the agent channels.

Rules:

- hydration and validation are the same as feature settings (same schema pass, same unknown-key rejection, same debounced atomic write, same disk-wins `/reload`);
- an unknown namespace under manifest-level `settings` rejects the load pass;
- namespaces register before features, so a feature whose id collides with a namespace fails activation on the duplicate-scope check;
- workspace settings are main-process-only — features get no handle to them. Model selection, for example, goes through the agent channels (`select_model`), never by a surface mutating `agent.defaultModel` directly.
