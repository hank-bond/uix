---
summary: "Durable settings in uix.workspace.json, two scopes: feature settings declared as TypeBox schemas and hydrated into manifest feature entries, and substrate-owned workspace namespaces such as agent model preferences and the dynamic keybinding map under top-level settings."
status: active
---

# Settings

Durable settings live in `uix.workspace.json` in two scopes: **feature settings**, declared by a feature and stored on its manifest feature entry, and **workspace settings**, owned by the substrate and stored under the manifest's top-level `settings` object keyed by namespace. Both scopes share one validation/persistence substrate and one flat scope-id space — a feature id can never collide with a workspace namespace (activation fails on the duplicate).

## Feature settings

Features declare durable settings on their `FeatureDefinition`, before `context()` and `contribute()` run. Put the feature's complete settings-scope schema and optional whole-object default in feature-shared code so backend and workspace surface code import the same keys, validation, defaults, and TypeScript types:

```ts
// features/chat/shared/settings.ts
import { defineSettings } from "@uix/api/settings";
import { Type } from "typebox";

export const chatSettings = defineSettings({
  schema: Type.Object({
    statusBar: Type.Object({
      order: Type.Array(Type.String()),
      hidden: Type.Array(Type.String()),
    }),
  }),
  default: {
    statusBar: {
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

During feature activation the loader merges the definition's whole-object default into persisted values and validates the completed scope against its one schema. The scope registers provisionally before `context()` and `contribute()` run: reads, validated writes, and feature-local listeners work during activation, but defaults and activation-time writes remain detached from `uix.workspace.json`. Only after every returned facet registers successfully does the loader commit the final scope, materialize it into the live manifest, and switch later writes to normal write-through. A throwing hook or facet registration disposes the provisional scope without changing durable settings, and sibling features continue activating.

Rules:

- every scope definition has one object schema; `Type.Object` provides named keys and `Type.Record` provides dynamically validated keys through the same path;
- `defineSettings(...)` closes the object schema so unknown persisted keys fail rather than being silently retained or deleted;
- the optional `default` must itself be a complete valid scope value;
- a property with no default must be optional in the TypeBox schema if it may be absent;
- missing values hydrate from the default object, and registered empty scopes materialize as `{}`;
- `null` is an explicit persisted value and must be allowed by the schema;
- `undefined` is not a durable setting value and `set()` rejects it; optional schema properties describe absence during hydration, not a deletion operation;
- plain objects merge recursively so newly added default fields materialize without clobbering existing fields;
- arrays, scalars, and `null` are atomic values;
- invalid persisted values fail loudly so the user or agent can fix the file.

Defaults fill and persist missing values; they are not a runtime fallback layer. If a later feature version changes a default after a workspace has already materialized a value, the workspace keeps its current value.

## Backend API

Backend feature code uses feature-bound `ctx.settings` (a `SettingsHandle` — the same scope-neutral get/set/onChange shape workspace namespaces use):

```ts
const value = ctx.settings.get("statusBar");
ctx.settings.set("statusBar", { order: ["context", "model"], hidden: [] });
const unsubscribe = ctx.settings.onChange("statusBar", (next) => {});
```

After activation commits, `set()` clones the current complete scope, replaces one key, validates the complete candidate against the declared schema, updates memory, writes through to the live manifest generation, and fires `onChange` synchronously. Persistence is debounced and atomically replaces `uix.workspace.json`; a final equality check skips no-op file writes. External edits are picked up on `/reload`; there is no public file watcher API. Reload mirrors first load: the manifest on disk is the source of truth, so a successful reload discards pending unflushed memory, while a rejected manifest leaves the previous live generation and its handles intact.

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

`defineSettings(...)` preserves the scope schema's exact keys and type-checks its whole-object default. `useFeatureSetting(featureSettings, key)` type-checks `key` against the shared settings object and types the returned value and setter from that property. The main process remains authoritative and validates the complete candidate scope on every `set()`.

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
      },
      "favoriteModels": [
        {
          "provider": "anthropic",
          "id": "claude-sonnet-4-5"
        }
      ]
    },
    "keybindings": {}
  },
  "features": []
}
```

Workspace namespaces are **not user-registerable**: the substrate registers the namespaces it needs before any feature loads. Today that set contains `agent` and `keybindings`:

- **`agent.defaultModel`** — the workspace default model, used before a pi session exists and as the default for new sessions/branches that carry no `model_change` entry. Absent until the pilot first selects a model.
- **`agent.favoriteModels`** — the workspace-local model shortlist. Each entry is a provider-qualified model reference; unavailable entries remain persisted so favorites return when a provider reconnects.
- **`keybindings`** — a flat dynamic record from canonical dotted action ids to one portable shortcut string or `null` for explicit unbinding. Malformed ids, shortcuts, and unknown value shapes reject the candidate rather than being retained silently.

A fresh manifest materializes both `settings.agent: {}` and `settings.keybindings: {}` even before values are chosen. This keeps the available configuration surface visible; later selections fill concrete properties. See [`agent.md`](./agent.md) for how model selection and favorites flow through the agent channels. The keybinding namespace is currently persisted and validated; renderer reconciliation and dispatch are not yet part of the shipped API.

Rules:

- initial load and reload stage one detached manifest generation, structurally validate composition and all workspace namespaces, hydrate defaults there, and promote it only after every workspace-level check succeeds;
- hydration and validation are the same as feature settings (same schema pass, same unknown-key rejection, same debounced atomic write, same disk-wins reload);
- an unknown namespace under manifest-level `settings` rejects the load pass;
- namespaces register before features, so a feature whose id collides with a namespace fails activation on the duplicate-scope check;
- workspace settings are main-process-only — features get no handle to them. Model selection and favorite changes go through the agent channels (`select_model` and `set_model_favorite`), never by a surface mutating `agent` settings directly; keybindings currently change through manifest edits plus reload.
