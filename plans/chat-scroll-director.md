---
summary: "Replace Chat's unconditional bottom-scroll effect with a chat-owned semantic scroll director: stable transcript-row anchors, live turn-follow modes, end-of-turn positioning, and reflow preservation."
---

# Chat scroll director

Replace Chat's unconditional `scrollTop = scrollHeight` effect with one chat-owned controller for all programmatic transcript positioning. This is renderer behavior, not a substrate primitive: the controller consumes the existing `TranscriptItem` projection and the Chat DOM.

It builds on [conversation render primitives](../docs/design/conversation-render-primitives.md), especially durable/pre-key row identity, and respects [transcript keyed on persist](../docs/decisions/2026-06-09-transcript-keyed-on-persist.md). It follows the Chat work in [chat rendering polish](./chat-rendering-polish.md).

## Desired settings

```ts
type DuringTurnScrollMode =
  | "follow-bottom"
  | "pin-user-start"
  | "pin-first-assistant-start";

type AfterTurnScrollMode = "stay" | "last-assistant-start";
```

- `follow-bottom`: retain current naive follow behavior while the agent runs.
- `pin-user-start`: follow until the initiating user row reaches the top inset of the transcript viewport, then hold that row there as the turn grows.
- `pin-first-assistant-start`: the same policy, anchored to the first non-empty assistant row of the turn.
- `last-assistant-start`: at turn end, position the most recent assistant row at the viewport top so the human reads the completed response from its beginning.

A manual wheel/touch/keyboard scroll suspends automated positioning for that turn. Sending the next user message re-enables the selected policy.

## Anchor model

Do not add hidden layout elements per message. Each existing `article.msg` is the physical anchor. Give it a stable transcript-item id/ref and let the controller retain its viewport offset.

The controller must understand three anchor intents:

1. **Bottom affinity**: retain distance from the bottom (normally zero).
2. **Semantic turn anchor**: hold the initiating user, first assistant, or final assistant row at the configured top inset.
3. **Reading/action anchor**: preserve the clicked tool row during a settings mutation, or otherwise preserve the first visible transcript row.

Tool calls are born keyed. A streaming assistant row can rekey once. Migrate any active assistant anchor through the existing `previousId` replacement. The optimistic user echo is renderer-local, so the controller must adopt the canonical user row once it confirms.

## S1: Controller core and layout-mutation preservation

- Add stable row identity/ref registration to `ChatBlockFrame`.
- Replace the current item-change bottom-scroll effect in `Chat.tsx` with a `TranscriptScrollDirector` owned by the Chat surface.
- Track programmatic versus user scroll so manual reading always wins.
- Add a layout-mutation transaction: capture the active anchor before a tool display-setting write. After the confirmed setting render, measure the same row in a layout effect and compensate its `scrollTop` offset delta.
- Use bottom affinity when already near the bottom, an active semantic anchor when pinned, and the clicked tool row/first visible row otherwise.
- Disable native CSS scroll anchoring on the transcript container so it cannot double-compensate the controller.
- Cover expanding and contracting tool params above, at, and below the anchor.

Stop for review before S2.

## S2: Live-turn follow modes

- On prompt submission, track the initiating user row, then on the first non-empty assistant projection track the first assistant row. Update the latest assistant row throughout the turn.
- Implement `follow-bottom` and the two follow-until-pinned modes.
- A pinned anchor stays at the viewport top inset through streamed text, tool rows, and display-setting reflow.
- Reset transient tracking on session switch, history replacement, and a new user turn.
- Test pending-user confirmation and streaming-assistant rekey without losing the active anchor.

Stop for review before S3.

## S3: End-of-turn positioning and polish

- On `turn_end`, apply `afterTurnScrollMode`. `last-assistant-start` targets the final assistant row, not a tool row.
- Define a fallback when a turn has no assistant text (keep position is the safe initial choice).
- Choose instant versus reduced-motion-safe smooth positioning. Do not animate against an explicit manual-scroll suspension.
- Add focused interaction tests for long turns, tool-heavy turns, and rapid param-setting changes.

## Decisions to settle before S1

- Is the end-of-turn move instant or smooth by default?
- Does manually scrolling suppress the configured end-of-turn move too, or only live following?
- Should the pinned top inset align with the transcript padding or expose a user-configurable reading inset?
