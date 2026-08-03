---
summary: "Exploring model-visible feature state through hidden agent context, buffered or turn-state-backed materialization, tool output contracts, transcript observers, and future ordering."
kind: explanation
status: exploring
---

# Agent state messages

How feature state reaches the agent without changing the human's stored words, and how structured agent output returns through authoritative feature contracts.

## Current synthesis

UIX calls the model-visible mechanism _agent context_. Features contribute sections through the `agentContext` facet, while the substrate owns namespacing, buffering, assembly, Pi installation, and persistence confirmation.

Pi's `input` hook is not a state channel because transformed text becomes the persisted human message. UIX instead emits one `display: false` `uix.state` custom message from `before_agent_start`.

The message contains a `<uix-state>` envelope and one feature-qualified inner tag per materialized section. Pi removes `customType` from model context, so section identity remains in text. A generated system-prompt vocabulary explains active tags.

Update buffers retain one latest validated value and send only when the materialized body differs from branch history. Append buffers retain ordered pending values and clear a confirmed batch only after persistence appears on the branch.

A contribution without a UIX buffer supplies `materialize()`. This path reads feature-owned state during agent-run preparation. Canvas uses it to derive anchored diffs from current and prior `canvas.documents` turn-state snapshots.

Turn state and agent context remain separate. Turn state persists model-invisible branch state; agent context derives changing model-visible information. Stable prompt sections and Pi skills carry non-changing semantics and task-specific guidance.

The implemented ordering places hidden context after the human message in the session because `before_agent_start` is Pi's supported seam. A future pre-prompt transaction may place state upstream, but that requires an explicit Pi-supported write path and branch semantics.

Agent-to-application structured output remains a tool contract. The tool validates and commits an authoritative artifact; a surface then renders that artifact. This preserves the rule that agents change data rather than live view handles.

### Hard-won boundaries

The branch, not process memory, records what the Agent has already seen. Update buffers therefore compare materialized bodies against branch history. Append buffers drain only after the exact batch appears in persisted history. This distinction prevents reload and branch navigation from silently duplicating or losing context.

Transcript observers and turn state solve opposite problems. An observer can replay facts already authoritative in Pi entries, such as model changes, messages, labels, or feature-owned custom entries. Turn state anchors UIX-side facts that arise on parallel interaction paths and otherwise have no branch identity. Persisting observer output into turn state is a cache optimization, not the default source of truth.

A model-invisible `CustomEntry` can serve as a low-frequency, append-only event log. It is appropriate for submitted actions, not keystrokes, because Pi loads the session file into memory. `appendEntry` also parents to the current leaf, so concurrent branch-targeted appends require explicit leaf discipline or future Pi support.

The conversation surface is one view of the substrate-owned Agent session, not the session itself. A non-chat application may assemble prompts from forms or controls while using the same context mechanism. A development inspector can reveal hidden messages without changing their persisted display policy.

### Future invocation modes retained

A non-conversational invocation can be modeled as a one-turn fork from a prepared root. The root contains stable prompt, tools, vocabulary, and seeded state; each invocation becomes an inspectable sibling branch. This preserves provider prefix caching and session history. Concurrency, retention, and parent selection remain unresolved before this becomes a supported mode.

## Open questions

- Does a future Pi API permit hidden context before the human entry without bypassing supported session semantics?
- When do enough context types justify generated schema summaries beyond the existing vocabulary bullets?
- How should a rich human-facing Canvas diff render from hidden `details` without exposing the hidden message by default?
- What parent-selection mechanism is required before concurrent custom-entry appends can target different branches safely?
- Which feature-facing transcript observers are needed for facts already authoritative in Pi session entries?

## Log

### 2026-07-18 — remove ambient canvas visibility context

Removed the Canvas `pane-visibility` update contribution and its hardcoded open-key state. A single ambient list cannot represent multiple instances of one surface and duplicates information already carried by document-keyed updates. Future interactions that need presentation provenance should carry the originating surface-instance id; the agent-visible Canvas context remains the durable `canvas-diff` derived from document-keyed turn state.

### 2026-07-03 — transcript observers vs turn-state

Clarified the state boundary while discussing model/thinking status and richer transcript reactions. Transcript observers are handlers over session entries whose base facts are already in the pi branch; they reprocess the current branch on startup/restore and then handle live entries through the same path, publishing snapshots/deltas over channels. Turn state is for state not already represented in the transcript — parallel UIX interactions that need branch identity. This keeps model/thinking derived from pi's native `model_change` / `thinking_level_change` entries, leaves markdown/code rendering as frontend-only render transforms over raw message text, and avoids duplicating transcript-native truth into `uix.turn-state` except as a future committed cache for expensive projections.

