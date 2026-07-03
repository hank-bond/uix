---
summary: "Make the cockpit usable without pre-authing pi in a terminal. The driver hoists AuthStorage/ModelRegistry off the session path and the substrate agent contract grows auth/model/status channels (A0); a StatusBar below the composer renders model/thinking/context cells with a gear-driven reorder modal (A1); an OAuth login modal drives pi's headless login handlers, with an empty-state connect card and a send guard (A2)."
status: active
---

# Spec: agent controls

Today a user must load pi in a terminal, authenticate, and pick a model _before_ opening the cockpit — the driver only builds `AuthStorage`/`ModelRegistry` inside `openSession()`, which first runs on the first prompt, and there is no UI to log in or choose a model. This plan builds the cockpit's own frontend for both.

Three units. **A0** (the driver hoist + contract) is the highest-value single piece — it alone unblocks anyone who already authed pi elsewhere, since UIX and pi share `auth.json`. A1 (StatusBar) depends on the settings store from [file-substrate](./file-substrate.md) (F1) for durable cell layout; A0/A2 don't touch it. A2 needs A0's channel bridge.

No users yet beyond the author, so breaking changes to the agent channel contract are free — favor the right shape over back-compat.

## Decisions assumed

- [pilot substrate](../decisions/2026-05-30-uix-is-a-pilot-substrate.md) / [pi self-extension ethos](../decisions/2026-06-05-pi-self-extension-ethos.md) — the StatusBar is a small composition primitive with cells as entries, not hardcoded chrome; auth/model machinery stays pi's, UIX only renders it.
- [features are the loadable unit](../decisions/2026-07-01-features-are-the-loadable-unit.md) — the agent channels live behind `@uix/api`; chat consumes them like any feature could.
- [no agent UI manipulation](../decisions/2026-05-30-no-agent-ui-manipulation.md) — StatusBar layout persists via the settings store (an ordinary file edit), never a channel the agent drives.

## Verified pi facts (2026-07-02, dist source)

- **Auth** (`core/auth-storage.d.ts`): `AuthStorage.create(authPath?)` reads `auth.json`; `AuthStorage.fromStorage(backend)` accepts any `AuthStorageBackend` (the hosting seam). `getOAuthProviders()` lists providers; `login(providerId, callbacks: OAuthLoginCallbacks)` runs the flow; `logout(provider)`; `set(provider, { type: "api_key", key })` for plain keys; `getAuthStatus(provider)` returns `{ configured, source?, label? }` without exposing secrets or refreshing tokens.
- **OAuth login handlers** (pi's `OAuthLoginCallbacks`, `pi-ai/dist/utils/oauth/types.d.ts`): `onAuth({ url, instructions? })`, `onDeviceCode({ userCode, verificationUri, ... })`, `onPrompt(prompt) => Promise<string>`, `onSelect(prompt) => Promise<string | undefined>`, `onManualCodeInput?() => Promise<string>` (the paste-the-code fallback — the local flow's safety net), `onProgress?(msg)`, `signal?: AbortSignal`. `onPrompt`/`onSelect`/`onManualCodeInput` are **main-asks-renderer**, the inverse of a normal request; bridge as an event carrying a prompt id, answered by a `loginInput` request keyed to that id. Providers with `usesCallbackServer` spin up a localhost redirect server — works locally because browser and pi share the machine.
- **Models** (`core/model-registry.d.ts`, `core/agent-session.d.ts`): `ModelRegistry.create(authStorage)`; `getAll()`, `getAvailable()` (= auth configured), `find(provider, id)`, `isUsingOAuth(model)`, `getProviderDisplayName(provider)`. On the session: `setModel(model)` (throws if no auth), `model` getter, thinking-level getters/setters + `getAvailableThinkingLevels()` (clamps per model).
- **Persisting choices** (`core/settings-manager.d.ts`): `Settings.defaultModel`; `setDefaultModelAndProvider(provider, id)`, `setDefaultThinkingLevel(level)` — persist across sessions so the StatusBar reflects prior choice pre-session.
- **Context usage** (`core/agent-session.d.ts` `getContextUsage()` → `core/extensions/types.d.ts ContextUsage`): `{ tokens: number | null, contextWindow: number, percent: number | null }`. `tokens`/`percent` are **null right after compaction and before the next LLM response** — the context cell must render `—` in that window. Usage only moves when a turn completes, so recompute on `turn_end`/`agent_end`, never poll.

## A0 — Driver hoist + agent channel contract

