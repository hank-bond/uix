---
summary: "How the substrate drives the agent today: it lazily owns a persisted pi AgentSession, forwards a UIX-shaped event stream to the renderer, exposes model list/favorite/status/select channels over pi's model registry, delegates reload, binds the core anchored document read/write/edit tools, and flushes registered agent-context contributions as display-hidden custom entries at agent-run prep."
status: active
---

# Agent integration

UIX owns one pi `AgentSession` for the workspace, created lazily the first time the renderer sends a prompt. The current driver lives in `src/main/agent/driver.ts`.

Current behavior:

- the session is resumed or created under the workspace state root;
- surfaces talk to the driver through the substrate-owned agent channel contract (`@uix/api/agent-channels`, registered under the reserved `agent` id) via the typed channel client — chat is an ordinary feature consuming channels any feature could;
- the `prompt` request invokes the main-process driver; the renderer receives a UIX-shaped event stream on the `event` channel: transcript item appends, compact in-flight partials (`transcript_partial`: streamed assistant text appends, tool progress snapshots overwrite), whole-item replacements at completion, plus basic lifecycle markers; live in-flight tool partials are discarded when the final item arrives;
- the `history` request replays the same durable transcript item shape from pi's persisted session branch;
- reload (typed IPC, not an agent channel) reloads manifest features and workspace settings; it recreates Pi's services tier if model/auth resources were already used before a session, delegates to `session.reload()` once a session exists, and initializes neither solely for reload;
- core substrate tools are registered through internal agent installers (`AgentInstaller`), not through feature contributions.

Electron gives Pi one app-owned profile at `<userData>/pi`, shared by every UIX workspace and isolated from the host Pi CLI profile. Pi stores profile-level credentials, settings, custom models, extensions, skills, prompts, and context there. The workspace `agentCwd` still supplies project-local `.pi` settings and resources, while session history remains under that workspace's `.uix/sessions`. UIX does not copy or fall back to the host profile; process environment variables remain available to Pi.

## Model control

The driver owns one lazy Pi `AgentSessionServices` tier above the session: `AuthStorage`, `ModelRegistry`, settings, and the loaded resource/extension set. Model questions are therefore answerable before the first prompt, including models registered by Pi extensions; session creation reuses the same services rather than loading an overlapping copy. Four requests and one event on the agent contract:

- `list_models` (`void → { models: ModelOption[] }`) — **available (auth-configured) models only**, refreshed from pi's registry on each call and decorated with each model's workspace-local `favorite` status. If nothing is authenticated the list is empty; provider authentication changes emit `model_availability_changed` so consumers can fetch it again.
- `set_model_favorite` (`ModelRef & { favorite: boolean } → { models: ModelOption[] }`) — idempotently adds or removes a model from `agent.favoriteModels`, then returns the refreshed available-model list. Favorite references survive provider disconnection and become visible again after reconnecting.
- `agent_status` (`void → AgentStatus`) — `model` is the live session model (absent until a session exists, and absent even then when pi resolved none); `defaultModel` is the workspace default (absent until first selected). Both absent means "no model chosen": the UI renders that state, UIX invents no fallback.
- `select_model` (`ModelRef → AgentStatus`) — validated against pi's available models (unknown/unauthenticated refs reject), persisted as the workspace default (`agent.defaultModel`, see [`settings.md`](./settings.md)), and — when a live session exists — switched via `session.setModel`, producing a native pi `model_change` entry.
- `status_changed` (event, `AgentStatus`) — fired on selection, when a session opens and its model becomes known, and on any live pi model change (setModel, cycle commands, restore), mirrored through pi's `model_select` extension event.

Two distinct pieces of state, deliberately: the **current model** is pi-owned, branch-aware session state (`model_change` entries; branch replay restores it), while the **workspace default** is a UIX workspace setting applied at session open only when the branch carries no `model_change` of its own. With neither, session creation defers entirely to pi's resolution. Surfaces never mutate `agent.defaultModel` directly — selection goes through `select_model`.

The chat status bar's model pill (`src/features/chat/workspace/ModelPill.tsx`) is the first consumer: it seeds from `agent_status`, subscribes to `status_changed`, labels by live model → workspace default → explicit "select model" empty state, and opens a searchable picker over `list_models`.

## Provider authentication

The same agent contract exposes one provider-auth catalog, credential saving, and one driver-owned OAuth flow. `list_auth_providers` merges Pi's model and registered OAuth providers, returning layperson-facing names derived from Pi plus setup-recipe overrides, non-secret connection status (including an active environment-variable name, command-backed source/location classification without command text, and an optional last-four hint for an environment-backed or stored literal API key), and generic OAuth/API-key method descriptors; setup recipes can replace the default API method for exceptional providers, while extension-provided model and OAuth providers appear without a UIX-maintained ordinary-provider list. `save_provider_credentials` accepts only a credential method currently offered by that catalog, validates required fields, and currently maps the generic API-key method into Pi's credential shape. `begin_oauth_flow`, `answer_oauth_flow`, `reopen_oauth_flow`, and `cancel_oauth_flow` drive Pi's generic auth/device-code/prompt/select callback vocabulary; `current_oauth_flow` restores an active modal, while `oauth_flow_changed` publishes transitions. Flow and prompt IDs reject delayed responses, and driver disposal aborts pending callbacks.

Electron's composition root injects the system-browser opener. It only receives the active URL supplied by Pi; surfaces do not receive a general arbitrary-URL capability. Pi writes credentials to UIX's app-owned profile `auth.json`, shared across UIX workspaces; UIX receives no completed credentials and stores none in workspace settings or session history. Success refreshes the shared `ModelRegistry` and emits `model_availability_changed` so consumers can re-fetch the ordinary available-only model list.