### 2026-06-30 — canvas diffs derive from turn-state snapshot refs

The canvas diff path no longer consumes a pending-change buffer. Turn-state prep snapshots the current canvas documents and persists only stable refs under the canvas feature key in `uix.turn-state`; agent-context materialization then runs after that append, reads the current and prior feature-bound turn-state entries, and derives `<canvas.canvas-diff>` by diffing the corresponding anchored snapshot metadata. This keeps session state thin, makes the diff reproducible from branch history, and leaves the canvas buffer as a feature-owned working copy over the document store rather than a delivery queue.

### 2026-06-17 — fold state messages into central state lifecycle

Canvas snapshot review clarified that `uix.turn-state`, `uix.state`, and the user message must be coordinated by one state substrate, not by independent feature hooks. A state-message contribution is still the right vocabulary for a model-visible section, but delivery is one phase of a larger state contribution lifecycle: prepare side effects and contribution state, persist private state, materialize message sections from that state, submit the human message, then route that same state back to contribution-owned preview/restore callbacks during navigation. This preserves the branch-navigation invariant and keeps future hosted/document/app-state contributors on the same hooks as canvas.

### 2026-06-13 — pre-user submit ordering and canvas snapshot pairing

Refined the state-message delivery target after revisiting canvas snapshots and branch navigation. `before_agent_start` was the right emergency landing spot because it creates a hidden model-visible custom message without rewriting the human prompt, but Pi orders its returned messages after the user message. For UIX's tree-navigation model, hidden state for a user turn must be upstream of that user entry: when the UI previews the gap before a user message, the snapshot pointer and model-visible context that explain that turn must already be on the branch.

Target shape: UIX driver submit-prep runs before `session.prompt(text)`, may inspect the raw user text, and writes in order: UIX-private `CustomEntry` state (`uix.turn-state`, cwd, snapshot ids), hidden `uix.state` `CustomMessageEntry` (canvas diff, pane visibility, reminders/context), then the user message. The state-message contribution API stays the same; only the assembler's Pi seam moves from `before_agent_start` to this pre-user submit phase. Canvas diffs pair with `uix.turn-state`: the custom entry points at the newly created anchored snapshot, and the custom message carries the anchored diff from the nearest upstream snapshot to that one.

### 2026-06-13 — contribution vocabulary: update/append buffers and materialize

Refined the registration shape after reviewing the branch for vocabulary and isolation. The registered object is the **state-message contribution**; `messageType` names the inner `<uix-state>` section, while Pi's persisted custom message type remains `uix.state`. `customType` is therefore reserved for Pi/session entries, not the section registration. The assembler is no longer on the registrant-facing object; the driver owns installing it into Pi.

Three source shapes are now explicit. `buffer: { kind: "update" }` returns an updater handle; `update(payload)` retains current truth, default-materializes via JSON, compares post-materialization against the nearest persisted section on the branch, and never drains. `buffer: { kind: "append" }` returns an appender handle; `append(payload)` adds to a pending ordered event list, default-materializes that list via JSON, and clears the confirmed batch only after a later branch walk proves that exact body persisted. No `buffer` means `materialize()` is required and runs while UIX prepares an agent run; the contribution owns any external store reads/consumption (canvas diff today). This leaves richer append retention policies (full log vs pending slice, timestamps/sequence defaults) for a later concrete consumer.

### 2026-06-12 — substrate refactor design: handle-based registration, driver-owned install, bag lifetimes

Designed (not yet built) the next shape of `createStateMessages`, fixing the anti-pattern that the landed version mixes two audiences in one type and that its lifetimes don't line up with the bag model. **This entry records the converged design; the synthesis and "Landed 2026-06-11" note above describe the _old_ shape and are stale pending this build** (they still say `register`/`emit` + an assembler `binding` ordered last + composition-time-only registration; the build replaces all three and resolves the "late registration" open question).

**The anti-pattern.** `StateMessages` serves two audiences in one object: `register`/`emit` are registrant-facing (and head for `@uix/api`), while `binding` is composition-root wiring an extension must never touch — nothing stops a registrant calling `stateMessages.binding(pi)` and double-installing. The deeper smell is _lifetime_: the store (registrations) is app-scoped, but the installed `before_agent_start` handler + its vocabulary string are session-scoped, and they're collapsed into one app-lifetime closure — which is _why_ `register` has to throw forever and reload can't change the registration set.

**`register` returns a handle; `emit` lives on it.** `register(config)` returns a Disposable **handle**. The capability is the object: only the owner can emit its own type (no stringly `emit("uix.pane-visibility", …)` on a shared store), the schema types the emit payload, and disposing the handle removes the registration _and_ its latch. The handle is dropped in the **registrant's own bag** — the per-extension `DisposableBag` the loader already builds (`extensions/loader.ts`), or the driver-scope bag for the core canvas facet. This is the lifetime-bags substrate primitive doing its job; extension reload disposes the bag → registrations vanish.