- **Hoist** `AuthStorage.create()` + `ModelRegistry.create(authStorage)` out of `openSession()` (`src/main/agent/driver.ts:168-169`) to **driver scope**, created eagerly (or on first `init()`), so auth status and the model list are queryable **before any session exists** — the exact state a fresh user is stuck in. `openSession()` reuses the hoisted instances. This alone unblocks anyone who already authed pi elsewhere (shared `auth.json`).
- **Extend the substrate agent contract** (`src/api/agent-channels.ts` `agentChannels` — chat already renders this connection, so it's the right home; not a chat-private channel):
  - requests: `authOverview` (providers + status + which have available models), `listModels`, `selectModel({ provider, id })` (persists default via `setDefaultModelAndProvider` **and** hot-switches the live session if one is open), `setApiKey({ provider, key })`, `login({ provider })`, `cancelLogin({ id })`, `logout({ provider })`, `loginInput({ id, value })` (answers an `onPrompt`/`onSelect`/`onManualCodeInput`), `agentStatus` (→ `{ model, thinkingLevel, contextUsage, providersConfigured }`), `setThinkingLevel({ level })`.
  - events: `login_step` (carries `{ id, kind }` for auth-url / device-code / progress / prompt / select / done / error), `status_changed` (model/thinking/context/auth moved), `auth_changed`.
- **Driver emits** `status_changed` after `selectModel`/`setThinkingLevel`, after `auth_changed`, and at `turn_end`/`agent_end` for `contextUsage` (`getContextUsage()`; render `—` when `tokens`/`percent` null). Pre-session, `contextUsage` is undefined and model/thinking come from settings defaults — the bar renders fully before the first prompt.
- Handlers merge via `withHandlers(agentChannels, {...})` alongside the existing `prompt`/`history` in `src/main/index.ts:241`, closing over the driver.

## A1 — StatusBar (discrete component, below the composer)

A dedicated `StatusBar` component the chat surface renders **below** the composer form (matching where pi's TUI footer sits). Dense single row of **cells**; each cell is compact text/icon and opens its own anchored popover on click; a gear icon at the far end opens the reorder modal.

- **Cell model** — an ordered array of `{ id, cell: Component, popover?: Component }`, not hardcoded JSX. This is the seam for "more things later" and makes the reorder modal fall out of the same list. **Registry is chat-local** — no cross-feature cell contribution (no cross-feature type system today; explicitly out of scope).
- **v1 cells**:
  - **model** — name + auth dot; popover is the model picker grouped by provider (current marked; unauthenticated providers show dimmed models + a `connect` affordance that launches A2). Selecting calls `selectModel`.
  - **thinking** — current level; popover lists levels valid for the current model (`getAvailableThinkingLevels`), calls `setThinkingLevel`. _Cuttable from v1_ if it complicates the strip; model + context are the load-bearing two.
  - **context** — `ctx 42%`; `ctx —` when null (post-compaction / pre-response). Popover shows tokens/window/percent; natural future home for a "compact now" action.
  - **gear** — opens the reorder modal: drag-drop list of cells (allow hide/show while there — same modal, one toggle). **Plain HTML drag events or a small pointer-based list; no dnd dependency** (substrate ships no design system; keep the feature dep-light).
- **Persistence via file-substrate F1**: `ctx.settings.get("statusBar")` → `{ order, hidden }` at mount; `set` on modal save; `onChange` keeps it live if the agent or a hand edit changes it. This is the only cross-plan dependency.
- Data via A0: subscribe `status_changed`, seed from `agentStatus`.

## A2 — OAuth login modal (local flow)

A focused modal (blocks only the chat surface while logging in — login is rare) launched from the model popover's `connect`, driven by pi's `login(provider, callbacks)` through the A0 channel bridge:

- Driver builds `OAuthLoginCallbacks` that translate to `login_step` events and (for the async ones) await a `loginInput` request keyed by prompt id:
  - `onAuth({ url })` → main fires `shell.openExternal(url)` **and** emits a step so the modal shows an "opened browser / reopen link" affordance; pi's localhost callback server catches the redirect.
  - `onDeviceCode` → show code + verification URI.
  - `onManualCodeInput` → always-visible "paste code manually" input (the local-flow safety net) → resolves via `loginInput`.
  - `onPrompt`/`onSelect` → render inline input/selector → `loginInput`.
  - `onProgress` → status line. `signal` wired to the modal's cancel (`cancelLogin`).
- **API-key providers**: same modal, single key field → `setApiKey` → `authStorage.set(provider, { type: "api_key", key })`.
- On success: modal closes, `auth_changed` refreshes the popover, the provider's models light up. **Empty state**: when `authOverview` reports nothing configured, replace the transcript placeholder with a "connect a provider to start" card that opens this modal — fixes today's failure where the first prompt dies deep in `openSession()` with an opaque error row. **Send guard**: composer disables send with a hint when no model is selectable, rather than letting the prompt fail.
- **Web/hosted note (not built here)**: hosted swaps this for paste-a-token (user logs in infrequently, doesn't mind) — same channel contract, different `OAuthLoginCallbacks` impl + an `AuthStorageBackend` other than `auth.json`. The contract is transport-agnostic on purpose; building the local flow doesn't corner the hosted one.

## Boundary / non-goals

- No cross-feature cell contribution, no generic settings UI surface, no hosted paste-a-token flow, no OS sandbox for pi bash — future-column ([backlog](./backlog.md)).
- Depends on [file-substrate](./file-substrate.md) F1 for A1 only; A0 is independently shippable and is the fastest path to "usable without a terminal."
