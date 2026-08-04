---
summary: "Workspace manifests store schema-validated feature settings and substrate-owned agent, session, and keybinding namespaces with materialized defaults."
kind: reference
status: active
---

# Settings

Durable settings live in `uix.workspace.json` under two scopes. _Feature settings_ belong to a manifest feature entry. _Workspace settings_ belong to substrate namespaces under the top-level `settings` object.

Both scopes share one validation and persistence substrate. They also share one flat id space, so a feature id cannot match a workspace namespace.

## Feature settings

Features declare durable settings on `FeatureDefinition` before `context()` and `contribute()` run. Put the complete schema and optional whole-object default in feature-shared code. Backend and surface code then import the same keys, validation, defaults, and TypeScript types.

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
import { defineFeature } from "@uix/api";

import { chatSettings } from "./shared/settings";

export const feature = defineFeature({
  id: "chat",
  settings: chatSettings,
  contribute(ctx) {
    const statusBar = ctx.settings.get("statusBar");
    // ...
    return {};
  },
});
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

During activation, the loader merges the whole-object default into persisted values and validates the completed scope. The scope registers provisionally before either feature hook runs.

Reads, validated writes, and feature-local listeners work during activation. Defaults and activation-time writes remain detached from `uix.workspace.json` until every returned facet registers.

The loader then commits the final scope, materializes it into the live manifest, and enables normal write-through. A failed hook or registration disposes the provisional scope. Durable settings remain unchanged, and sibling features continue activating.

Rules:

- Every scope definition has one object schema; `Type.Object` provides named keys and `Type.Record` provides dynamically validated keys through the same path.
- `defineSettings(...)` closes the object schema so unknown persisted keys fail rather than being silently retained or deleted.
- The optional `default` must itself be a complete valid scope value.
- A property with no default must be optional in the TypeBox schema if it may be absent.
- Missing values hydrate from the default object, and registered empty scopes materialize as `{}`.
- `null` is an explicit persisted value and must be allowed by the schema.
- `undefined` is not a durable setting value and `set()` rejects it; optional schema properties describe absence during hydration, not a deletion operation.
- Plain objects merge recursively so newly added default fields materialize without clobbering existing fields.
- Arrays, scalars, and `null` are atomic values.
- Invalid persisted values fail loudly so the user or agent can fix the file.

Defaults fill and persist missing values; they are not a runtime fallback layer. If a later feature version changes a default after a workspace has already materialized a value, the workspace keeps its current value.

## Backend API

Backend feature code uses feature-bound `ctx.settings`. `defineFeature(...)` derives its accepted keys and key-specific get/set/onChange values from the feature's settings definition:

```ts
const value = ctx.settings.get("statusBar");
ctx.settings.set("statusBar", { order: ["context", "model"], hidden: [] });
const unsubscribe = ctx.settings.onChange("statusBar", (next) => {});
```

After commit, `set()` clones the complete scope and replaces one key. It validates the candidate, updates memory, writes through, and fires `onChange` synchronously.

Persistence is debounced and atomically replaces `uix.workspace.json`. A final equality check skips no-op file writes.

Reload picks up external edits; UIX exposes no public file watcher. Disk is authoritative, so a successful reload discards pending unflushed memory. A rejected manifest leaves the previous generation and its handles intact.

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

The substrate owns a small set of workspace-level settings. Each namespace lives under top-level `settings`, beside `features` rather than inside a feature entry.

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
    "session": {
      "selected": {
        "sessionId": "019ea26e-c7a7-71a9-bb6c-a3d97d348988"
      }
    },
    "keybindings": {}
  },
  "features": []
}
```

Workspace namespaces are not feature-registerable. The substrate registers schema-carrying descriptors before any feature loads.

Passing the same descriptor to `forNamespace(...)` mints a schema-derived handle for keys, values, snapshots, and replacements. `Type.Record` scopes retain dynamic string keys with runtime pattern validation.

The substrate defines `agent`, `session`, and `keybindings`:

- **`agent.defaultModel`:** The workspace default model. It applies before a Pi session exists and when a new branch carries no `model_change` entry. The value remains absent until the user selects a model.
- **`agent.favoriteModels`:** The workspace-local model shortlist. Each entry is provider-qualified. Unavailable entries remain persisted so favorites return when a provider reconnects.
- **`session.selected`:** The selected durable session id. Startup opens that graph when it exists and otherwise falls back to the newest session. A successful New Session transition replaces the id only after restoration. Titles and first-message metadata remain authoritative in the session JSONL.
- **`keybindings`:** A flat record from canonical action ids to portable shortcuts or `null`. Malformed ids, shortcuts, and values reject the candidate.

A fresh manifest materializes empty `agent`, `session`, and `keybindings` namespaces before values are chosen. Later selections fill concrete properties.

Main request handlers reconcile defaults and atomically replace the complete keybinding map. Changes publish one confirmed snapshot.

The renderer joins confirmed bindings and conflicts into the active action catalog. Inactive persisted ids remain visible through a separate unresolved projection.

Confirmed unique bindings dispatch through the same invocation path used by surfaces. Conflicts fail closed.

Control, Command, and Alt bindings remain active in editable controls. Composition, AltGraph, Shift-only gestures, and locally handled events remain untouched.

A public renderer editing API has not shipped. See [`models-and-authentication.md`](./models-and-authentication.md) for model selection and favorites.

Rules:

- Initial load and reload stage one detached manifest generation. They validate composition and workspace namespaces, hydrate defaults, and promote only after every check succeeds.
- Hydration and validation are the same as feature settings (same schema pass, same unknown-key rejection, same debounced atomic write, same disk-wins reload).
- An unknown namespace under manifest-level `settings` rejects the load pass.
- Namespaces register before features, so a feature whose id collides with a namespace fails activation on the duplicate-scope check.
- Workspace settings remain main-process-only; features receive no handle. Agent channels change model and session state, while manifest edits plus reload change keybindings.
