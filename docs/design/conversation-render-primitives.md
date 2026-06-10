---
summary: "Exploring extensible rendering of typed conversation blocks by porting pi's render architecture from TUI to React: a forwarded event stream plus two registries (tool renderers by tool name, message renderers by customType) and pi's content/display/details split."
status: exploring
---

# Conversation render primitives

## Problem

The conversation pane is UIX's first React-path surface. The bare-bones move is to hardcode turn types and style a React component for each. But UIX's ethos ([pi-self-extension-ethos](../decisions/2026-06-05-pi-self-extension-ethos.md)) says ship primitives, not fixed features: a user should be able to decide "I want to render this conversational element a new way" — or let the agent _emit_ a rich element (e.g. a `<rich-diff>`) that renders as a registered React component — without forking the pane. What are the primitives, and how do we avoid inventing them when pi already solved the same problem for its TUI?

## Current synthesis

**Port pi's render architecture from TUI to React.** Pi already has a two-axis registry for custom conversation rendering; we copy the _shape_ and swap the render target. We are not running pi's TUI renderers — we forward pi's event stream and render it ourselves in React.

### What pi gives us (researched 2026-06-05, `pi-coding-agent` dist types)

- **A typed event stream** (`session.subscribe`), ~6 families: agent/turn lifecycle (`agent_start/end`, `turn_start/end`), message streaming (`message_start` / `message_update` token deltas / `message_end`), tool _model view_ (`tool_call` / `tool_result`, both mutable hook points), tool _execution view_ (`tool_execution_start/update/end`, where `_update` carries streaming `partialResult`), interaction (`input`, `user_bash`, `model_select`), and session/context. A single tool invocation surfaces as three events: decided (`tool_call`) → running/streaming (`tool_execution_*`) → final (`tool_result`). Built-in tools get typed event variants; custom tools collapse to `CustomTool{Call,Result}Event` with `toolName: string`.
- **Two custom-render mechanisms, deliberately separate:**
  1. **Tool renderers** on the `ToolDefinition` — `renderCall` / `renderResult` returning a `Component`, with `renderShell: "default" | "self"` and a rich `ToolRenderContext` (stable `toolCallId`, `invalidate()`, `lastComponent`, persistent per-row `state`, plus `isPartial` / `isError` / `expanded`). Streaming-aware, stateful, expandable. This is the agent-authored-artifact path.
  2. **Custom messages + message renderers** — `registerMessageRenderer(customType, renderer)` + `sendMessage({ customType, content, display, details }, { triggerTurn, deliverAs })`, plus `appendEntry(customType, data)` for not-sent-to-LLM state. The not-a-tool-call path: injected notices, lifecycle markers, app/extension surfaced state.
- **The content/display/details split** (`CustomMessage`): `content` = what the LLM sees, `display` = whether it renders in the transcript, `details<T>` = the typed payload the renderer draws from. This is precisely "agent emits validated props → renderer draws" — pi already designed the data shape, and it cleanly separates what the model reads from what the human sees from the structured data behind the render.

### The one divergence

Both pi render paths return `Component` from `@earendil-works/pi-tui` — terminal cells, useless in Chromium. We keep the architecture and swap `Component` → `ReactNode`, `Theme` → our CSS. We get the _event stream_ for free; the driver now normalizes pi live events and persisted session entries into UIX transcript items, but React renderers are still net-new.

### UIX design

