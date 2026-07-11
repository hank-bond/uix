---
summary: "Feature channel contracts declare request handlers and backend-published events with shared schemas; the current Workspace client and preload bridge consume those contracts directly while the public packaged-feature API is still forming."
status: stub
---

# Channels

UIX does not yet ship the final public packaged-feature channel API, but the current direction is in place for bundled features.

A feature channel contribution declares two operation kinds:

- **requests** — Workspace/front-end code asks the backend to do or return something; the backend registers a handler and the caller receives acceptance/result or an error;
- **events** — backend feature code publishes events; Workspace/front-end code subscribes to them.

Requests and events are grouped into one contribution for a feature. Request handlers are part of the backend contribution, not a separate merge step: shared feature code should export schemas/types/light parsers, while backend code owns executable handlers. A request contribution without a handler is not a complete request contribution.

The feature author declares local names and schemas. The channel facet derives both ids from the feature id and local name: the `ContributionId` (registry dedup) `${featureId}.channel.${name}`, and the `ChannelCanonicalId` (transport address) `${featureId}.${name}` with the facet segment dropped:

```text
canvas + writeback -> contributionId canvas.channel.writeback / canonicalId canvas.writeback
canvas + changed   -> contributionId canvas.channel.changed   / canonicalId canvas.changed
```

For channels, the canonical id is also the transport address. Both ids are nominal brands; the transport boundary casts to a plain string inline. The current Electron preload bridge still exposes legacy convenience methods on `window.uix`, but those methods now route canvas traffic through the same canonical channel ids.

Request handlers should be typed from their request/response schemas. Feature-authored handler code should not receive `unknown`; only the transport boundary deals in unknown raw payloads. Explicit `response: Type.Void()` is preferred for ack-only requests because it communicates that the request has completion/backpressure semantics but no response body.

Event schemas are not decorative. The channel facet should use event declarations to type and validate publish calls just as request declarations type and validate handlers. If runtime objects are split, name them honestly: request handler installables are request registrations; event declarations need their own normalized metadata/registration path for typed publishing.

## Boundary validation

Every channel payload is deserialized at a boundary. Boundary schemas should validate domain-specific value formats, not just primitive JSON shapes. When a wire string represents a constrained domain value, define its TypeBox schema with a branded static type so successful deserialization emits the domain type for the receiving side.

For example, canvas keys travel over the wire as strings, but the schema validates the key format and its static type is `CanvasKey`. Callers that already hold a `CanvasKey` can serialize it normally, while receivers that parse `CanvasKeySchema` regain the branded type after runtime validation.

Use the same pattern for other deserialization points, including agent tool input and user-provided identifiers: validate at ingress, emit the branded/domain type, and keep internal code from re-validating plain strings repeatedly.

## Sensitive wire logging

Every renderer/main request, response, and event crossing is observable in the terminal IPC log and, when enabled, the raw NDJSON wire log. Channel descriptors may attach typed logging descriptions with `describeRequest`, `describeResponse`, or `describeEvent`. The crossing is still recorded, but the returned description replaces the payload in both log sinks. Contracts carrying credentials, authorization URLs, codes, or other secrets must describe every potentially sensitive direction; ordinary channels keep raw-payload logging by default.

Agent events/history/prompt are still substrate-owned bridge operations. Canvas writeback/refresh/changed are feature channels. See [`agent.md`](./agent.md).
