---
summary: "Build keyed-on-persist transcript identity: main observes pi session appends (D0), items go pre-key→keyed with one in-place rekey and born-keyed tool rows (D1), durable block state rides uix.* custom entries written by main with pre-key effects queued (D2), and one branch-walk rehydrator joins state for replay and every uix.* consumer (D3)."
status: active
---

# Spec: durable transcript identity

Rich conversation blocks need stable identity before they can safely own state or actions. A choice/input block, annotation, scroll target, or cross-pane backlink needs an address that survives replay and branch navigation. The model is [transcript-keyed-on-persist](../decisions/2026-06-09-transcript-keyed-on-persist.md): items are **pre-key** (transport handle only, no durable interactions) until pi persists them, then **keyed** with the canonical session-derived id via one in-place rekey. State ownership follows [one-owner-per-state](../decisions/2026-06-09-one-owner-per-state.md).

This follows the transcript normalization work in [conversation-render-primitives](../design/conversation-render-primitives.md): main already normalizes pi live events and persisted session entries into UIX `TranscriptItem`s. This plan makes those item ids usable as state/action keys.

## Invariants

- Renderer sees one opaque `item.id` per row and sends actions back with that id.
- A pre-key id is a **transport handle** — a nonce for routing streaming replaces, never a state key. The renderer gates durable interactions on the key (arrives with `complete`).
- The pre-key→keyed transition is one rekey-capable replace on the wire (carries the prior handle); the renderer swaps the id in place, preserving row position. Rows that can be born keyed never rekey.
- Ephemeral interactions (nothing durable refers to the item) may fire pre-key off the handle; durable effects initiated pre-key are queued in main until the key lands — never written under a handle.
- Durable display/block state is main-owned, keyed by canonical id, persisted as `uix.*` custom entries; renderer state is a cache only. Main validates every inbound action id against the session (the renderer gate is UX, not the security boundary).
- Replayed items use canonical pi-session-derived ids directly; live and replay ids converge the moment a row completes.

## Verified pi facts (2026-06-09, dist source)

- Pi emits `message_end` to listeners **before** calling `sessionManager.appendMessage(event.message)`, synchronously after they return, **with the same object** — so object identity correlates live messages to appends, and the append (the only place the durable id is minted) is observable in the same tick.
- The assistant message containing the toolCall blocks is persisted **before** `tool_execution_start` fires — so tool rows can be born keyed.
- Custom messages persist via `appendCustomMessageEntry(customType, content, display, details)` — the `CustomMessage` object never reaches the manager, so generic third-party customs cannot correlate by identity; UIX-authored blocks carry an instance id in `details`, and a future pi post-persist event would close the gap properly.

## D0 — Session append observation

Wrap `appendMessage` (instance patch, original bound) on the `SessionManager` in the driver after opening/creating the manager and before `createAgentSession` receives it. The wrapper calls the original, takes the returned durable id, reads the entry with `getEntry(id)`, and notifies a UIX-owned observer. A local adapter over pi's current API — not a content mutation, not a session-file write; replace it with pi's official post-persist event if one ships. Add `appendCustomMessageEntry` observation only when a concrete custom-message consumer needs live durable ids.

Home the observer state in a dedicated identity module (`src/main/agent/identity.ts`), not forwarder closures — D1 and D2 both consume it.

## D1 — Keyed-on-persist ids

Per row kind:

- **Tool rows — born keyed, no handle.** When the wrapper observes an assistant append, parse the toolCall blocks (reuse `extractToolCalls`) and record `toolCallId → assistantEntryId`. At `tool_execution_start` the forwarder mints `<assistantEntryId>:tool:<toolCallId>` directly — identical to the replay derivation. Fallback if the record is missing (future pi reordering): pre-key handle + rekey like the other rows.
- **Assistant rows — pre-key while streaming.** Handle minted at `message_start`; `WeakMap<messageObject, handle>` recorded at `message_end`; when the wrapper observes the append (same tick), emit the final replace carrying the durable id and the prior handle.
- **User rows — pre-key at echo.** `prompt()` appends the echo before pi constructs any message object, so object identity can't help; keep a FIFO of pending echo handles and alias the oldest when the wrapper sees a `role: "user"` append (prompts are serialized by the composer). If the prompt errors before persistence, the row stays pre-key alongside the error item — correct, since nothing durable exists to reference.
- **Displayed custom messages — held one tick, emitted keyed.** They don't stream; defer the transcript append from `message_end` to the wrapper's observation and emit once with the entry id.

Wire change: `transcript_replace` gains an optional `previousId` (or a dedicated rekey event) so the renderer can swap an id in place without reordering. If the one remount per rekey ever bites (lost text selection at stream end), the renderer may keep its own stable React key and treat `item.id` as data — renderer-local, not a protocol change.

## D2 — Durable block state as `uix.*` custom entries

Block state lives in pi `CustomEntry` records — the hidden-state primitive: tree-ordered between messages, ignored by `buildSessionContext` (the model never sees it), skipped by transcript projection (the human never sees it), branch-aware for free, and pi's own `LabelEntry` (`{ targetId, label }`) is the precedent shape. Write via the C1 extension handle (`pi.appendEntry`) — this is the first real consumer the handle bridge-out was deferred for ([persistence-and-session-foundation](./persistence-and-session-foundation.md) C1).

- Entry shape: `uix.block-state` (or a per-block-type customType) with `{ targetId: <canonical item id>, state }`. Entries are **append-only**; mutable state is a last-entry-wins chain over the branch walk. This is why high-frequency UI state (tool-row expansion) is **not** durable state — it stays a renderer-local cache per [one-owner-per-state](../decisions/2026-06-09-one-owner-per-state.md); durable entries are for low-frequency, meaningful state.
- **First consumer: the choice/input block's submitted state** (written once per block, must survive replay or the block re-renders as answerable). Do not build a generic database ahead of it; the store interface can land with D0/D1, the first write rides the interactive-block proof.
- Action flow: renderer sends a typed, TypeBox-validated signal over a `uix:block-action` invoke channel (`canvasWriteback` is the existing precedent; the payload shape should fold into the future typed-channel substrate unchanged). Main's handler classifies it (ephemeral react vs durable write), validates the id against the session, persists the entry under the canonical id, and emits the updated joined item via `transcript_replace`.
- Pre-key actions: durable effects queue in main until the row keys (await the identity module's promise); ephemeral effects proceed immediately off the handle.

## D3 — One branch-walk rehydrator

Generalize history replay into a single rehydration pass with registered consumers: walk `getBranch()` once (root→leaf ordered), dispatch each entry by `customType`/type to registered reducers. `toTranscriptItems` is already this walk hardcoded — the transcript becomes the first reducer, and block state joins items before they reach the renderer (live items get the same joined state via `transcript_replace` once keyed, no rekey required).

Reducer registration lives **with the binding that writes the entries** (composition-root rule: one module owns write + rehydrate per `uix.*` key). Both fold patterns are just reducers over the same pass: accumulate-all (block state, last-per-target) and nearest-wins (the persistence plan's `uix.turn-state`, `uix.pane-visibility` latch). The rehydrator runs on startup, branch navigation, and session switch; future extensions contributing agent bindings register their durable keys the same way.

## Boundary

This plan does not build render registries, component APIs, or the choice/input block itself — only the identity and state substrate those blocks need (the block is D2's first consumer and lands with its own work). The renderer remains a consumer of opaque ids and normalized transcript/view items. The canvas-side rehydrator consumers (turn-state checkout, anchor seeding, visibility latch) are specified in [persistence-and-session-foundation](./persistence-and-session-foundation.md) and plug into D3's walk.
