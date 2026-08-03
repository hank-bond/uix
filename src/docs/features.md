---
summary: "Manifest-listed trusted TypeScript or JavaScript entries export settings-typed feature definitions that Jiti loads through reload-scoped @uix/api wiring."
kind: reference
status: active
---

# Features

A UIX **feature** is trusted local TypeScript/JavaScript loaded by the substrate main process. The workspace manifest is the composition record: there is no feature auto-discovery.

```json
{
  "name": "My Workspace",
  "features": [
    {
      "entry": "./features/chat/index.ts",
      "settings": {}
    }
  ]
}
```

`entry` is resolved relative to `uix.workspace.json` unless it is absolute. Manifest order is activation order.

A feature entry uses `defineFeature(...)` and exports the result under the loader contract name `feature`:

```ts
import { defineFeature } from "@uix/api";

export const feature = defineFeature({
  id: "hello",
  contribute(ctx) {
    ctx.log.info({}, "hello_loaded");
    return {};
  },
});
```

The helper changes no runtime shape. It preserves an authored settings definition so callback `ctx.settings` keys and values derive from that schema. The loader still receives and validates an ordinary object.

The exported `id` is the feature identity. It owns contribution namespaces, channel ids, settings access, and logs. Workspace manifest entries do not duplicate the id; if two entries export the same id, activation fails for the later entry.

## Activation and activated feature instances

A _feature definition_ is the plain exported `FeatureDefinition`. **Feature activation** is the process that validates it and its settings, constructs its context, runs `context()` and `contribute()`, and provisionally registers every contributed facet.

A successful activation produces one **activated feature instance**: the live context objects, callbacks, registered contributions, and per-feature lifetime bag owned by that manifest entry. The instance joins the workspace's **active feature composition** only after every facet registers successfully. A failed activation produces no instance and disposes every lifetime capability already acquired by its provisional bag.

Reloading an unchanged entry still creates a replacement activated feature instance. The replacement keeps the feature id but receives fresh context, callbacks, contributions, and lifetime bag.

Do not call an activated feature instance a generation. Reserve _generation_ for replaceable object graphs, such as staged manifests or Pi runtimes.

## Runtime loading

Feature entries are loaded with [`jiti`](https://github.com/unjs/jiti) in the main process. Entries can be `.ts` or `.js` files on disk and do not require rebuilding the Electron app.

The loader configures jiti with `moduleCache: false`, so reload evaluates the current source for the same path instead of returning a stale Node module instance.

Jiti is not a sandbox. Features are trusted local code and run with Electron main-process permissions. Features must not import substrate internals; backend capabilities come through `ctx` and `@uix/api`.

## Context and contributions

The `FeatureDefinition` shape is:

```ts
interface FeatureDefinition {
  id: string;
  settings?: SettingsDefinition;
  context?: (ctx: FeatureContext) => object;
  contribute(ctx: FeatureContext): FeatureContributions;
}
```

`context()` runs before `contribute()` and may return feature-local objects merged onto the context handed to `contribute()`. `settings`, when present, are declared before either hook runs so the loader can hydrate and validate a provisional feature scope first. `defineFeature(...)` carries that definition into both hooks' `ctx.settings` type. Both hooks may use the scope; its defaults and writes commit only after every returned facet registers successfully.

`contribute()` can return resources, channels, agent facets, turn state, agent context, and surfaces. A backend-only feature can omit surfaces without occupying workspace layout.

UIX starts Pi without active built-in tools. The reference `workspace_tools` feature contributes reason-bearing `read`, `write`, and `command` tools plus passthrough `edit`.

Bare workspace scaffolding instead copies editable passthrough `read`, `write`, `edit`, and `bash` source. See [`contributions.md`](./contributions.md), [`channels.md`](./channels.md), [`settings.md`](./settings.md), and [`lifetimes.md`](./lifetimes.md).

## Reload

The renderer bridge exposes substrate reload as:

```ts
await window.uix.reload();
```

Reload first commits turn state after restoration settles. If restoration remains pending, reload skips that commit instead of waiting.

Next, reload stages and validates one manifest generation before promotion. It then disposes the active composition and activates replacement feature instances.

If a Pi session exists, reload calls Pi's native `session.reload()` path. It restores selected-branch state before publishing surface changes.

Reload requests serialize. A successful reload gives disk precedence over pending debounced in-memory settings.

Malformed manifests or workspace settings fail before promotion or feature disposal. The active feature composition remains intact.

A per-feature failure after promotion disposes that feature's provisional bag and names the failed entry. Sibling activation continues.
