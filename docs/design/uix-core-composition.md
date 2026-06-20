---
summary: "Exploring how UIX-core composes its pi contributions and how UIX is structured as composable concepts: the composition root, the facet and override models, the communication topology, and the concept vocabulary."
status: exploring
---

# UIX-core composition onto pi

## Problem

UIX-core contributes tools, hooks, transforms, renderers, panes, and (later) services. pi exposes a rich extension surface — but dispatches every hook by **registration order with no priority field** (verified in `pi-coding-agent` `runner.js`: `for (ext of extensions) for (handler of ext.handlers.get(event))`, and `emitInput` threads each transform's output into the next). So composition order is an emergent property of _where_ `on(...)` / `registerTool` happen to be called. Scatter those calls across modules and "who transforms `input` first," "whose `before_agent_start` system-prompt edit wins," "which `tool_call` mutation runs" all become accidents of import order — and pi gives no priority knob to recover control after the fact.

Separately, UIX is becoming "a collection of concepts the way pi is" — panes, blocks, stores, services. We need to know which are pi ports we **forward**, which are net-new UIX ports we **own**, how they talk, and how a subsection bundles its contributions. What is the structure?

## Current synthesis

### One in-process pi extension, composed at a central root

UIX-core's agent surface is a **single in-process pi `ExtensionFactory`** (`(pi: ExtensionAPI) => void`), loaded with no file discovery and no sandbox via `DefaultResourceLoader({ extensionFactories: [...] })` — substrate-owned code holding the live handle. This is pi's extension system, **not** UIX's frontend extension path (`src/main/extensions/`, `@uix/api`). Its interior is a **composition root**: an ordered list of per-subsection **agent installers**, each `(pi) => void`, run in sequence.

```ts
// each subsection exports an agent installer
export function installCanvasAgent(pi: ExtensionAPI) {
  pi.registerTool({ name: "uix_canvas_write" /* … */ });
  pi.on("input" /* hook */);
}

// the composition root — the one place order is decided
const AGENT_INSTALLERS = [
  installSqliteBusAgent, // ← position = dependency: bus before the tap that publishes to it
  installMessageTapAgent,
  installCanvasAgent,
  installInputButtonAgent,
];

export function buildUixExtension(pi: ExtensionAPI) {
  for (const installer of AGENT_INSTALLERS) installer(pi); // registration order
}
```

`AGENT_INSTALLERS` is the single authority on composition order, and it doubles as the dependency graph (list index = resolution order — a hand-rolled DI container). The conclusion that this ordering must be central is recorded in [uix-core-composition-root](../decisions/2026-06-07-uix-core-composition-root.md). It builds on [session-file-as-state-substrate](../decisions/2026-06-06-session-file-as-state-substrate.md) (which chose the in-process extension) and is the agent-surface companion to the render-axis thread [conversation-render-primitives](./conversation-render-primitives.md).

**Why an installer and not the alternatives.** A purely declarative binding (a bag of `tools` + a `contextForTurn` string, like the pre-C1 `customTools` shape) hits a wall the moment a subsection needs `appendEntry` / `sendMessage` — those are imperative, stateful calls made at a specific boundary, not static data. So a subsection must get the live `pi` handle in hand; the question is only the unit. We keep the **subsection-as-unit, handed `pi`** (the agent installer) over **dropping the unit for free-floating install calls**, because the unit preserves a single inventory of what UIX-core contributes and keeps ordering/dedup logic UIX-owned and pi-free (unit-testable), at the cost of one thin layer of indirection.

### Why central, not scattered — forced by pi, not stylistic

Order is **semantic** for every _mutating_ hook, not cosmetic. `input` transforms chain (each sees the prior's `currentText`); `before_agent_start` system-prompt edits "are chained"; `tool_call` mutations are visible to later handlers; `context` / `tool_result` / `message_end` rewrite in sequence. With no priority field, the registration sequence _is_ the composition semantics. The central array is the only place that sequence is legible and controllable. (Tools and pure observers are order-independent — for those the central list is legibility, not correctness; namespacing carries the rest, see below.)

### Facets, features, and extensions

A UIX **facet** is a substrate slice/contribution axis: state management, state messages, panes, channels, transcript rendering, extension loading. A UIX **feature** is the capability being added: canvas, chat, an interactive button, a viz pane. A UIX **extension package** is the concrete loadable/lifetime unit that installs one or more features.

A feature may contribute to several facets at once:

- an **agent installer** — the `(pi) => void` above: tools, hooks, `appendEntry`. **Forwarded** pi ports.
- a **block renderer** — a React renderer keyed by entry type, in the conversation pane. **Net-new** (pi's renderers return TUI components — see [conversation-render-primitives](./conversation-render-primitives.md)).
- a **pane contribution** — a top-level cockpit surface. **Net-new.**
- a **service** — a long-lived main-side process with teardown on `session_shutdown`. **Net-new.**
- a **main handler/channel contribution** — bridges inbound renderer messages back to main-owned stores or the agent.

The framework does not need a concrete `Feature` abstraction before it earns one. Extension installers can register directly into facet registries. “Feature” remains the friendly conceptual word for the thing a human/agent is building; “extension” is the package/activation boundary.

### State lifecycle is a substrate subdomain

State orchestration is broader than an agent installer. UIX needs a central `src/main/state/` domain that coordinates every contribution participating in app state lifecycle: side-effectful preparation (snapshot a pane document, checkpoint externally hosted state, retrieve/cache context), persisting the stable reference/outcome as a private session entry, rendering any model-visible state message that belongs beside it, submitting the user message, post-agent state capture, and later preview/rollback restore. The linear chat turn is today's optimized lifecycle, not the only future shape; non-chat/fan-out apps and hosted state still need the same central state hooks.

This means `uix.turn-state` `CustomEntry`, hidden `uix.state` `CustomMessageEntry`, and the user message boundary are one substrate-owned transaction, not independent feature calls. Contributions should return slices/intents to the state domain; the state domain owns pi append/send order. A contribution that persists branch state should also provide the restore/preview counterpart for branch navigation. Canvas is the first concrete contributor (snapshot current canvas docs, render `<canvas-diff>`, restore versions later); a JSON application-state pane or externally hosted document should plug into the same lifecycle with different store/channel mechanics.

### Drivers, bags, and reload reconciliation

A **driver** owns a runtime/lifecycle boundary. The agent driver owns the Pi session boundary; the extension driver owns extension activation and per-extension bags. Installers attach behavior. Registries track live contributions. Bags decide when registration disposables run.

Extension reload has two reconciliations:

1. **Disk → UIX memory.** The extension driver discovers packages, clears the old extension bags, activates entries again, and the current extension installers register contributions into facet registries. This is where extension source changes become a new in-memory contribution graph.
2. **UIX memory → Pi runtime.** Pi tools/hooks are snapshot-based: most `ExtensionAPI` registration methods return no per-registration disposable, so removing or changing Pi-installed behavior means reloading Pi with the installer/contribution absent or changed. UIX-owned registration surfaces that compile to Pi install-time behavior should mark the agent install surface dirty on register/unregister. The agent driver reconciles by reloading Pi before the next agent turn starts; it may do so earlier while idle to hide latency.

The dirty marker is not a disk watcher. It is the statement “Pi's installed runtime does not match UIX's current contribution graph.” Facets that are local to UIX do not mark it: bag disposal plus registry notification is enough.

UI reload follows the same source-of-truth line. Main owns extension activation and facet registries. The renderer shell does not discover extension code; it receives registry snapshots/change payloads from main and reconciles React surfaces by unmounting removed contributions, mounting new ones, and updating changed ones. Electron/Vite hot reload remains development tooling for UIX source, not the extension reload mechanism.

### Override model, mirrored from pi

pi has no single extension mechanism; it has **four layered override granularities**, and UIX-core units should ship the same way so userspace can override them (the [pi-self-extension-ethos](../decisions/2026-06-05-pi-self-extension-ethos.md) one layer up):

1. **Replace the whole unit** — register a same-named tool/renderer; pi merges built-ins then `set`s registrations by name (last-write-wins, custom shadows built-in — verified in `agent-session.js`). Built-in tools are ordinary `ToolDefinition`s (`createEditToolDefinition` etc.), not a privileged path.
2. **Inject the unit's operations** — keep the unit, swap its side-effecting mechanism. pi's `EditOperations { readFile, writeFile, access }` exists expressly to "delegate file editing to remote systems." UIX-core units should ship **default-policy + injected operations** so e.g. the canvas store's local→remote redirect is an operations swap, not a fork (consistent with [hosting-compatible-by-default](../decisions/2026-05-31-hosting-compatible-by-default.md)).
3. **Decorate the discovery set** — pi's `ResourceLoader` takes `skillsOverride: (base) => Skill[]` (and prompts/themes): receive the defaults, return a transformed set.
4. **Mutate at the boundary** — the `on(...)` hook layer; observe or rewrite flow without owning any unit.

The principle underneath: **ports at decision boundaries, sealed mechanisms.** pi exposes a seam wherever a _policy_ decision is made (which tool, what context, what prompt, where bytes land, how an entry renders) and seals the _mechanisms_ (the agent loop, the tool scheduler, the session entry format, the wire transport, the TUI reconciler). Zero monkeypatching; ~four typed seam categories and nothing else. UIX adopts the same discipline.

**Two surfaces.** pi has an **SDK surface** (`createAgentSession`, `DefaultResourceLoader`, the exported classes — for building a harness _on_ pi; this is UIX) and an **ExtensionAPI surface** (the curated `pi` handle for extending a _running_ pi). UIX consumes the SDK and **re-exposes its own curated extension surface** to UIX userspace: forward pi's agent-logic ports, **seal/replace** pi's render ports (React, not TUI), and **add** net-new app ports (pane, service). React is the renderer/component ABI for UIX panes and blocks; component libraries such as Mantine are app/extension choices layered inside that boundary, not core substrate dependencies. Namespacing keeps it legible: `uix_` reserved for core tools/entry types; userspace carries its own id.

**Core vs ecosystem.** UIX core is the engine, contracts, and documentation for user/agent-authored functionality — the substrate that lets software self-assemble in place. It ships minimal defaults only to prove the primitives and keep the cockpit usable. Theme galleries, component packs, marketplaces, workflow bundles, and opinionated app personalities are outside the base deliverable; when they exist, they should consume the same local user/project contribution surfaces as any extension rather than gaining special core paths.

**Default packs are first-party extensions in waiting.** Bundled chat renderers, styles, and static assets may live in-tree before the extension substrate is ready, but they should be laid out like a contribution pack: local assets beside the pane/renderer that uses them, styles applied through semantic tokens, and names/ids that a later user or project extension can override. The eventual asset contribution shape is `registerAssets({ id, root })` plus style contributions that reference those assets through extension-scoped URLs; same-id replacement and later style layers override earlier defaults. Until then, vendored assets are hardcoded along that grain, not treated as privileged core resources.

### Communication topology

Established by the current code and kept as discipline: **panes never talk to each other.** Every pane talks only to **main**, over IPC (`Chat` does `sendPrompt` ↑ / `onAgentEvent` ↓; `Canvas` does `writebackCanvas` ↑ / `onCanvasChanged` ↓). Main owns the shared state and broadcasts changes — hub-and-spoke, never peer-to-peer in the renderer. The one sentence: **main owns stores; stores emit feeds; panes tap feeds to read and send messages to write; cross-pane effects happen only because two things share a store.** This is also what survives a hosted/VM move (main → server, IPC → websockets, the pane↔store contract unchanged — [hosting-compatible-by-default](../decisions/2026-05-31-hosting-compatible-by-default.md)).

Three relationships, not three transports:

- **Tap (read/observe)** — subscribe to a change-feed, react read-only. Fan-out; coupling is only the feed schema. (`onAgentEvent`; the history-tree watching `session_tree`; the sqlite message-copy.)
- **Message (write/command)** — an effectful request through a channel, addressed to a _store's owner_, not to a pane. The owner processes it and may emit a tap as a consequence. (`sendPrompt`, `writebackCanvas`, `pi.sendUserMessage`.)
- **Direct integration (shared store)** — two concepts wired to the same main-owned object. The canvas is the live example: agent content tools and the human writeback shim both mutate the _same_ canvas store; neither messages the other. Tightest coupling; lives in main, never in the renderer.

**Durable entries vs ephemeral signals.** Agent-emitted content is a **durable entry** on pi's session stream (persisted, rehydrated, tappable). A human's click is an **ephemeral signal**, meaningless to the agent until a feature's main-side handler **converts** it into a tool result or a user message — at which point it rejoins the entry stream. There is no general renderer-visible "bus"; there is the durable entry stream (outbound) plus a directed renderer→main message channel (inbound) plus the conversion point.

### Destination-agnostic selection

Entries are typed by **what they are** (`uix.input_button`), not addressed to a pane. A pane subscribes to the **whole feed** and renders the entry types it has a renderer for — **consumer-side selection** ("I render the types I have a block for, ignore the rest"; the render `switch` _is_ the filter). A new entry type forces no pane to change; a pane opts in by adding a renderer. The one plumbing piece this still needs: a generic `custom_entry` passthrough lane in the driver / `AgentEvent` union. The current driver normalizes durable transcript messages/tools/displayed custom messages, but arbitrary non-message `CustomEntry` state is intentionally not rendered as chat. Detail and the interactive round-trip live in [conversation-render-primitives](./conversation-render-primitives.md).

### Concept vocabulary (best-effort)

A first pass at UIX's conceptual surface — a _best-effort description of the expected surface area_, to be sharpened, **not committed**:

- **Entry** — typed data on pi's session stream; persisted, rehydrated, tappable. The spine ([session-file-as-state-substrate](../decisions/2026-06-06-session-file-as-state-substrate.md)).
- **Block** — a typed React renderer for an entry, inside a block-stream pane. A pane's render-role for an entry, not the entry itself.
- **Pane** — a top-level cockpit surface = slot + chrome + data-source + render-substrate. Two flavors: **block-stream** (conversation: an open feed of typed entries) and **single-surface** (canvas: one opaque document; file browser: one widget). A pane is a _host_; blocks are _hosted_ — a pane ≠ a block container, and "container of blocks" is one body strategy a block-stream pane adopts.
- **Store** — a main-owned source of truth behind an interface, emitting a change-feed.
- **Feed / Tap** — the read side of a store.
- **Message** — the write side: an addressed, effectful command to a store's owner.
- **Service** — a long-lived main-side process with lifecycle (the sqlite bus, a file watcher).
- **Operations** — the injected mechanism under a store/unit (local vs remote).
- **Feature** — the bundle that contributes some subset of the facets above.

### Hardcode-along-the-grain

The concepts are a thinking tool, not a build order. Today everything is **relatively hardcoded**: panes are literal `<section>`s in `App.tsx`, blocks are a `switch (entry.type)`, the composition root is a literal ordered array of concrete functions, services don't exist. That is correct — pi itself ships concrete built-ins _shaped like_ the port (a `ToolDefinition` in the same registry userspace uses), and extracts nothing speculatively. The discipline is to hardcode **in the shape** so the eventual registry is a refactor, not a rewrite. Four invariants are cheap now and expensive to retrofit:

1. Panes talk only to main, never to each other.
2. A pane's authoritative state lives in a main store, not renderer state.
3. Block rendering dispatches on a type tag.
4. Stateful things sit behind an interface in main.

Everything else, hardcode freely. The deferred extractions are already seeded in the [plans backlog](../plans/AGENTS.md) (pane host + slot registry, agent-tool contribution from extensions, default conversation extension, file-watcher service); each earns its place at the second or third instance, or the first userspace contribution.

## Log

### 2026-06-18 — drivers, extension reload, and Pi reconciliation

We sharpened the vocabulary around extension loading and reload. “Host” and “meta facet” both described part of the shape, but the reusable concept is **driver**: a lifecycle owner that runs installers, owns bags, and controls teardown/reload ordering. The extension driver reconciles disk to UIX memory by clearing per-extension bags and re-running extension installers. Facet registries are responsible for marking the agent install surface dirty when their contributions compile to Pi install-time behavior; the agent driver then reloads Pi before the next agent turn. The renderer shell is likewise registry-driven: main sends registry state/change payloads, React reconciles surfaces. Vite/Electron hot reload is only dev tooling.

### 2026-06-17 — state lifecycle as a substrate domain

Canvas snapshots exposed that the canvas agent installer is the wrong long-term owner for state lifecycle. The current slice can snapshot canvases and append `uix.turn-state`, but the design target is broader: UIX core owns a `src/main/state/` domain where contributions prepare side effects, return stable refs/slices, render model-visible state sections, and define restore hooks. This keeps `CustomEntry`, `CustomMessageEntry`, and the user-message boundary ordered as one transaction, and makes rollback/branch preview the mirror of submit prep. The chat pane remains a pane over the agent session, not the agent session primitive; canvas and future JSON/app-state panes become state contributors plus pane/tool contributions.

### 2026-06-07 — thread opened

Origin: a planning conversation walking C1 forward. C1 ([persistence-and-session-foundation](../plans/persistence-and-session-foundation.md)) **landed narrow** — one factory (`createUixCoreExtension`) wrapping the existing `collectAgentBinding*` helpers. A fresh agent reading only that plan could not reconstruct the intended structure (composition root running ordered per-subsection facets), because the structure was nowhere written: `session-file-as-state-substrate` framed the extension only as "to get write access," `pi-self-extension-ethos` gave philosophy without mechanism, and `conversation-render-primitives` covered only the render axis. This thread captures the broader structure that walk surfaced — composition root + the pi-dispatch ordering rationale, the facet / override / communication models, and a best-effort vocabulary.

The ordering kernel is firm enough to record as a decision ([uix-core-composition-root](../decisions/2026-06-07-uix-core-composition-root.md)) because it is _forced by pi's dispatch semantics_, not chosen. The facet generalization and the vocabulary are **tentative** — captured here as discussion context, explicitly not a commitment to this exact shape. Walk that produced it: pane concept (single-surface vs block-stream; pane ≠ block container), block concept (a registered typed renderer, not "just a component"), the interactive-button round-trip (durable entry + ephemeral signal + conversion), and the five-feature stress test (canvas local→remote redirect, message→sqlite tap, sparkline block, file-browser pane, history-tree pane) which the facet model carried with no special case — three of the five are net-new non-agent facets.
