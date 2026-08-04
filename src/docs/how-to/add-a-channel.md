---
summary: "Add a typed channel: declare a schema-only contract, bind handlers, publish events, and consume the client from a surface."
kind: how-to
status: active
read_when: "Read when adding a channel to a feature, or when asked to add a channel."
---

# Add a channel to a feature

A **channel** groups frontend-to-backend request operations with backend-published events. Shared code declares one schema-only `ChannelContract`. The backend binds handlers and publishes events. A surface consumes a fully typed client derived from that same value.

Files involved:

- [`src/api/channels.ts`](../../../src/api/channels.ts), `ChannelContract`, `withHandlers`, `FeatureEventPublisher`
- [`src/api/channel-resolution.ts`](../../../src/api/channel-resolution.ts), canonical-id derivation
- [`src/api/workspace.ts`](../../../src/api/workspace.ts), `ChannelClient`, `createChannelClient`, `defineSurface`

The reference for a real channel pair is [`src/features/canvas/shared/channels.ts`](../../../src/features/canvas/shared/channels.ts) (contract) and [`src/features/canvas/backend/contributions/channels.ts`](../../../src/features/canvas/backend/contributions/channels.ts) (handlers + publisher).

## Declare a contract in shared code

Put the schema-only contract in feature-shared code so backend and surface both consume the same value. Use TypeBox schemas:

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

- **Requests** describe a frontend-to-backend operation with request and response schemas.
- **Events** describe payloads the backend publishes and surfaces observe.
- Use `Type.Void()` for acknowledgement-only requests. It communicates completion and backpressure without a response body.
- `feature` is the owning id, stated once. The substrate checks it at every binding. A contract can't register or publish under the wrong namespace.

## Bind backend handlers

Backend code merges executable handlers into the shared contract with `withHandlers(...)`. It requires one handler for every declared request, enforced by TypeScript:

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
        await saveNote(text);
      },
    },
  },
);
```

Return the result through the feature's `channels` facet:

```ts
// features/notes/index.ts
import { defineFeature } from "@uix/api/feature";
import { notesChannelsContribution } from "./backend/channels";

export const feature = defineFeature({
  id: "notes",
  contribute() {
    return { channels: [notesChannelsContribution] };
  },
});
```

Handler input and output derive from the request and response schemas, so backend code receives typed domain values. The transport boundary alone accepts unknown payloads.

## Publish backend events

The feature context exposes a feature-bound event publisher factory. Mint the publisher once in a `context` hook and return it merged onto `ctx`, so your backend helpers and handlers can close over it. Presenting the shared contract mints only its declared event capabilities:

```ts
// features/notes/backend/context.ts
import type { FeatureContext } from "@uix/api/feature";
import type { FeatureEventPublisher } from "@uix/api/channels";
import { notesChannels } from "../shared/channels";

export type NotesContext = FeatureContext & {
  events: FeatureEventPublisher<typeof notesChannels>;
  saveNote: (text: string) => Promise<string>;
};

export function createNotesContext(ctx: FeatureContext): NotesContext {
  return {
    ...ctx,
    events: ctx.channels.createPublisher(notesChannels),
    saveNote,
  };
}
```

Wire it into the feature so `contribute` and your handlers receive it, then publish from the authoritative write:

```ts
export const feature = defineFeature({
  id: "notes",
  context: createNotesContext,
  contribute(ctx) {
    return {
      channels: [
        withHandlers(notesChannels, {
          add: {
            async handler({ text }) {
              const id = await ctx.saveNote(text);
              ctx.events.added({ id });
            },
          },
        }),
      ],
    };
  },
});
```

Publish calls validate at compile time from the event schema. The main transport also validates payloads when clients receive them. This mirrors how Canvas does it: see [`src/features/canvas/backend/context.ts`](../../../src/features/canvas/backend/context.ts) and [`src/features/canvas/backend/contributions/channels.ts`](../../../src/features/canvas/backend/contributions/channels.ts).

## Consume the typed client from a surface

A surface binds the contract through `defineSurface(...)`, and `render` receives the derived `ChannelClient`:

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

Inside a component, the client's request methods return typed promises, while event methods return unsubscribe functions:

```tsx
function Notes({ client }: { client: ChannelClient<typeof notesChannels> }) {
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = client.events.added(({ id }) => setAdded(id));
    return unsubscribe;
  }, [client]);

  return (
    <button type="button" onClick={() => client.requests.add({ text: "hi" })}>
      Save
    </button>
  );
}
```

Request returns resolve with the response type. Event subscriptions must be disposed (usually through React effect cleanup). See [`add-a-surface.md`](./add-a-surface.md) for more on surfaces and styles.

## Id derivation

You author feature-local operation names. The facet derives two ids:

```text
notes + add   -> contribution id notes.channel.add   / transport id notes.add
notes + added -> contribution id notes.channel.added / transport id notes.added
```

The contribution id is the registry deduplication key. The canonical channel id is the transport address. Both are nominal brands inside UIX. You never write them by hand.

## Boundary validation

Schemas validate domain formats, not only primitive JSON shapes. A constrained wire string should use a TypeBox schema with a branded static type. Successful parsing then gives backend code a typed value instead of an unchecked string. Apply this at every deserialization boundary, including channel requests, agent tool input, and resource parameters.

## Sensitive logging

Every request, response, and event crossing appears in terminal logs (and optionally raw NDJSON). A descriptor can carry `log` with `describeRequest`, `describeResponse`, or `describeEvent`. The returned description replaces that direction's payload in both log sinks. Contracts carrying credentials, authorization links, codes, or secrets must describe every sensitive direction.

## What happens on bind

The channel registry validates unknown requests and handler responses at the transport boundary, while preserving contract-owned log descriptions. Canonical-id reservations remain recoverable across transport acquisition and disposal failures. Disposal removes the feature's routes without unregistering the application-wide transport. See [`src/main/channel-registry.ts`](../../../src/main/channel-registry.ts).
