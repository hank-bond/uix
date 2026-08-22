---
summary: "Add a feature to a workspace: author the entry with defineFeature, declare it in uix.workspace.json, and reload."
kind: how-to
read_when: "Read when adding a feature to a workspace, or when asked to add a feature."
---

# Add a feature to a workspace

A UIX **feature** is the loadable unit that adds a coherent capability (a chat, a canvas, a report viewer) to a workspace. This page walks the minimal shape: a feature entry that contributes **every** facet, wired end to end and declared in the manifest.

Files involved:

- [`packages/api/src/feature.ts`](../../packages/api/src/feature.ts), `FeatureDefinition`, `WorkspaceFeatureContributions`, `AgentFeatureContributions`
- [`packages/api/src/workspace.ts`](../../packages/api/src/workspace.ts), `defineSurface`

A real feature combining every facet is [`src/features/canvas/`](../../src/features/canvas/). Use it as the reference for a complete contribution set.

## Author the entry

Create a directory for your feature with an `index.ts` entry that exports a `defineFeature(...)` result under the contract name `feature`:

```ts
// features/hello/index.ts
import { defineFeature } from "@uix/api/feature";

export const feature = defineFeature({
  id: "hello",
  workspace(ctx) {
    ctx.log.info({}, "hello_loaded");
    return {};
  },
});
```

`id` is the feature's identity. It owns contribution namespaces, channel ids, settings access, and logs. Workspace manifest entries do not repeat the id. If two entries export the same id, activation fails for the later one.

`workspace(ctx)` runs once per feature activation. `agent(ctx)` runs once for each `AgentInstance`. Both contexts provide `documents`, `settings`, `channels`, and `log`. In an Agent factory, mutable document current bytes are scoped to that viewpoint while immutable versions remain shared. Event publication from a Workspace factory has Workspace scope. Event publication from an Agent factory has that Agent's session scope.

Create mutable Agent state inside `agent(ctx)` and let returned callbacks close over it. Features access external state only through `ctx` and the typed `@uix/api` contracts, never by importing host internals.

## Declare it in the manifest

Add an ordered entry reference to `uix.workspace.json`. Manifest order is activation order.

```json
{
  "name": "My Workspace",
  "features": [
    {
      "entry": "./features/hello/index.ts",
      "settings": {}
    }
  ]
}
```

`entry` resolves relative to `uix.workspace.json` unless it is absolute. Then reload. The loader loads entries as `.ts`/`.js` from disk, so no Electron rebuild is needed:

```ts
await window.channels.reload();
```

## Workspace and Agent contributions

The two factories return different contribution groups:

```ts
// features/notes/index.ts
import { defineFeature } from "@uix/api/feature";

export const feature = defineFeature({
  id: "notes",
  settings: notesSettings,

  workspace(ctx) {
    const repository = createNotesRepository(ctx.documents);
    return {
      resources: [notesResource(repository)],
      channels: [notesWorkspaceChannels(repository)],
      agentChannelContracts: [notesAgentChannels],
      surfaces: ["./workspace/surface.tsx"],
    };
  },

  agent(ctx) {
    const buffer = createNotesBuffer(ctx.documents);
    return {
      channels: [notesAgentHandlers(ctx, buffer)],
      agentTools: [notesReadTool(buffer), notesWriteTool(buffer)],
      agentSystemPrompt: notesSystemPrompt,
      agentSkills: ["./skills/notes-authoring"],
      turnState: notesTurnState(buffer),
      agentContext: notesContext(buffer),
      [Symbol.dispose]: () => buffer[Symbol.dispose](),
    };
  },
});
```

Workspace contributions include resources, Workspace request handlers, Agent channel contracts, and surfaces. Agent contributions include Agent channel handlers, tools, prompt sections, skills, turn state, and model context. A returned object may implement `Disposable` or `AsyncDisposable`. UIX disposes it after removing its registrations.

The [`Canvas` feature](../../src/features/canvas/backend/contributions/index.ts) is the current reference. A backend-only feature can omit `surfaces`. A sibling how-to documents each facet:

- [`add-a-channel.md`](./add-a-channel.md), `channels` + `ctx.channels.createPublisher(...)`
- [`add-a-resource.md`](./add-a-resource.md), `resources` via `createResourceAddressHandle(...)`
- [`add-a-surface.md`](./add-a-surface.md), `surfaces` via `defineSurface(...)`
- The sections below cover settings, turn state, agent context, and agent tools.

## Settings

Declare a settings schema in shared code so backend and surface get the same types, defaults, and validation. `defineFeature` threads it into `ctx.settings`, deriving key-specific get/set/listen. See [`add-settings-to-a-feature.md`](./add-settings-to-a-feature.md) for the full workflow.

## Channels

A channel groups backend request handlers and backend-published events. Declare a schema-only contract in shared code and bind handlers with `withHandlers(...)`:

