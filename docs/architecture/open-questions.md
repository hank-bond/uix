---
summary: "Parking lot for named but unresolved questions across the UIX substrate, documentation, and future apps."
kind: reference
status: active
---

# Open questions

These questions remain unresolved. A blocking question joins a milestone, then graduates into a [`decisions/`](../decisions/) record when resolved.

## Substrate

- **Agent-authored conversation blocks and [`2026-05-30-no-agent-ui-manipulation.md`](../decisions/2026-05-30-no-agent-ui-manipulation.md):** The decision prohibits agent control of live UI. A typed tool result could still author presentation for its own transcript output. Define that boundary before [`conversation-render-primitives.md`](../design/conversation-render-primitives.md) lands an agent-triggered component.
- **Channel transport expansion:** Electron IPC implements typed channels. Canvas separately owns a narrow iframe `postMessage` shim. Determine the adapter boundary before adding iframe or hosted channel transports.
- **Substrate-owned `postMessage` filtering:** Canvas manually checks message origin, source window, and type before writeback. Determine how the substrate can bind known resource origins and iframe windows into a filtered subscription.
- **Resource address handle after substrate-owned iframe transport:** `ResourceAddressHandle` combines a declarative route with imperative `toUrl()` and `toOrigin()` operations. A future iframe surface can make those conversions substrate-internal. Determine whether that surface model removes the public handle.
- **Slot taxonomy:** What named slots should the cockpit shell expose? Balance a useful minimum against premature layout commitments.
- **Feature reload during an agent turn:** If reload replaces active tools, should UIX delay replacement, abort the turn, or let the turn finish?

## Future apps (not substrate, but shaping it)

- **Code-reviewer application:** The original design lives in [`project-brief.md`](../../plans/archive/project-brief.md). Create a design thread when it becomes a composed feature set.
- **Knowledge base or wiki application:** This application remains unspecified. It can combine Pi extensions, UIX features, and state documents. [`canvas-data-channel.md`](../design/canvas-data-channel.md) sketches this application tier.
- **Shared application shape:** Both applications need rich surfaces, interactive blocks, durable artifacts, small channel diffs, and occasional turn-triggering events. The substrate must support both without hardcoding either.
