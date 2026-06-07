---
summary: "How the conversation pane renders typed blocks extensibly by porting pi's render architecture from TUI to React: a forwarded event stream plus two render registries (tool renderers keyed by tool name; message renderers keyed by customType) and pi's content/display/details block split. Read before adding conversation block types, agent-triggerable UI components, or the frontend-extension render API."
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

Both pi render paths return `Component` from `@earendil-works/pi-tui` — terminal cells, useless in Chromium. We keep the architecture and swap `Component` → `ReactNode`, `Theme` → our CSS. We get the _event stream_ for free (the driver today forwards only `message_update` text + `agent_end`, dropping the rest in its default case, `src/main/agent/driver.ts`); we do **not** get rendering for free — the React renderers are net-new.

### UIX design

- **Two registries, mirroring pi:** a **tool-renderer registry** keyed by tool name (renders a tool call/result as a React component — the `<rich-diff>`-as-tool path, "the agent calls a component") and a **message-renderer registry** keyed by `customType` (injected non-tool blocks). Different producers, different semantics; keep them separate as pi did. A registered component is, in pi's terms, `renderResult` for a tool call — we are porting that, not inventing it.
- **Adopt content/display/details** as the injected-block shape.
- **Mirror `ToolRenderContext`** for tool blocks (`toolCallId`, `args`, `isPartial`, `isError`, `expanded`, `state`, `invalidate`) → React props, so a tool component can update as `tool_execution_update.partialResult` streams in. The tool's TypeBox params schema is the single contract: agent tool signature on one side, component props on the other (see [typebox-not-zod](../decisions/2026-05-30-typebox-not-zod.md)).
- **Token shape of an agent-authored block (e.g. `rich-diff`).** The agent passes _references, not payloads_ — a canvas key + anchor range, not raw before/after text it would have to re-emit — and the backend computes the render payload into `details`. The tool result `content` returned to the model is a compact acknowledgment (`"rendered diff: +3/−1"`), **not** the rendered artifact; `details` is render-only and never re-enters context. Nobody emits TSX/HTML — the component is registered code, `details` are its props.
- **Built-ins register through the same API.** The default user / assistant / tool / error renderers are first-party registrations with no privileged path — the bare-bones experience and the extensible path are one path.
- **Reconciles with [no-agent-ui-manipulation](../decisions/2026-05-30-no-agent-ui-manipulation.md):** the agent emits a typed, validated, registered block into _its own transcript_ — not a UI handle, not another pane's state. The line to fold into that decision: the agent may author conversation blocks (presentation of its own turn output); it may not hold UI handles or mutate other panes except through their file/channel contracts.

### Build the contract, not the loader

The full vision — a dropped-in package whose `uix` field contributes a tool (main process) _and_ a renderer (renderer process) — pulls in unbuilt substrate: frontend extension loading, the pane-host slot registry, and the tool-half/renderer-half IPC crossing. Build the **contract, not the delivery**: the registries + the render-from-typed-event primitive, proven with built-in renderers plus one agent-triggered component (`rich-diff`), all in-process and first-party. The loader becomes "discover a package and call the same `register*` API" later — the same sequencing that proved the canvas channel on `customTools` before any lower-level refactor.

### Deferred decisions

- **Flat per component vs grouped tools.** Flat per component for now; models may dislike many always-present tools — revisit grouping (e.g. by pane) once there are enough to feel it. A performance question, not a correctness one.
- **Append-only vs updatable blocks.** Ship append-only; reserve an instance id so the agent can later mutate a block in place (the addressable, app-state-as-config direction — the conversation is the ephemeral testbed for what canvas v2 would persist).
- **Inline-in-prose vs block-level.** Block-level (tool calls interleave with text deltas naturally in the timeline); inline markdown directives are a later refinement.
- **Tool-render vs agent-`sendMessage` for agent artifacts.** Both are possible; lead with tool-render (it carries call/result/streaming/state semantics a flat message render loses). An agent tool may also `sendMessage` a standalone block when it wants one decoupled from the tool row.
- **`@uix/api` shape.** How `register*` is exposed to a (first-party, later third-party) frontend extension is the unresolved context-shape question this forces — see [open-questions](../architecture/open-questions.md).

