---
summary: "Feature channel contracts declare request handlers and backend-published events with shared schemas; the current Workspace client and preload bridge consume those contracts directly while the public packaged-feature API is still forming."
status: stub
---

# Channels

UIX does not yet ship the final public packaged-feature channel API, but the current direction is in place for bundled features.

A feature channel contract declares two operation kinds:

- **requests** — Workspace/front-end code asks the backend to do or return something; the backend registers a handler and the caller receives acceptance/result or an error;
- **events** — backend feature code publishes events; Workspace/front-end code subscribes to them.

The feature author declares local names and schemas. The channel facet derives canonical ids from the feature id and local name:

```text
canvas + writeback -> canvas.channel.writeback
canvas + changed   -> canvas.channel.changed
```

For channels, the canonical id is also the transport address. The current Electron preload bridge still exposes legacy convenience methods on `window.uix`, but those methods now route canvas traffic through the same canonical channel ids.

## Boundary validation

Every channel payload is deserialized at a boundary. Boundary schemas should validate domain-specific value formats, not just primitive JSON shapes. When a wire string represents a constrained domain value, define its TypeBox schema with a branded static type so successful deserialization emits the domain type for the receiving side.

For example, canvas keys travel over the wire as strings, but the schema validates the key format and its static type is `CanvasKey`. Callers that already hold a `CanvasKey` can serialize it normally, while receivers that parse `CanvasKeySchema` regain the branded type after runtime validation.

Use the same pattern for other deserialization points, including agent tool input and user-provided identifiers: validate at ingress, emit the branded/domain type, and keep internal code from re-validating plain strings repeatedly.

Agent events/history/prompt are still substrate-owned bridge operations. Canvas writeback/refresh/changed are feature channels. See [`agent.md`](./agent.md).