**One delivery mechanism, push XOR pull.** `emit` and the old `atTurnBoundary` collapse: a registration either **receives** a function (`emit`, push — substrate latches latest-per-type, semantics are _replace_, only safe for state) or **provides** one (`read`, pull — substrate calls it at the boundary, the return enters the same pipeline, the only home for consuming/event-shaped reads like the canvas diff). The latch is just the degenerate read ("return what was last pushed"); internally `value = reg.read ? await reg.read() : latch`. **`policy` simplifies to pure suppression**: `change-only` vs `every-turn`, with **safe defaults** — push (latch) defaults `change-only`, a `read` callback defaults `every-turn`, so a consuming read is never suppressed unless its owner explicitly opts in (the event-loss regression the landed code guards with `!reg.atTurnBoundary` becomes declarative). Trigger-ownership and state-vs-event turn out to be the same axis: push⇒replace⇒state, pull⇒consume⇒events.

**The driver owns the install seam; no assembler on the public type.** Registrants never need the Pi-facing installer — it existed only because the agent-facet list was the _only_ pipe to the live pi handle, an artifact of plumbing. Resolution: `createAgentDriver({ …, stateMessages })` installs the flush handler itself when it builds the pi session. `index.ts` shrinks to `const stateMessages = createStateMessages()` passed both to the canvas facet (narrow `register` face) and to the driver (install seam); the "assembler ordered last" comment and its test both die, because registration is decoupled from install. **Install snapshots** the current registrations and computes the vocabulary string **once** (byte-stable per session; `cache_control` rides the last user message, so this is structural cache-safety, not incidental). Late registration becomes legal — it just takes effect at the next install — so **hot-reload falls out for free**: extension bag disposes → re-activation re-registers → `driver.reloadPiResources()` reinstalls → new snapshot at a user-caused boundary. (Verify when building: that pi's `session.reload()` actually re-runs the extension factory / re-fires the install; if not, the re-snapshot needs a different hook.)

**Shared early-stopping branch walk.** Today `lastPersistedBody` walks leaf→root once _per_ change-only registrant. The refactor does **one** walk that collects the nearest persisted body for every change-only registrant and stops as soon as all are resolved (or hits root) — only possible because diffing is substrate-owned.

**Where extensions get pi (the principle behind all of this).** Raw pi reaches extensions in **exactly one place**, never sprinkled across wrapped concepts: an extension wanting raw agent capability declares a `pi` field and **pi loads it natively** (the driver's resource loader already discovers user pi resources alongside the core extension). `@uix/api` carries only **cockpit-mediated** concepts — things whose value is in the cockpit's assembly, like state messages (`register`/`emit`), later block actions. The `agentFacets` list stays **cockpit-core-only** ("how the cockpit talks to the agent at all", AGENTS.md), never an extension point.

**Cross-thread build order** (so it survives the session): **#1 this refactor** (ready, no new pi deps) → **#2 docs** (this entry + the delivery-mechanics entry below) → **#3 canvas `base` frontier + conflict guard + read-advances-frontier + anchor-range reads** ([canvas-data-channel](./canvas-data-channel.md) 2026-06-12; gated only on introducing `base` as tracked state) → **#4 steer tier** (peek/commit-on-persist; needs #1 + #3 + the identity persistence callback, which exists) → **#5 substrate followUp / app-continuation queue** (needs #1 + `agent_end` handling). Independent track, not displaced: durable-transcript-identity **D2/D3**, the **pane host** (gates canvas-as-extension), and the **`@uix/api` extraction** (gated on the pane host — _not_ imminent).

### 2026-06-12 — verified pi delivery mechanics, and the delivery doctrine they justify

Designing immediate (mid-run) state delivery forced reading pi's actual loop from dist (`@earendil-works/pi-agent-core/dist/agent-loop.js`, `pi-coding-agent/dist/core/agent-session.js`, `pi-ai/dist/providers/anthropic.js`). Recording the mechanics because they were expensive to derive, non-obvious, and load-bearing for every delivery unit ahead.

**Verified pi facts:**

- **The LLM is stateless; the runtime owns the message array.** Each call sends the whole array and returns one assistant message. A tool call is the assistant message _ending_ with `tool_use` blocks — generation stops, the runtime executes the tools, appends results, and makes a fresh call. "Continuing after a tool" is conditioning on the longer array, not a resumed stream; the prior assistant message is immutable history and is never reopened.
- **Tool results are user-role messages, and so is everything the runtime injects.** The Anthropic serializer renders `toolResult` as a user message of `tool_result` blocks (correlated by `tool_use_id`, not position); consecutive tool results coalesce into one user message, and an injected/steered message is a _separate_ user message after them (the API allows consecutive user messages). "User role" means "not the model's output," not "the human typed it" — the identical channel our `uix.state` envelope rides via `convertToLlm`, which is exactly _why_ the kind must live in the content text (the XML tag), since the role can't carry it.
- **Run vs turn.** A **turn** = one LLM call + executing its tools; a **run** = the loop until the assistant produces no tool calls and no queued messages remain (`agent_start`→`agent_end`). The model only ever experiences turns; the run exists only in the runtime's while-loop.
- **Four delivery seams, and what each does to state.** `before_agent_start` fires **once per run** inside `prompt()`, beside the user message — our flush rides it. **steer** (`sendCustomMessage`/`prompt` with `deliverAs: "steer"`) drains at the top of the next inner-loop iteration — _between_ turns, after the current tool batch, before the next LLM call — and **bypasses `before_agent_start`**. **followUp** drains only when the run would otherwise stop, _extends the run_ with more turns, and also **bypasses `before_agent_start`**. **nextTurn** parks in `_pendingNextTurnMessages` and is injected beside the _next_ `prompt()`'s user message (next run). Consequence: only a run-boundary flush — or a steer we pair by hand — carries _fresh_ state; followUp and nextTurn structurally cannot attach a contemporaneous flush.
- **`cache_control` sits on the last user message.** The conversation prefix is cached, so byte-stable prefixes matter — the concrete reason to snapshot the system-prompt vocabulary **once at install** rather than recompute it per turn (recompute is byte-stable only incidentally; snapshot makes it structural).

**The delivery doctrine these justify** (decision, for when the delivery units build):

- **steer** — pi's queue, but always shipped as a _pair_: the state flush (`deliverAs: "steer"`) immediately followed by the human message, never the message alone. This is the only way mid-run human input arrives with the canvas state it refers to.
- **followUp** — a **substrate-owned** queue, delivered via a fresh `prompt()` at `agent_end`, so it gets the full run-boundary treatment (fresh diff, change-only, vocabulary). Pi's native followUp goes **unused by UIX**: it bypasses `before_agent_start`, so a queued human message would reach the model against stale state — disconnected from the canvas edits made beside it.
- **nextTurn** — **never**; strictly dominated by computing the flush at `before_agent_start` (same reading position, but fresh and change-only checked instead of parked-and-possibly-stale).
- **app continuation** — the same substrate-owned queue as followUp; "run finished → substrate decides the next invocation" is a cockpit (pilot) decision and composes with the fan-out direction, where a pi-side queue wouldn't.
- **The invariant underneath all of it:** _a human message never reaches the model without contemporaneous cockpit state._ Every moment a human utterance enters the model's reading order, the current canvas truth must enter beside it — which is what disqualifies both pi-native followUp and nextTurn for UIX.

The steer tier's peek/commit-on-persist protocol and the `base`-as-observation-frontier primitive it relies on are specified on the channel side ([canvas-data-channel](./canvas-data-channel.md), 2026-06-12).

### 2026-06-11 — framing, from the `<canvases-open>`-in-chat defect

Thread opened after tracing why cockpit context showed inside the user's chat message: pi's `input` transform rewrites the persisted user entry (dist source: `prompt()` builds the user message from the transformed text), falsifying C1's verbatim claim. Settled in discussion: `display: false` custom messages at `before_agent_start` as the channel, with a debug toggle (not default display) for inspection; system-prompt vocabulary so payloads stay compact — required, since `convertToLlm` strips `customType`; change-only computed against the branch (the branch is the latch); push `emitState` fire-and-latch as the default mechanism with a boundary-callback option for consuming reads (the canvas diff); agent→app structured output as tools-as-contracts with store-commit hydration, explicitly rejecting a third "schema-validated custom message reply" mechanism; canvas and chat as comes-with extensions over a `registerStateMessage` substrate primitive, customTypes namespaced by the API handle; CustomEntry streams as model-invisible event logs; fan-out prepared-root mode as the eventual non-chat shape. First slice considered hand-assembling in the canvas facet and extracting the primitive at the second consumer, but the primitive's plumbing (vocabulary assembly, branch comparison, display gating) is registrant-agnostic from day one, so `createStateMessages` landed immediately with the canvas's `uix.pane-visibility` (change-only, via `emit`) and `uix.canvas-diff` (consuming read, via `atTurnBoundary`) as first consumers. The vocabulary section is emitted only when at least one registration exists.