## Log

### 2026-06-07 — consumer-side selection + the inbound interaction round-trip

Two additions from the composition walk ([uix-core-composition](./uix-core-composition.md)), extending the render axis with its missing inbound half:

- **Destination-agnostic entries, consumer-side selection.** An entry is typed by _what it is_ (`uix.input_button`), never addressed to a pane. A pane subscribes to the **whole** forwarded feed and renders the entry types it has a renderer for — the render `switch` _is_ the filter; unknown types are skipped. A new entry type forces no pane to change; a pane opts in by adding a renderer (so a new block "modifies, not replaces" the pane). The one plumbing piece: a generic `custom_entry` passthrough lane in the driver / `AgentEvent` union — the driver still forwards only the fixed text vocabulary (`message_update` + `agent_end`) and drops the rest, so custom entries have no lane to the renderer today. Paid once; new block types are then a `case` in a `renderBlock(type, data)` dispatch and nothing else. Collapsing the typed text events _into_ that lane (renderer = pure function over the entry stream) is the deferred cleanup.

- **Durable entries vs ephemeral signals — the interactive block.** An agent-emitted block is a durable session entry; a human _click_ is an ephemeral signal, meaningless until a main-side handler converts it. Round-trip for e.g. a `uix_ask` button: the tool's `execute` `appendEntry`s `uix.input_button` → the block renders → a click dispatches a renderer→main message (`blockAction`) keyed by pi's own `toolCallId` → the handler either **(A)** resolves the pending tool result so the agent continues the _same_ turn (best when the agent asked a question; needs no return-listener, since pi already routes tool results back), or **(B)** `pi.sendUserMessage(...)` to start a _new_ turn (ambient buttons not tied to a pending question). Lead with A. This reconciles with [no-agent-ui-manipulation](../decisions/2026-05-30-no-agent-ui-manipulation.md): the agent emits a typed entry into its own transcript, and the human's interaction returns through a validated channel keyed by `toolCallId` — not a UI handle, not another pane's state. The broader topology (hub via main; tap/message/shared-store) is in [uix-core-composition](./uix-core-composition.md).

### 2026-06-06 — gated behind the persistence foundation

Persistence work landed ahead of this thread in the dev order. Two consequences for the render build, both captured in [persistence-and-session-foundation](../plans/persistence-and-session-foundation.md) (C0/C1):

- **C0 changes the renderer's input shape.** A file-backed session rehydrates history on startup as _complete_ entries (full messages, tool calls/results), not just live streaming deltas. The block renderers must consume both shapes — so build them after C0, or retrofit.
- **C1 puts this work on the final substrate.** Promoting UIX-core bindings to an in-process pi extension hands us `sendMessage` / `registerMessageRenderer` / message-transforms. Host-authored blocks (the pending human-diff strip, lifecycle markers) can then be real `CustomMessageEntry` session entries from day one instead of ephemeral React state we later migrate. The agent-authored tool path (`details` → registered component) is unaffected and still works on either substrate.

Net: **resume this thread after C0 + C1.** The two-registry design and the `rich-diff` proof are unchanged; they just build on a persisted, extension-backed base. See [session-file-as-state-substrate](../decisions/2026-06-06-session-file-as-state-substrate.md).

### 2026-06-05 — thread opened

Research into pi's render/event surface (captured in the synthesis above). Origin: with the bidirectional canvas channel (U2) landed, the conversation pane is the next surface to build out and the first on the React path. The instinct was to add turn types and hand-styled React components; the better move is to treat conversation rendering as registry primitives mirroring pi rather than hardcoding, and to fold the realization that pi already ships this exact two-axis model (tool renderers + custom-message renderers, with a content/display/details split) into the design instead of reinventing it. Decided to keep flat-per-component for the agent tool side (grouping is a later perf question). Next steps: forward the dropped event families in the driver, stand up the tool-renderer + message-renderer registries with built-in renderers registered through them, then prove the primitive end-to-end with one agent-triggered `rich-diff` component.
