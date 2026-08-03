---
summary: "Exploring public React transcript presentation through separate tool and custom-message registries, typed payloads, durable interaction identity, fallback, and failure isolation."
kind: explanation
status: exploring
---

# Conversation render primitives

## Problem

Chat was UIX's first React surface, and its initial blocks were concrete components. The design question is which renderer seams deserve a public feature contribution. Pi's terminal UI offers useful precedent, but UIX must preserve React, transcript projection, feature lifetimes, and browser failure isolation.

## Current synthesis

UIX projects Pi's durable and live events into `TranscriptItem` values, then Chat renders each item as a block. The projection separates Pi session entries, UIX wire items, and React presentation.

Chat has type-specific React components for user, assistant, tool, custom, and error items. Tool presentation dispatch currently uses a first-party map keyed by exact tool name, with generic fallback for unknown or incompatible payloads.

Specialized Canvas, file, and command presentations demonstrate consumer-side selection. Agent-facing anchored results remain intact while the human display can hide mechanical gutters or disclose large payloads.

The public cross-feature renderer registry has not landed. A useful contract must keep executable React callbacks private, support lifetime-scoped replacement, and expose enough typed item state for streaming and errors.

Tool and custom-message presentation remain distinct axes. Tools carry call, progress, completion, and error semantics. Custom messages carry `customType`, model-facing content, display policy, and structured `details`.

Static rich blocks can render from one transcript item without durable interaction state. Interactive blocks require durable keyed identity and an explicit backend action contract before they can persist choices or references.

The agent may author presentation of its own output by calling a typed tool that commits or returns structured data. It must not receive live UI handles or mutate another surface outside that feature's authoritative contract.

React is the surface presentation boundary, not a commitment to one component library. Feature styles remain scoped, ordered, and independently owned.

### Pi precedent to retain

Pi separates tool renderers from custom-message renderers. Tool rendering receives call, partial result, completion, error, expansion, and row-local state. Custom messages separate model-facing `content`, human display policy, and typed render-only `details`. UIX should preserve those semantic axes while replacing Pi's terminal component with React.

A public contract should port the architecture, not Pi's terminal implementation. Tool definitions already provide schema and streaming semantics; custom messages cover notices and blocks that are not tool executions. Merging them into one generic renderer would discard useful lifecycle information.

### Proposed contribution contract

The likely shape remains two lifetime-scoped registries: one keyed by exact tool identity and one keyed by `customType`. Built-in presentations should eventually register through the same path as feature presentations. Unknown types and failed renderers must fall back to the underlying transcript content.

Agent-authored presentation should pass references rather than repeat large artifacts. A diff block can identify a resource and range while backend code computes structured `details`. The compact tool result remains model context; render-only details do not re-enter the model.

Build the contract before its package loader. First prove registration, fallback, streaming, replacement, and one typed component with in-tree features. Package discovery should later call the same API rather than define a second path.

### Interactive block boundary

A human interaction inside a block is initially a renderer event keyed by opaque item identity. It travels through a typed backend contract, which may convert it into a user message, tool continuation, or durable custom entry. The renderer never writes Pi state directly.

Static rich blocks need no durable state beyond their transcript item. Durable choices and references must wait for canonical persisted identity. Pre-key interactions may remain ephemeral; durable effects queue until the item receives its session identity.

### Deferred choices retained

- Keep tool and custom-message renderers separate unless a concrete shared abstraction preserves both lifecycles.
- Start with block-level presentation; inline prose directives require another parsing and identity design.
- Start append-only while reserving an instance identity for a future update-in-place use case.
- Let tools lead for streamed Agent artifacts; use standalone custom messages when no tool-row lifecycle is desired.
- Keep grouping and tool-count optimization out until enough contributed renderers create measured model or discovery pressure.
- Expose semantic styling parts without turning the base substrate into a theme or component-library ecosystem.

## Open questions

- What is the smallest public tool-presentation contribution that improves on Chat's private map?
- Should custom-message renderers share that contribution point or remain a separate registry?
- How does a renderer contribution prove payload types when transcript schemas can contain `unknown` tool data?
- Which durable block actions justify the remaining D2 transcript-state work?
- How should renderer failures fall back without losing the underlying transcript content?

## Log

### 2026-06-09 — user echo goes renderer-local; the transcript is eventually consistent

Follow-up to the keyed-on-persist entry below, out of code review of the D0/D1 implementation. The user echo had main emitting a pre-key row and rekeying it — but main is the _renderer's_ server (and pi is main's), so routing the echo renderer→main→renderer puts a hop in front of the first paint of the human's own words; an RTT once renderer→main is a real network. Resolution: the echo is an **optimistic renderer-local pending row** — composer state under [one-owner-per-state](../decisions/2026-06-09-one-owner-per-state.md), rendered dimmed/unconfirmed — and main emits the authoritative user row exactly once, **born keyed**, straight from the identity wrapper's observation of the persisted append (no FIFO, no user-row rekey; the user FIFO was deleted from the identity module). Pre-key transport handles now exist only for the streaming assistant row.