```ts
// features/notes/shared/channels.ts
import { Type } from "typebox";
import type { ChannelContract } from "@uix/api/channels";

export const notesChannels = {
  feature: "notes",
  requests: {
    add: {
      requestSchema: Type.Object({ text: Type.String() }),
      responseSchema: Type.Void(),
    },
  },
  events: {
    added: { event: Type.Object({ id: Type.String() }) },
  },
} as const satisfies ChannelContract;
```

```ts
// features/notes/backend/channels.ts
import { withHandlers } from "@uix/api/channels";
import type { ChannelContribution } from "@uix/api/channels";
import { notesChannels } from "../shared/channels";

export const notesChannelsContribution: ChannelContribution = withHandlers(
  notesChannels,
  {
    add: {
      async handler({ text }) {
        await persistNote(text);
      },
    },
  },
);
```

Return a Workspace-scoped handler from `workspace(ctx)`. For per-Agent state, return the schema-only contract through `workspace(ctx).agentChannelContracts` and the handler through `agent(ctx).channels`. A surface binds the same contract through `defineSurface`. See [`add-a-channel.md`](./add-a-channel.md).

## Agent tools

Feature tools reach Pi as `${featureId}__${name}`. A tool body is everything in Pi's `ToolDefinition` except `name`, re-exported through `@uix/api/agent-tools` so you get real Pi typing without importing host internals:

```ts
import type { AgentToolContribution } from "@uix/api/agent-tools";
import { Type } from "typebox";

const readParams = Type.Object({ key: Type.String() });

export const notesReadTool = (): AgentToolContribution => ({
  name: "read",
  tool: {
    description: "Read the note with the given key.",
    parameters: readParams,
    execute: async ({ key }) => ({ result: await readNote(key) }),
  },
});
```

UIX starts Pi with built-in tools inactive, so the feature composition defines the complete tool surface. The separate `agentToolOverrides` facet keeps intentional exact-name replacements (see [`packages/api/src/agent-tools.ts`](../../packages/api/src/agent-tools.ts) and the [`workspace-tools` feature](../../src/features/workspace-tools/) for an override example).

## System-prompt section and skills

`agentSystemPrompt` appends one stable Markdown section per feature to the agent's system prompt, in manifest order. Keep it short and always-relevant. Detailed optional workflows belong in an `agentSkills` entry, which Pi loads on demand from its `SKILL.md`:

```ts
agentSystemPrompt: `## Notes
Notes are persisted text documents. Represent meaningful state in the document so UIX can persist it.`,
agentSkills: ["./skills/notes-authoring"], // resolved relative to the entry file
```

## Turn state

Turn state holds branch-scoped durable state the model does not see. Each named cell has one schema plus `createSnapshot`/`restore`. The substrate compares cells independently and persists only changed ones:

```ts
import {
  defineTurnStateCell,
  type TurnStateContributions,
} from "@uix/api/turn-state";
import { Type } from "typebox";

export function notesTurnState(): TurnStateContributions {
  return {
    list: defineTurnStateCell({
      schema: Type.Record(Type.String(), Type.String()),
      createSnapshot: () => currentNoteMap(),
      restore: (state) => replaceNotes(state ?? {}),
    }),
  };
}
```

`restore(undefined)` means the selected branch has no value, so replace live state with defaults. Turn state restores on startup, session replacement, and reload.

## Agent context

Agent context holds changing model-visible state without rewriting the human prompt. A `materialize` contribution returns the body (and optional `details`) the model sees, derived from live state or turn-state history:

```ts
import type { AgentContextContribution } from "@uix/api/agent-context";

export const notesContext: AgentContextContribution[] = [
  {
    name: "note-count",
    description: "the current number of notes in the workspace.",
    materialize: async () => ({ content: `There are ${countNotes()} notes.` }),
  },
];
```

Buffers (`update`/`append`) offer UIX-managed alternatives that push state independently of the turn. The assembler emits one hidden `uix.state` message to the model. Surfaces do not see it.

## Surfaces

A surface is a frontend entry that the workspace mounts. It exports `surface`, a `defineSurface(...)` result:

```tsx
// features/notes/workspace/surface.tsx
import { defineSurface } from "@uix/api/workspace";
import { Notes } from "./Notes";
import { notesChannels } from "../shared/channels";

export const surface = defineSurface({
  name: "notes",
  contract: notesChannels,
  render: (client) => <Notes client={client} />,
});
```

A surface can omit `contract` when it needs only local state. See [`add-a-surface.md`](./add-a-surface.md) for styles, mounting, and best practices.

## What happens on load

Activation hydrates provisional settings, runs `workspace(ctx)`, and registers its contributions as one unit. It retains `agent(ctx)` in manifest order. Each `AgentInstance` calls those factories with fresh contexts and registers each returned object as one unit. A failed feature removes its partial work without aborting siblings.

Reload rejects while an Agent turn or feature-channel operation is active. An idle reload commits turn state, replaces Workspace features, rebuilds every live Agent feature bag, reloads initialized Pi runtimes, and restores each viewpoint. Malformed manifests or Workspace settings fail before replacement. Cleanup failures are reported after forward replacement completes. See [`packages/runtime/src/features/`](../../packages/runtime/src/features/) for the runtime.