- **Two registries, mirroring pi:** a **tool-renderer registry** keyed by tool name (renders a tool call/result as a React component — the `<rich-diff>`-as-tool path, "the agent calls a component") and a **message-renderer registry** keyed by `customType` (injected non-tool blocks). Different producers, different semantics; keep them separate as pi did. A registered component is, in pi's terms, `renderResult` for a tool call — we are porting that, not inventing it.
- **Adopt content/display/details** as the injected-block shape.
- **Mirror `ToolRenderContext`** for tool blocks (`toolCallId`, `args`, `isPartial`, `isError`, `expanded`, `state`, `invalidate`) → React props, so a tool component can update as `tool_execution_update.partialResult` streams in. The tool's TypeBox params schema is the single contract: agent tool signature on one side, component props on the other (see [typebox-not-zod](../decisions/2026-05-30-typebox-not-zod.md)).
- **Token shape of an agent-authored block (e.g. `rich-diff`).** The agent passes _references, not payloads_ — a canvas key + anchor range, not raw before/after text it would have to re-emit — and the backend computes the render payload into `details`. The tool result `content` returned to the model is a compact acknowledgment (`"rendered diff: +3/−1"`), **not** the rendered artifact; `details` is render-only and never re-enters context. Nobody emits TSX/HTML — the component is registered code, `details` are its props.
- **Built-ins register through the same API.** The default user / assistant / tool / error renderers are first-party registrations with no privileged path — the bare-bones experience and the extensible path are one path.
- **Base style only, not a theme ecosystem.** UIX ships one minimal, sane default stylesheet for the essential blocks. It should expose semantic tokens and stable block parts so user/project styles can start from scratch without forking renderer behavior, but UIX does **not** bundle theme discovery, a theme gallery, or alternate aesthetics as part of the base application deliverable. Treat CSS/style contributions like any other extension surface later: registered by stable id/scope/layer, replace-on-same-id for hot reload; path is provenance, not identity.
- **React is the render ABI, not a UI-kit commitment.** Core UIX uses React because it gives panes and blocks a common component boundary. Mantine, Radix, or any other component system belongs inside optional app panes or renderer packs, not in the core API surface.
- **Current hardcoded slice.** The renderer implementation is named `chat` for brevity (`src/renderer/chat/`). It renders `TranscriptItem`s as chat blocks with scoped CSS hooks (`data-uix-pane="chat"`, `data-uix-chat-block`, `data-uix-part`). There is no static registry ceremony yet because a map with no real registration/override path is just a disguised switch; the first useful exact renderer is hardcoded along the grain for `uix_canvas_read` / `write` / `edit`. Those canvas tool blocks extract text content, strip anchor gutters from the human display, show five lines, and expand the rest inline while preserving the anchored agent-facing payload.
- **Reconciles with [no-agent-ui-manipulation](../decisions/2026-05-30-no-agent-ui-manipulation.md):** the agent emits a typed, validated, registered block into _its own transcript_ — not a UI handle, not another pane's state. The line to fold into that decision: the agent may author conversation blocks (presentation of its own turn output); it may not hold UI handles or mutate other panes except through their file/channel contracts.

### Build the contract, not the loader

The full vision — a dropped-in package whose `uix` field contributes a tool (main process) _and_ a renderer (renderer process) — pulls in unbuilt substrate: frontend extension loading, the pane-host slot registry, and the tool-half/renderer-half IPC crossing. Build the **contract, not the delivery**: the registries + the render-from-typed-event primitive, proven with built-in renderers plus one agent-triggered component (`rich-diff`), all in-process and first-party. The loader becomes "discover a package and call the same `register*` API" later — the same sequencing that proved the canvas channel on `customTools` before any lower-level refactor.

### User-space interactive custom-message shape

The target user-space proof is an extension-owned interactive prompt with no core-special path:

```text
UIX extension registers a pi tool + chat renderer
  -> agent calls the tool
  -> tool emits a displayed CustomMessage via pi.sendMessage({ customType, content, display, details })
  -> chat pane renders details with the registered customType renderer
  -> human clicks/submits inside that chat block
  -> renderer sends a typed block action to main, keyed by the opaque block/item id
  -> main validates and converts the action into pi.sendUserMessage(...)
     or another explicit pi-side continuation
  -> the agent may get a new turn even if the normal chat input is empty/unchanged
```

The custom message's `content` is what the model sees; `details` are typed props for the React renderer; the submitted human choice is an ephemeral renderer action until main converts it into a user message, tool result, or custom entry. The renderer never talks directly to the agent and never mutates session state. This is the concrete shape we want before treating custom-message fallback UI as a first-class product surface.

### Durable identity before interactive blocks

Durable transcript identity is a gate for **interactive or stateful** blocks, not for every richer rendering. A static rich block can be a React component today if it renders only from the current `TranscriptItem` payload (`toolName`/`args`/`result`/`partialResult`, or `customType`/`content`/`details`) and treats `item.id` as an opaque React key — a stateless view has nothing durable to migrate.

The identity model is [transcript-keyed-on-persist](../decisions/2026-06-09-transcript-keyed-on-persist.md): items are **pre-key** (transport handle, no durable interactions) until pi persists them, then keyed with the canonical session id via one in-place rekey; tool rows are born keyed. Ephemeral interactions (scroll, highlight, open) fire pre-key off the handle; durable effects (state writes, persisted references, tool-result conversion) gate on the key and queue in main across the gap. Durable block state is main-owned as `uix.*` custom entries per [one-owner-per-state](../decisions/2026-06-09-one-owner-per-state.md); renderer state — including tool-row expansion — is a cache. The concrete build is [durable-transcript-identity](../plans/durable-transcript-identity.md); land it before the choice/input-block proof, not before static component renderers.

### Deferred decisions

