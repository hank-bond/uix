---
summary: "Add the first cockpit agent control: a chat status-bar model pill backed by available pi models, workspace-level default-model settings, native pi model_change entries for live/branch state, and a searchable picker."
status: active
---

# Spec: agent controls

Build the first useful chat status-bar control: a model pill that shows the current/default model, opens a searchable picker, and lets the pilot select an available pi model without leaving UIX.

This is intentionally smaller than a full auth/control surface. v1 assumes pi auth is already configured elsewhere and lists **available models only**. OAuth/API-key UI, thinking-level controls, context usage, and reorderable status-bar cells remain later work.

## Decisions assumed

- [pilot substrate](../decisions/2026-05-30-uix-is-a-pilot-substrate.md) / [pi self-extension ethos](../decisions/2026-06-05-pi-self-extension-ethos.md) — UIX renders controls over pi's model/auth machinery; it does not fork provider/model logic.
- [features are the loadable unit](../decisions/2026-07-01-features-are-the-loadable-unit.md) — chat consumes substrate-owned agent channels like any feature could; model control belongs to the agent substrate, not a chat-private backend.
- [no agent UI manipulation](../decisions/2026-05-30-no-agent-ui-manipulation.md) — persistent defaults change through workspace settings in `uix.workspace.json`, not through an agent-side UI API.
- [agent-state-messages](../design/agent-state-messages.md) — model/thinking status is transcript-native pi state (`model_change` / `thinking_level_change`), not a new `uix.turn-state` cache.

## Verified pi facts

- `ModelRegistry.create(authStorage)` can list known models; `getAvailable()` returns only models with configured auth.
- `AgentSession.setModel(model)` validates auth, updates the live agent model, appends a native `model_change` entry, persists pi's default model/provider, reclamps thinking level, and emits model-select hooks.
- `SessionManager` persists native `model_change` entries with `{ provider, modelId }`; `createAgentSession(...)` restores the current model from branch history before falling back to configured defaults.
- pi's `SettingsManager` has default provider/model APIs, but UIX wants a **workspace default** in the workspace manifest rather than a global/project pi default as the cockpit source of truth.

## Target model

There are two distinct pieces of state:

1. **Current/live model** — pi-owned, branch-aware session state. When a session exists, selecting a model calls `session.setModel(model)`, producing a native `model_change` entry. History/branch replay should derive current model from pi's branch, not from UIX turn state.
2. **Workspace default model** — UIX workspace setting. Used before a pi session exists and as the default for new sessions/branches that do not already carry a `model_change` entry.

Workspace settings are substrate-owned and manifest-level, not feature-scoped:

```json
{
  "name": "My Workspace",
  "settings": {
    "agent": {
      "defaultModel": {
        "provider": "anthropic",
        "id": "claude-sonnet-4-5"
      }
    }
  },
  "features": []
}
```

For now, workspace settings are not user-registerable. The substrate owns the small schema set it needs, beginning with `agent.defaultModel`.

## A0 — Workspace-level settings

Extend `WorkspaceSettingsStore` with substrate-owned workspace settings alongside existing feature settings.

- Keep feature settings under each manifest feature entry unchanged.
- Add manifest-level `settings` object keyed by substrate namespace, initially `agent.defaultModel`.
- Add store operations for workspace settings, e.g. `getWorkspaceSetting(namespace, key)`, `setWorkspaceSetting(namespace, key, value)`, and change subscription for substrate callers.
- Reuse the same semantics as feature settings: TypeBox schema, explicit default or optional value policy, JSON cloning, validated set, debounced atomic manifest write, reload disk-wins.
- Expose workspace settings to main-process substrate code; optionally expose a read/write handle on `FeatureContext` only if a feature has a real need. Model selection itself should go through agent channels, not by surfaces directly mutating `agent.defaultModel`.

Acceptance:

- Missing manifest-level settings hydrate or read as the schema's default/undefined policy without touching feature entries.
- Setting `agent.defaultModel` persists to `uix.workspace.json` and notifies subscribers.
- Existing feature settings tests still pass unchanged.

## A1 — Agent driver model service

Hoist pi auth/model services to driver scope so model status is available before the first prompt opens an `AgentSession`.

- Create/reuse `AuthStorage` and `ModelRegistry` outside `openSession()`.
- `openSession()` reuses the hoisted instances and applies the workspace default model when no branch model overrides it.
- Add driver methods:
  - `listModels()` — returns available models only.
  - `status()` — returns current live model if a session exists, else workspace default when set.
  - `selectModel({ provider, id })` — validates the model exists in available models, writes workspace default, and if a session exists calls `session.setModel(model)`.
- Emit a status changed callback after `selectModel`, after session creation when the selected/restored model becomes known, and after live pi model changes if those are observed through session events/hooks.

Acceptance:

- A fresh workspace can list models before any prompt is sent.
- Selecting before session creation updates workspace default only.
- Selecting after session creation also switches the live session via `setModel`, producing native pi state.

## A2 — Agent channel contract

Extend `@uix/api/agent-channels` with model/status requests and events.

Requests:

- `list_models`: `void -> { models: ModelOption[] }`
- `agent_status`: `void -> AgentStatus`
- `select_model`: `{ provider: string; id: string } -> AgentStatus`

Events:

- `status_changed`: `AgentStatus`

Initial public shapes:

```ts
interface ModelRef {
  provider: string;
  id: string;
}

interface ModelOption extends ModelRef {
  name: string;
}

interface AgentStatus {
  model?: ModelRef;
  defaultModel?: ModelRef;
}
```

`list_models` returns **available models only**. If no models are available, the UI shows an empty state; auth/connect UI is a later unit.

Acceptance:

- Renderer can fetch models/status and select a model through the typed channel client.
- Main validates every select request against pi's available model registry.
- Status events reach all mounted chat surfaces.

## A3 — Chat status-bar model pill + picker

Replace the current status-bar smoke test with the first real cell.

- Render a compact model pill below the composer.
- Seed from `agent_status`; subscribe to `status_changed`.
- Pill label priority: live/current model, workspace default model, then `select model` empty state.
- Clicking opens a small anchored popover/modal scoped to the chat surface.
- The picker has a focused text input and filters by provider, id, and display name.
- Selecting a row calls `select_model`, updates status from the response, and closes the picker.
- Empty state: `No authenticated models found. Configure pi auth, then reload.`

Acceptance:

- The smoke-test `model/thinking/context` chips are gone.
- A user can search and select an available model.
- The selected model persists as workspace default and is reflected by the pill on reload.

## A4 — Docs and tests

- Update `src/docs/settings.md` with manifest-level workspace settings and the feature-vs-workspace split.
- Update `src/docs/agent.md` with model list/status/select channel behavior.
- Update architecture current-state after implementation.
- Tests:
  - workspace settings hydrate/set/reload behavior;
  - agent channel schemas/client behavior;
  - driver model selection with a fake/isolated pi surface where practical;
  - chat picker filtering and select behavior at the component/client boundary if the current test setup supports it.

## Boundary / later

- No auth/login UI in this slice.
- No unavailable-model rows in this slice; list only authenticated/available models.
- No thinking-level picker yet, though native pi state already exists.
- No context-usage cell yet.
- No generic status-bar cell registry or reorder modal yet; the model pill is the first concrete cell.
- No use of `uix.turn-state` for model selection; current model is pi native session state.