Credential-save requests, auth answers, current flow snapshots, and flow events use channel log descriptions: the IPC crossing remains observable, but API keys, callback URLs, authorization/device codes, and provider input are absent from terminal and NDJSON payload logs.

Chat's connection modal consumes authentication descriptors directly. An API method toggles an inline generated form whose empty replacement field identifies stored, environment, or command-backed auth without exposing complete values; source-help popovers clarify that saving writes a literal `auth.json` credential which takes precedence without mutating external sources. A subscription method expands independently from the one modal-owned OAuth flow: the idle panel starts nothing until the pilot selects an initiation method, then chat subscribes before beginning or restoring the flow and renders authorization/device-code/prompt/select/progress states inline, reopens provider-supplied URLs only through the constrained main-process request, and cancels only on an explicit action. Authorization and device-code URLs open in the system browser automatically after the pilot chooses a catalog-provided start action; the panel retains `Open browser again` as recovery. Closing the modal leaves the backend flow active, and reopening restores it by provider id. Successful persistence refreshes provider/model state and confirms in place, and the explicit `Choose a model` handoff opens the ordinary model search seeded to that backend provider. The search remains editable; UIX does not select a model automatically.

## Transcript projection

UIX keeps three related units distinct:

1. **Pi session entries** are the durable history/tree substrate. They are persisted by pi with `id`/`parentId` and represent conversation/state-machine steps such as user messages, assistant messages, tool results, custom messages, custom entries, model changes, and compactions. From the UI's point of view these are the branchable history units, not necessarily the smallest visible UI units.
2. **`TranscriptItem`s** are UIX's renderer wire shape. Main projects live pi events and replayed durable session entries into this one shape so the chat pane consumes the same model for live streaming and startup history. While an item streams, compact `transcript_partial` events update it by id (the renderer accumulates streamed text; tool progress payloads are replacement snapshots); a full replace of that one item lands at completion. Nothing ever replaces a whole turn or whole transcript.
3. **Chat blocks** are renderer units. A block is the smallest rendered chat-stream unit and is a view over the transcript projection. Today each `TranscriptItem` renders as one block, but the model intentionally allows one session entry to project to many transcript items and one transcript item to render as many blocks later.

This separation keeps pi's durable tree, UIX's streaming/replay normalization, and React rendering independent enough to evolve without re-keying the session format. Chat block renderers may also present a human-facing projection of an agent-facing payload: for example, canvas tool results keep anchored lines in the transcript item so the agent can edit safely, while the chat block hides the anchors from the human display.

The current canvas agent-tool contribution lives in `src/features/canvas/backend/contributions/agent-tools.ts` and contributes the anchored canvas channel:

- `canvas__anchor_read({ key, start?, end? })`
- `canvas__anchor_write({ key, html })`
- `canvas__anchor_edit({ key, start_line, end_line, replacement })`

Canvases are addressed by key through the substrate document store (`src/main/documents/store.ts`), edited via the anchored core (`src/main/anchors/`), and canonicalized at the canvas buffer boundary (`src/features/canvas/backend/normalize.ts`). The tools are canvas-named because every HTML document edited through them is a canvas; the document storage abstraction lives underneath the canvas buffer. Every result returns the affected lines in the `<anchor>§<text>` wire format so the agent never re-reads to learn current anchors.

## State messages

Substrate state reaches the agent through **agent context** (`src/main/agent-context/registry.ts`), never by rewriting the human's prompt text. Features declare contributions with a local `name` and optional buffer semantics; the substrate derives the canonical id (`${featureId}.${name}`, e.g. `canvas.pane-visibility`) which becomes both the dedup key and the inner section tag (used directly: `<canvas.pane-visibility>`). An **update** buffer carries a TypeBox schema and returns a handle with `update(payload)`; UIX retains the latest value and flushes it only when its post-materialized body differs from the nearest persisted section on the branch. An **append** buffer returns a handle with `append(payload)`; UIX queues values, materializes the pending list, and clears the confirmed batch only after the branch shows it was persisted. A contribution with no buffer supplies `materialize()`, called while UIX prepares an agent run, for state that must be created from the owner's live store at that boundary. The driver installs the assembler into pi when it opens the session and captures the installed registrations for that session. When anything flushed, it ships **one combined `display: false` custom message per run**: a single `<uix-state>` envelope containing one inner tag per section (e.g. `<canvas.pane-visibility>`, `<canvas.canvas-diff>`), persisted as one `uix.state` session entry — hidden from the chat, model-visible. The inner tags carry "what kind" on the wire because pi strips customType from LLM context; section bodies are freeform per type (default JSON for buffered payloads, anchored lines for diffs), and `details` carries any structured sidecar. Update buffers are **change-only**; append buffers are **pending-event queues**; no-buffer materializers decide whether to send by returning a message or `undefined`.

Features never call individual registration methods — `registerAgentContextContributions(agentContext, featureId, contributions)` is the sole registration path, accepting the author-facing `AgentContextContribution[]` and returning a `Disposable`.

The canvas agent-context contribution factory (`src/features/canvas/backend/contributions/agent-contexts.ts`) returns two contributions: `pane-visibility` (`{"canvases_open": [...]}`, change-only, canonical id `canvas.pane-visibility`) and `canvas-diff` (the anchored human-edit hunks, a consuming read computed at the boundary, always sent when present, canonical id `canvas.canvas-diff`). The substrate `registerAgentContextContributions(agentContext, featureId, contributions)` helper owns registration and disposal.

Feature contributions can register agent tools and agent context through the manifest feature path. There is no public API today for agent-turn triggers from arbitrary surface/channel events.

See [`features.md`](./features.md), [`contributions.md`](./contributions.md), [`channels.md`](./channels.md).