- **Flat per component vs grouped tools.** Flat per component for now; models may dislike many always-present tools — revisit grouping (e.g. by pane) once there are enough to feel it. A performance question, not a correctness one.
- **Append-only vs updatable blocks.** Ship append-only; reserve an instance id so the agent can later mutate a block in place (the addressable, app-state-as-config direction — the conversation is the ephemeral testbed for what canvas v2 would persist).
- **Inline-in-prose vs block-level.** Block-level (tool calls interleave with text deltas naturally in the timeline); inline markdown directives are a later refinement.
- **Tool-render vs agent-`sendMessage` for agent artifacts.** Both are possible; lead with tool-render (it carries call/result/streaming/state semantics a flat message render loses). An agent tool may also `sendMessage` a standalone block when it wants one decoupled from the tool row.
- **`@uix/api` shape.** How `register*` is exposed to a (first-party, later third-party) frontend extension is the unresolved context-shape question this forces — see [open-questions](../architecture/open-questions.md).

## Log

### 2026-06-09 — keyed-on-persist replaces the alias map; state gets one owner per value

Walked the identity design against pi's dist source and reversed D1's mechanism. Two verified facts did the work: pi emits `message_end` to listeners _before_ `appendMessage(event.message)` with the same object (so the append — where the durable id is minted — is observable in the same tick), and the assistant message containing toolCall blocks persists _before_ `tool_execution_start` (so tool rows can be **born keyed** with the replay derivation `<entryId>:tool:<toolCallId>` — no provisional id at all).

Three models were weighed. **Hold-until-durable** (emit each row once, already keyed) dies on streaming (the assistant row exists so deltas have somewhere to land) and on the instant user echo (persistence waits on the lazy session open at first prompt) — but the objection only holds for those two row kinds, which sharpened the question. **Session-long alias map** (renderer keeps provisional ids forever, main translates) keeps renderer ids stable but makes the map a permanent ledger every durable write path must consult; a forgotten resolve writes a provisional id into the session file — fails dirty into the durable record. Also: it doesn't actually avoid waiting — nobody can durably reference an id that doesn't exist yet, so the map's resolve degenerates to the same await in exactly the tight cases. **Keyed-on-persist** won: pre-key items carry a transport-only handle (a delivery nonce, not identity), rekey once in place when the append is observed, and interactivity gates on the key — which arrives with `complete`, so the gate is the semantics a half-streamed block wants anyway. The refinements that make it lossless: ephemeral interactions (nothing durable refers to the item) fire pre-key off the handle, and durable effects initiated pre-key **queue in main** until the key lands. Decision: [transcript-keyed-on-persist](../decisions/2026-06-09-transcript-keyed-on-persist.md); plan rewritten.

