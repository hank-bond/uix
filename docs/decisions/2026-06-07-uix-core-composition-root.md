---
summary: "UIX-core's agent contributions (tools, hooks, transforms) register through one in-process pi extension at a single root that fixes their order explicitly, rather than scattered across modules."
status: accepted
---

# UIX-core agent contributions compose at one ordered root

UIX-core contributes to its owned pi session as an in-process `ExtensionFactory` ([session-file-as-state-substrate](./2026-06-06-session-file-as-state-substrate.md)). As contributions grow past the canvas tools — input transforms, per-turn `CustomEntry` writes, future message taps — the question is how they are organized.

**The fact that forces the answer.** pi dispatches every hook by registration order with **no priority field**: `runner.js` runs `for (const ext of this.extensions) for (const handler of ext.handlers.get(event))`, and `emitInput` threads each transform's output into the next (`handled` short-circuits, `transform` replaces the running text). Order is therefore **semantic** for every mutating hook — `input` transforms chain, `before_agent_start` system-prompt edits chain, `tool_call` mutations are visible to later handlers. The registration sequence _is_ the composition semantics, and there is no knob to re-order after the fact.

**Decision.** UIX-core's agent contributions register through a **single composition root** that runs per-subsection facet functions (`(pi: ExtensionAPI) => void`) in an **explicit, fixed order**. The ordered list is the one authority on composition order and doubles as the dependency graph (position encodes "X registers before Y"). Do **not** scatter pi `on(...)` / `registerTool` calls across modules where order becomes emergent from import order.

**Rejected.**

- _Scattered registration_ (each module calls `pi.on` where convenient): composition order becomes an accident of import order, unrecoverable because pi exposes no priority. This is the failure mode the decision exists to prevent.
- _A priority-number scheme_: pi offers none; we would re-implement ordering above pi for no gain over an explicit, readable list — and a list also expresses dependencies a priority number cannot.

**Scope — what this does _not_ decide.** The generalization of subsections into a `Feature` interface carrying agent / block / pane / service facets, the override model, the communication topology, and the concept vocabulary are an **exploring** thread, not committed here: [uix-core-composition](../design/uix-core-composition.md). Today the root is a literal ordered array of concrete functions; the registry generalization is deferred (hardcode-along-the-grain). This extends [pi-self-extension-ethos](./2026-06-05-pi-self-extension-ethos.md) (primitives registered and composed) and is the agent-surface companion to the render-axis thread [conversation-render-primitives](../design/conversation-render-primitives.md).
