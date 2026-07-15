---
summary: "Feature entries are trusted local TS/JS modules listed explicitly in uix.workspace.json; each default-exports a FeatureDefinition loaded with jiti, lifetime-scoped under the reload bag, and wired only through @uix/api."
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

A feature entry default-exports a plain `FeatureDefinition`:

```ts
import type { FeatureDefinition } from "@uix/api";

export default {
  id: "hello",
  contribute(ctx) {
    ctx.log.info({}, "hello_loaded");
    return {};
  },
} satisfies FeatureDefinition;
```

The exported `id` is the feature identity. It owns contribution namespaces, channel ids, settings access, and logs. Workspace manifest entries do not duplicate the id; duplicate loaded feature ids fail activation for the later entry.

## Runtime loading

Feature entries are loaded with [`jiti`](https://github.com/unjs/jiti) in the main process. Entries can be `.ts` or `.js` files on disk and do not require rebuilding the Electron app.

The loader configures jiti with `moduleCache: false`, so reload evaluates the current source for the same path instead of returning a stale Node module instance.

jiti is not a sandbox. Features are trusted local code and run with the permissions of the Electron main process. Features must not import substrate internals; backend-facing capabilities come through `ctx` and `@uix/api`.

## Context and contributions

The `FeatureDefinition` shape is:

```ts
interface FeatureDefinition {
  id: string;
  settings?: SettingsDefinition;
  context?: (ctx: FeatureContext) => Record<string, unknown>;
  contribute(ctx: FeatureContext): FeatureContributions;
}
```

`context()` runs before `contribute()` and may return feature-local objects merged onto the context handed to `contribute()`. `settings`, when present, are declared before either hook runs so the loader can hydrate and validate workspace settings first.

`contribute()` returns facet contributions such as resources, channels, agent tools, Agent system-prompt sections, Pi skills, turn state, agent context, and surfaces. See [`contributions.md`](./contributions.md), [`channels.md`](./channels.md), [`settings.md`](./settings.md), and [`lifetimes.md`](./lifetimes.md).

## Reload

The renderer bridge exposes substrate reload as:

```ts
await window.uix.reload();
```

Reload re-reads the workspace manifest, refreshes workspace settings from disk, clears the current feature subtree, activates manifest entries again, publishes surface changes, and delegates to pi's native `session.reload()` path if a pi session already exists. It mirrors first load: disk wins over pending debounced in-memory settings.

Malformed manifests fail before clearing the current feature tree. Per-feature failures, including bad exports, reserved/duplicate ids, invalid settings, or throwing contribution code, are isolated: the failed entry is reported in the reload result and sibling entries continue activating.