Downstream of identity, three more things settled. **Block state homes in pi `CustomEntry` records** (hidden from model and human, branch-aware, `LabelEntry` is the precedent shape `{targetId, …}`), superseding the D2 sidecar; append-only last-wins chains make low-frequency meaningful state (a choice block's submitted answer) the fit and high-frequency UI state (tool expansion) explicitly renderer-local. **State ownership got its invariant** — one owner per value, no durable-but-locally-overridable hybrids; renderer-managed presentation (localStorage fine, cache semantics), main-durable (session entries + content store), main app-local (window bounds), main RAM never an owner — [one-owner-per-state](../decisions/2026-06-09-one-owner-per-state.md). And **rehydration unified**: one branch walk with reducers registered per `customType` beside the binding that writes each key; `toTranscriptItems` is that walk hardcoded, so the transcript becomes the first reducer and the canvas consumers (turn-state, visibility latch, block state) plug into the same pass. The human canvas diff and pane visibility also became durable agent-visible custom messages at the submit boundary — specified in [persistence-and-session-foundation](../plans/persistence-and-session-foundation.md) C3.

### 2026-06-08 — chat blocks, scoped styles, and first exact tool renderer

Landed the first hardcoded-along-the-grain renderer slice: `Conversation` became the shorter `chat` implementation under `src/renderer/chat/`, with pane-scoped CSS and stable block/part data attributes. We clarified the projection stack as `SessionEntry -> TranscriptItem -> ChatBlock`: history/tree remains at pi session-entry granularity; `TranscriptItem` is the live/replay wire projection; chat blocks are the smallest rendered units and may later be one-to-many from either layer.

We deliberately skipped a static renderer registry because without a real registration or override path it adds ceremony rather than extensibility. Instead, the first exact renderer is the real current pain point: canvas tools now render through first-party chat block components that hide anchors from the human view while preserving anchored tool results for the agent. Generic custom-message UI stays boring until there is a real custom-message producer. The font/style decision from the same slice: core exposes CSS tokens and ships a local first-party Iosevka code-font asset as a default pack in waiting, while richer UI kits such as Mantine remain optional extension/app-pane choices.

### 2026-06-07 — durable transcript ids before rich blocks

While reviewing normalized transcript items, we separated row transport identity from durable block identity. For current flat rendering, provisional live ids are enough; for rich blocks they are not. The chosen direction: renderer sees one opaque id and sends display/actions to main; main resolves provisional ids to canonical pi-session-derived ids, persists display/block state server-side, and joins that state back into transcript items. A `WeakMap` keyed by the in-process pi message object can correlate current `message_end` objects with `SessionManager.appendMessage(message)` as a local adapter; a future pi post-persist entry event would replace the adapter. This spawned [durable-transcript-identity](../plans/durable-transcript-identity.md).

### 2026-06-07 — consumer-side selection + the inbound interaction round-trip

Two additions from the composition walk ([uix-core-composition](./uix-core-composition.md)), extending the render axis with its missing inbound half:

- **Destination-agnostic entries, consumer-side selection.** An entry is typed by _what it is_ (`uix.input_button`), never addressed to a pane. A pane subscribes to the **whole** forwarded feed and renders the entry types it has a renderer for — the render `switch` _is_ the filter; unknown types are skipped. A new entry type forces no pane to change; a pane opts in by adding a renderer (so a new block "modifies, not replaces" the pane). The one plumbing piece: a generic `custom_entry` passthrough lane in the driver / `AgentEvent` union. The current transcript model forwards displayed `custom_message` items, but arbitrary non-message `CustomEntry` state still has no transcript lane by design. Paid once; new block types are then a `case` in a `renderBlock(type, data)` dispatch and nothing else. Collapsing the typed text events _into_ that lane (renderer = pure function over the entry stream) is the deferred cleanup.

- **Durable entries vs ephemeral signals — the interactive block.** An agent-emitted block is a durable session entry; a human _click_ is an ephemeral signal, meaningless until a main-side handler converts it. Round-trip for e.g. a `uix_ask` button: the tool's `execute` `appendEntry`s `uix.input_button` → the block renders → a click dispatches a renderer→main message (`blockAction`) keyed by pi's own `toolCallId` → the handler either **(A)** resolves the pending tool result so the agent continues the _same_ turn (best when the agent asked a question; needs no return-listener, since pi already routes tool results back), or **(B)** `pi.sendUserMessage(...)` to start a _new_ turn (ambient buttons not tied to a pending question). Lead with A. This reconciles with [no-agent-ui-manipulation](../decisions/2026-05-30-no-agent-ui-manipulation.md): the agent emits a typed entry into its own transcript, and the human's interaction returns through a validated channel keyed by `toolCallId` — not a UI handle, not another pane's state. The broader topology (hub via main; tap/message/shared-store) is in [uix-core-composition](./uix-core-composition.md).

### 2026-06-06 — gated behind the persistence foundation

Persistence work landed ahead of this thread in the dev order. Two consequences for the render build, both captured in [persistence-and-session-foundation](../plans/persistence-and-session-foundation.md) (C0/C1):

- **C0 changed the renderer's input shape.** A file-backed session rehydrates history on startup as _complete_ entries (full messages, tool calls/results). The current pane normalizes both history and live events into one transcript item model; block renderers should build on that normalized shape.
- **C1 puts this work on the final substrate.** Promoting UIX-core bindings to an in-process pi extension hands us `sendMessage` / `registerMessageRenderer` / message-transforms. Host-authored blocks (the pending human-diff strip, lifecycle markers) can then be real `CustomMessageEntry` session entries from day one instead of ephemeral React state we later migrate. The agent-authored tool path (`details` → registered component) is unaffected and still works on either substrate.

Net: **resume this thread after C0 + C1.** The two-registry design and the `rich-diff` proof are unchanged; they just build on a persisted, extension-backed base. See [session-file-as-state-substrate](../decisions/2026-06-06-session-file-as-state-substrate.md).

### 2026-06-05 — thread opened

Research into pi's render/event surface (captured in the synthesis above). Origin: with the bidirectional canvas channel (U2) landed, the conversation pane is the next surface to build out and the first on the React path. The instinct was to add turn types and hand-styled React components; the better move is to treat conversation rendering as registry primitives mirroring pi rather than hardcoding, and to fold the realization that pi already ships this exact two-axis model (tool renderers + custom-message renderers, with a content/display/details split) into the design instead of reinventing it. Decided to keep flat-per-component for the agent tool side (grouping is a later perf question). Next steps: forward the dropped event families in the driver, stand up the tool-renderer + message-renderer registries with built-in renderers registered through them, then prove the primitive end-to-end with one agent-triggered `rich-diff` component.