The named pattern is **eventual consistency**: display immediately, confirm via the canonical record from the server — and the canonical record is allowed to _differ_ (a future input-enrichment extension could classify or transform what was typed; the canonical version wins and replaces the gray row). Confirmation matches pending rows by text equality today (the persisted user entry is verbatim per C1); if canonical text ever diverges, the rule relaxes to confirm-oldest. This also names a small renderer-side contract that will recur for interactive blocks: "how to derive an optimistic transcript-row projection from a user action" lives in the renderer, while truth stays main-authored. The [transcript-keyed-on-persist](../decisions/2026-06-09-transcript-keyed-on-persist.md) decision was amended in place (same-day, pre-build) rather than superseded.

### 2026-06-09 — keyed-on-persist replaces the alias map; state gets one owner per value

Walked the identity design against pi's dist source and reversed D1's mechanism. Two verified facts did the work: pi emits `message_end` to listeners _before_ `appendMessage(event.message)` with the same object (so the append — where the durable id is minted — is observable in the same tick), and the assistant message containing toolCall blocks persists _before_ `tool_execution_start` (so tool rows can be **born keyed** with the replay derivation `<entryId>:tool:<toolCallId>` — no provisional id at all).

Three models were weighed. **Hold-until-durable** (emit each row once, already keyed) dies on streaming (the assistant row exists so deltas have somewhere to land) and on the instant user echo (persistence waits on the lazy session open at first prompt) — but the objection only holds for those two row kinds, which sharpened the question. **Session-long alias map** (renderer keeps provisional ids forever, main translates) keeps renderer ids stable but makes the map a permanent ledger every durable write path must consult; a forgotten resolve writes a provisional id into the session file — fails dirty into the durable record. Also: it doesn't actually avoid waiting — nobody can durably reference an id that doesn't exist yet, so the map's resolve degenerates to the same await in exactly the tight cases. **Keyed-on-persist** won: pre-key items carry a transport-only handle (a delivery nonce, not identity), rekey once in place when the append is observed, and interactivity gates on the key — which arrives with `complete`, so the gate is the semantics a half-streamed block wants anyway. The refinements that make it lossless: ephemeral interactions (nothing durable refers to the item) fire pre-key off the handle, and durable effects initiated pre-key **queue in main** until the key lands. Decision: [transcript-keyed-on-persist](../decisions/2026-06-09-transcript-keyed-on-persist.md); plan rewritten.

