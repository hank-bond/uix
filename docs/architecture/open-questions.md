---
summary: "Parking lot for named but unresolved questions across the UIX substrate, documentation, and future apps."
kind: reference
status: active
---

# Open questions

Things we've named but not resolved. Each gets pinned to a milestone when it becomes blocking; when resolved, it graduates to a [decision](../decisions/).

## Substrate

- **Agent-authored conversation blocks vs. [no-agent-ui-manipulation](../decisions/2026-05-30-no-agent-ui-manipulation.md).** That decision says the agent edits files, not the UI. Letting the agent emit a typed, registered conversation block (e.g. `<rich-diff>` via a tool) needs the boundary drawn explicitly: the agent may author presentation of _its own turn output_ into the transcript, but may not hold UI handles or mutate other panes except through their file/channel contracts. Resolve and graduate to a decision when [conversation-render-primitives](../design/conversation-render-primitives.md) lands its first agent-triggered component.
- **Channel transport unification.** One API, two transports (in-process + `postMessage`). Where does the boundary live — at the channel itself, or at a transport adapter behind it?
- **Substrate-owned postMessage origin/source filtering.** Currently the canvas feature hand-rolls `window.addEventListener("message")` with manual origin, source-window, and message-type checks for writeback. The substrate knows the resource origin (from the route), could know the iframe window (it manages the React tree), and could route typed messages. The feature should subscribe to filtered messages, not filter raw transport events itself.
- **Resource address handle dissolves when surface contributions own transport.** The `ResourceAddressHandle` returned by `createResourceAddressHandle()` is a hybrid — `route` goes into the contribution (push), but `toUrl()` and `toOrigin()` are called imperatively in renderer code. When surface contributions let features declare "render resource X at slot Y" and the substrate owns the iframe plus message routing, those conversion operations and the handle itself become dead code — the substrate handles all transport concerns.
- **Slot taxonomy.** What named slots does the cockpit shell expose? Minimum useful set vs. risk of overcommitting to a layout.
- **Feature reload semantics for in-flight agent turns.** If a feature reload replaces tools used by an active turn, should UIX pause reload, abort the turn, or let the turn finish before replacement?

## Documentation

- **`src/docs/` ↔ `docs/` split discipline.** Easy to drift. The habit: when a feature-facing API changes, the `src/docs/` page changes in the same commit. `docs/` may lag code; `src/docs/` may not.
- **How does the conventions collection divide responsibility** as the feature lifetime API grows? Cockpit-internal rules stay in [`conventions/`](./conventions/AGENTS.md), while feature-author rules belong in `src/docs/lifetimes.md`.

## Future apps (not substrate, but shaping it)

- **Code-reviewer app.** The original "reports + question blocks + side-quest" design lives in [`../../plans/archive/project-brief.md`](../../plans/archive/project-brief.md). When it becomes a composed feature set, it gets its own design doc.
- **Knowledge base / wiki app.** Not yet specified. It can decompose into Pi extensions for agent-side fetching or transformation, UIX features for surfaces and channels, and state documents — the "case 2 / application" tier sketched in [canvas-data-channel](../design/canvas-data-channel.md).
- **Shared shape between the two.** Both want rich rendered panes, inline interactive blocks, on-disk artifacts, and channels that send small diffs and occasional turn-triggering events. The substrate must support both cleanly.
