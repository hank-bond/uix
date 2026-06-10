---
summary: "Transcript items are keyed the moment pi persists them — pre-key items carry a transport-only handle and rekey once in place — over a session-long backend alias map or holding items until durable; durable interactions gate on the key, ephemeral ones never need it."
status: accepted
---

# Transcript items are keyed on persist, with one rekey

A transcript item needs an address that survives replay and branch navigation before rich blocks can own state or actions ([conversation-render-primitives](../design/conversation-render-primitives.md)). Pi mints that address — the session entry id — only when it persists the entry, which for streaming assistant messages and the instant user echo is _after_ the renderer already shows a row. Something has to bridge the gap.

**Decision.** An item is in one of two states:

- **Pre-key** — it carries a transport handle: a nonce whose only job is routing streaming replaces to the right row (and surviving delivery hiccups), never a state key. Pre-key items accept no durable interactions; the renderer gates on the key (which arrives together with `complete`, so the gate is the semantics a half-streamed block wants anyway).
- **Keyed** — the canonical pi-session-derived id, attached the moment main observes pi's append. The transition is **one in-place rekey on the wire** (a replace that names the old handle); the renderer swaps the id and keeps the row's position.

Two consequences do most of the simplifying:

- **Tool rows are born keyed.** Pi persists the assistant message (which contains the toolCall blocks) _before_ `tool_execution_start` fires, so live tool rows can use the replay derivation `<assistantEntryId>:tool:<toolCallId>` from birth — no handle, no rekey. Only streaming assistant rows and the user echo are ever pre-key; displayed custom messages don't stream and are held one tick and emitted keyed.
- **Ephemeral vs durable is the interaction split.** Ephemeral reactions (scroll, highlight, open — nothing persisted refers to the item) may fire pre-key off the handle. Durable effects (state writes, persisted references, tool-result conversion) require the key; effects initiated pre-key are **queued in main** until the key lands — main is already watching appends, so resolution is awaiting a promise it can fulfill. The wait is intrinsic in every model: nobody can durably reference an id that does not exist yet.

**Rejected.**

- _Session-long backend alias map_ (renderer keeps provisional ids forever; main translates every inbound id): the map becomes a permanent ledger every durable write path must remember to consult, and a forgotten resolve writes a provisional id into the session file — fails dirty, into the durable record. Keyed-on-persist fails safe (a button is briefly inert) and confines bookkeeping to per-row promises that die at keying.
- _Hold items until durable_ (emit each row once, already keyed): kills streaming (the assistant row exists on screen precisely so deltas have somewhere to render) and the instant user echo (persistence waits on the lazy auth-bearing session open at first prompt).

**Scope.** Main still owns all durable display/block state, keyed canonically and validated against the session on every inbound action (the renderer gate is UX, not the security boundary). The renderer may keep its own stable React key and treat `item.id` as data if the one remount per rekey ever bites — renderer-local bookkeeping, not a protocol commitment. Build: [durable-transcript-identity](../plans/durable-transcript-identity.md); reasoning trail: [conversation-render-primitives](../design/conversation-render-primitives.md).