Downstream of identity, three more things settled. **Block state homes in pi `CustomEntry` records** (hidden from model and human, branch-aware, `LabelEntry` is the precedent shape `{targetId, …}`), superseding the D2 sidecar; append-only last-wins chains make low-frequency meaningful state (a choice block's submitted answer) the fit and high-frequency UI state (tool expansion) explicitly renderer-local. **State ownership got its invariant** — one owner per value, no durable-but-locally-overridable hybrids; renderer-managed presentation (localStorage fine, cache semantics), main-durable (session entries + content store), main app-local (window bounds), main RAM never an owner — [one-owner-per-state](../decisions/2026-06-09-one-owner-per-state.md). And **rehydration unified**: one branch walk with reducers registered per `customType` beside the binding that writes each key; `toTranscriptItems` is that walk hardcoded, so the transcript becomes the first reducer and the canvas consumers (turn-state, visibility latch, block state) plug into the same pass. The human canvas diff and pane visibility also became durable agent-visible custom messages at the submit boundary — specified in [persistence-and-session-foundation](../../plans/persistence-and-session-foundation.md) C3.

### 2026-06-08 — chat blocks, scoped styles, and first exact tool renderer

Landed the first hardcoded-along-the-grain renderer slice: `Conversation` became the shorter `chat` implementation under `src/renderer/chat/`, with pane-scoped CSS and stable block/part data attributes. We clarified the projection stack as `SessionEntry -> TranscriptItem -> ChatBlock`: history/tree remains at pi session-entry granularity; `TranscriptItem` is the live/replay wire projection; chat blocks are the smallest rendered units and may later be one-to-many from either layer.

We deliberately skipped a static renderer registry because without a real registration or override path it adds ceremony rather than extensibility. Instead, the first exact renderer is the real current pain point: canvas tools now render through first-party chat block components that hide anchors from the human view while preserving anchored tool results for the agent. Generic custom-message UI stays boring until there is a real custom-message producer. The font/style decision from the same slice: core exposes CSS tokens and ships a local first-party Iosevka code-font asset as a default pack in waiting, while richer UI kits such as Mantine remain optional extension/app-pane choices.

### 2026-06-07 — durable transcript ids before rich blocks

While reviewing normalized transcript items, we separated row transport identity from durable block identity. For current flat rendering, provisional live ids are enough; for rich blocks they are not. The chosen direction: renderer sees one opaque id and sends display/actions to main; main resolves provisional ids to canonical pi-session-derived ids, persists display/block state server-side, and joins that state back into transcript items. A `WeakMap` keyed by the in-process pi message object can correlate current `message_end` objects with `SessionManager.appendMessage(message)` as a local adapter; a future pi post-persist entry event would replace the adapter. This spawned [durable-transcript-identity](../../plans/durable-transcript-identity.md).

### 2026-06-07 — consumer-side selection + the inbound interaction round-trip

Two additions from the composition walk ([uix-core-composition](./uix-core-composition.md)), extending the render axis with its missing inbound half:

- **Destination-agnostic entries, consumer-side selection.** An entry is typed by _what it is_ (`uix.input_button`), never addressed to a pane. A pane subscribes to the **whole** forwarded feed and renders the entry types it has a renderer for — the render `switch` _is_ the filter; unknown types are skipped. A new entry type forces no pane to change; a pane opts in by adding a renderer (so a new block "modifies, not replaces" the pane). The one plumbing piece: a generic `custom_entry` passthrough lane in the driver / `AgentEvent` union. The current transcript model forwards displayed `custom_message` items, but arbitrary non-message `CustomEntry` state still has no transcript lane by design. Paid once; new block types are then a `case` in a `renderBlock(type, data)` dispatch and nothing else. Collapsing the typed text events _into_ that lane (renderer = pure function over the entry stream) is the deferred cleanup.

- **Durable entries vs ephemeral signals — the interactive block.** An agent-emitted block is a durable session entry; a human _click_ is an ephemeral signal, meaningless until a main-side handler converts it. Round-trip for e.g. a `uix_ask` button: the tool's `execute` `appendEntry`s `uix.input_button` → the block renders → a click dispatches a renderer→main message (`blockAction`) keyed by pi's own `toolCallId` → the handler either **(A)** resolves the pending tool result so the agent continues the _same_ turn (best when the agent asked a question; needs no return-listener, since pi already routes tool results back), or **(B)** `pi.sendUserMessage(...)` to start a _new_ turn (ambient buttons not tied to a pending question). Lead with A. This reconciles with [no-agent-ui-manipulation](../decisions/2026-05-30-no-agent-ui-manipulation.md): the agent emits a typed entry into its own transcript, and the human's interaction returns through a validated channel keyed by `toolCallId` — not a UI handle, not another pane's state. The broader topology (hub via main; tap/message/shared-store) is in [uix-core-composition](./uix-core-composition.md).

### 2026-06-06 — gated behind the persistence foundation

Persistence work landed ahead of this thread in the dev order. Two consequences for the render build, both captured in [persistence-and-session-foundation](../../plans/persistence-and-session-foundation.md) (C0/C1):

- **C0 changed the renderer's input shape.** A file-backed session rehydrates history on startup as _complete_ entries (full messages, tool calls/results). The current pane normalizes both history and live events into one transcript item model; block renderers should build on that normalized shape.
- **C1 puts this work on the final substrate.** Promoting UIX-core bindings to an in-process pi extension hands us `sendMessage` / `registerMessageRenderer` / message-transforms. Host-authored blocks (the pending human-diff strip, lifecycle markers) can then be real `CustomMessageEntry` session entries from day one instead of ephemeral React state we later migrate. The agent-authored tool path (`details` → registered component) is unaffected and still works on either substrate.

Net: **resume this thread after C0 + C1.** The two-registry design and the `rich-diff` proof are unchanged; they just build on a persisted, extension-backed base. See [session-file-as-state-substrate](../decisions/2026-06-06-session-file-as-state-substrate.md).

### 2026-06-05 — thread opened

Research into pi's render/event surface (captured in the synthesis above). Origin: with the bidirectional canvas channel (U2) landed, the conversation pane is the next surface to build out and the first on the React path. The instinct was to add turn types and hand-styled React components; the better move is to treat conversation rendering as registry primitives mirroring pi rather than hardcoding, and to fold the realization that pi already ships this exact two-axis model (tool renderers + custom-message renderers, with a content/display/details split) into the design instead of reinventing it. Decided to keep flat-per-component for the agent tool side (grouping is a later perf question). Next steps: forward the dropped event families in the driver, stand up the tool-renderer + message-renderer registries with built-in renderers registered through them, then prove the primitive end-to-end with one agent-triggered `rich-diff` component.
