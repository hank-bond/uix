---
summary: "Shared ChannelContract values derive validated backend handlers, feature-bound event publishers, and typed workspace request and event clients."
kind: reference
status: active
---

# Channels

A feature channel groups request operations and backend-published events. Shared code declares one schema-only `ChannelContract`; backend and surface code consume that same value.

The contract states its owning feature id once. Binding handlers, minting publishers, and creating clients all verify or derive ownership from that field.

## Declare a contract

Define contracts in feature-shared code with TypeBox schemas:

```ts
import { Type } from "typebox";
import type { ChannelContract } from "@uix/api/channels";

export const notesChannels = {
  feature: "notes",
  requests: {
    save: {
      requestSchema: Type.Object({ id: Type.String(), text: Type.String() }),
      responseSchema: Type.Void(),
    },
  },
  events: {
    changed: {
      event: Type.Object({ id: Type.String() }),
    },
  },
} as const satisfies ChannelContract;
```

Requests describe a frontend-to-backend operation with request and response schemas. Events describe payloads that the backend can publish and surfaces can observe.

Use `Type.Void()` for acknowledgement-only requests. This schema communicates completion and backpressure without a response body.

## Bind backend handlers

Backend code merges executable handlers into the shared contract:

```ts
import { withHandlers } from "@uix/api/channels";

const notesChannelContribution = withHandlers(notesChannels, {
  save: {
    async handler(request) {
      await saveNote(request.id, request.text);
    },
  },
});
```

`withHandlers()` requires one handler for every declared request. Handler input and output types derive from the request and response schemas.

Return the result through the feature's `channels` facet:

```ts
contribute() {
  return { channels: [notesChannelContribution] };
}
```

The transport boundary alone accepts unknown payloads. Feature handler code receives schema-derived domain types.

## Publish backend events

The feature context exposes a feature-bound event publisher factory. Presenting the shared contract mints only its declared event capabilities:

```ts
context(ctx) {
  return {
    events: ctx.channels.createPublisher(notesChannels),
  };
}

// Later, after the authoritative write:
ctx.events.changed({ id });
```

Publish calls validate at compile time from the event schema. The main transport also validates payloads when clients receive them.

## Consume a typed client

A surface binds a contract through `defineSurface()`:

```tsx
import { defineSurface } from "@uix/api/workspace";

export const surface = defineSurface({
  name: "notes",
  contract: notesChannels,
  render(client) {
    void client.requests.save({ id: "daily", text: "Draft" });
    return null;
  },
});
```

The substrate gives `render()` a `ChannelClient` derived from the contract. Request methods return typed promises, while event methods return unsubscribe functions.

A component can subscribe through the client received by its owning surface. Dispose every subscription through React effect cleanup or another matching lifetime.

## Id derivation

Authors declare feature-local operation names. The channel facet derives two ids:

```text
notes + save    -> contribution id notes.channel.save / transport id notes.save
notes + changed -> contribution id notes.channel.changed / transport id notes.changed
```

The contribution id is the registry deduplication key. The channel canonical id is the transport address. Both are nominal brands inside UIX.

## Boundary validation

Schemas must validate domain formats, not only primitive JSON shapes. A constrained wire string should use a TypeBox schema with a branded static type.

For example, Canvas validates each wire key with `CanvasKeySchema`. Successful parsing gives backend code a `CanvasKey` instead of an unchecked string.

Apply this pattern at every deserialization boundary, including channel requests, agent tool input, resource parameters, and user-supplied identifiers.

## Sensitive wire logging

Every request, response, and event crossing appears in terminal logs. Raw Newline-Delimited JSON (NDJSON) logging can also capture these crossings.

A descriptor can provide `describeRequest`, `describeResponse`, or `describeEvent`. The returned description replaces that direction's payload in both log sinks.

Contracts carrying credentials, authorization links, codes, or secrets must describe every sensitive direction. Ordinary channels retain raw payload logging by default.

## Substrate contracts and iframe messages

The reserved `agent` contract owns agent operations. The reserved `uix` contract owns surfaces, feature settings, and keybinding synchronization.

These contracts are substrate wiring, not capabilities that a feature can register under another owner. Feature ids `agent` and `uix` are reserved.

Canvas iframe content does not receive a workspace channel client. Its injected shim accepts narrow trusted interactions and forwards them to the Canvas surface.

See [`agent.md`](./agent.md) for the agent contract and [`features.md`](./features.md) for feature registration.
