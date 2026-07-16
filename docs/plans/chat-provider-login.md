---
summary: "Add chat-first provider connection UX: unified OAuth and credential setup, guided cloud-provider recipes, a no-model onboarding takeover, secure channel redaction, and normal unfiltered model selection after login."
status: active
---

# Chat provider login

Add the first-run path from an unconfigured UIX workspace to a usable Pi model without requiring the pilot to leave the cockpit and run Pi separately. Chat renders the experience, but authentication remains an agent-substrate capability over Pi's existing `AuthStorage` and `ModelRegistry`.

The connection surface unifies OAuth/subscription login with API-key and guided cloud credential entry. Ordinary providers derive from Pi's model registry rather than a UIX-maintained list; registered OAuth capabilities are merged onto those providers. A small UIX setup-recipe table may replace the generic API-key form for stable multi-field cloud setups, while all submitted values remain owned and persisted by Pi's `AuthStorage`.

## Decisions assumed

- [Pilot substrate](../decisions/2026-05-30-uix-is-a-pilot-substrate.md) and [Pi self-extension ethos](../decisions/2026-06-05-pi-self-extension-ethos.md) — UIX presents Pi authentication; it does not own provider definitions, OAuth implementations, credentials, or model availability rules.
- [Features are the loadable unit](../decisions/2026-07-01-features-are-the-loadable-unit.md) — chat consumes substrate-owned agent channels like any other feature. There is no chat-private auth backend.
- [Agent controls](./archive/agent-controls.md) — model state remains Pi-native session state plus UIX's workspace default; provider login only changes Pi auth and refreshes model availability.
- [One owner per state](../decisions/2026-06-09-one-owner-per-state.md) — one chat-side controls owner coordinates model availability, the picker, and the connection modal; the onboarding entry and model-pill entry do not grow independent copies of that state.

## UX model

### Surface states

The chat surface has three primary availability states:

1. **Checking** — model/auth availability has not resolved. Keep the ordinary surface neutral; never flash the first-run takeover for configured users.
2. **No available models** — when the transcript is empty, show a front-and-center onboarding takeover with `Connect to a provider` as the dominant action. Disable or cover the composer because submitting cannot produce a run. If durable transcript history exists, keep it readable and use a compact blocking connection panel near the composer rather than obscuring the conversation.
3. **Models available** — render ordinary chat. The model picker lists Pi's normal available-model result and keeps a pinned `Connect to a provider` action below the searchable/scrollable model area, including while the search has no matches.

A provider connection and a selected model remain separate concepts. Successful login refreshes Pi's available models and confirms the connection in place; an explicit `Choose a model` handoff then opens the ordinary picker with its search seeded to the connected backend provider. The query is editable and clearing it restores the complete available-only list. UIX does not expose unavailable models or silently choose a provider default.

### Connection modal

Authentication runs in a persistent modal rather than the model popover. The model picker and first-run takeover are entry points into the same modal state. Provider rows stay visible while their active method expands inline: `API` toggles a descriptor-derived credential form, while `Subscription` first expands catalog-provided start actions without starting a flow; selecting an action begins OAuth, automatically opens any authorization or device-code URL Pi supplies, and then presents provider prompt/device/progress states in that row. Light-dismiss does not cancel a browser round trip; only an explicit cancel action does.

Provider rows derive from Pi's provider IDs and display names, with small setup-recipe presentation overrides where layperson-facing grouping or naming is clearer. Model providers default to a generic `API` method; setup recipes replace that default only when a provider needs different behavior. Recipes may also combine backend provider IDs into one layperson-facing row: `openai` API auth and `openai-codex` subscription auth appear together as `OpenAI (ChatGPT)`, while each method retains the Pi provider ID it actually configures. Already-connected providers are visibly marked; a reopened API form shows the active environment-variable reference and, when safely available for either environment or stored-literal auth, a masked last-four key hint in its empty replacement input. Command-backed credentials show `!command`, never the raw command. A small source-help popover explains the current source and makes replacement semantics explicit: saving writes a literal key to Pi's `auth.json`, does not mutate the environment variable, command, provider configuration, or external secret source, and takes precedence for future use. Complete values and command/OAuth details remain undisclosed. Selecting a connected method is a reconnect action rather than a silent credential replacement. Rows first split into connected/configured and unconnected groups. Within each group the same practical ordering applies: subscription-capable providers, OpenRouter, and all remaining providers, alphabetically within each category.

The callback presentations are deliberately generic because custom Pi OAuth providers use the same vocabulary:

- `onAuth` — open the system browser, show instructions and `Open browser again`, and accept manual redirect/code input when Pi says the provider uses a callback server;
- `onDeviceCode` — show the verification URL and prominent user code, automatically open the browser after the pilot's start action, retain a reopen action, and show the waiting state;
- `onPrompt` — render provider-supplied message, placeholder, and empty-value policy;
- `onSelect` — render provider-supplied choices;
- `onProgress` — update concise progress text without creating transcript entries.

Failures remain in the expanded row with `Retry`; collapsing it returns to the provider list without creating a transcript error. Reopening the modal while a login is active resumes that flow rather than starting a concurrent one.

### Completion

On successful login:

1. Pi persists credentials in UIX's app-owned auth store, shared across UIX workspaces;
2. the agent substrate refreshes model availability and notifies consumers;
3. the method turns visibly connected with a reduced-motion-safe one-shot confirmation;
4. the expanded row offers `Back to providers` and a primary `Choose a model` action;
5. that explicit action closes the modal and opens the normal model picker with the connected backend provider seeded into its editable search.

If Pi still reports no models, the existing generic no-model state remains in place. This is not a separate provider-specific UI state.

## L0 — Sensitive channel logging

Authentication introduces renderer/main payloads that must never appear in UIX's terminal or raw NDJSON wire logs: pasted callback URLs, authorization codes, device codes, and later API keys.

Extend channel/IPC log policy so request, response, and event crossings can record a redacted description instead of the raw payload. Redaction still emits a crossing record — observability remains intact — but secret-bearing values do not leave process memory through logging. The auth contract marks every potentially sensitive callback/response path explicitly.

Acceptance:

- A test secret sent in an auth response is absent from both terminal-policy and file-log payload descriptions.
- Device-code and authorization-URL events are likewise redacted.
- Existing channel logging behavior is unchanged by default.

## L1 — Agent auth contract and flow coordinator

Add provider-login requests/events to the substrate-owned agent contract and implement a driver-owned flow coordinator over the same Pi `AuthStorage`/`ModelRegistry` instances used by sessions.

The contract needs operations equivalent to:

- list model and OAuth providers, their generic auth methods, and non-secret connection status;
- begin a provider login and return a flow id;
- answer a provider prompt/selection/manual-code request by flow id plus prompt id;
- reopen the current authorization URL;
- cancel the active flow;
- publish redacted flow-state events and a non-secret availability-changed event.

The coordinator owns one active flow, pending callback resolvers, an `AbortController`, stale-response rejection, and disposal. Browser opening is injected by the Electron composition root and only reopens the URL Pi supplied; the renderer never gets a general arbitrary-URL opener.

Provider discovery must use Pi's registered OAuth providers after the relevant Pi resource/extensions tier is initialized, so extension-provided OAuth is not replaced by a UIX-maintained provider list. Credentials remain exclusively in the app-owned Pi profile's `auth.json`, shared across UIX workspaces and isolated from the host Pi profile; UIX workspace settings and transcript/session entries carry none of them.

Acceptance:

- Fake providers can drive auth URL, device code, prompt, select, progress, success, failure, and cancellation paths.
- Only the currently pending flow/prompt can be answered.
- Disposing the driver aborts the flow and rejects pending callbacks.
- Success refreshes `ModelRegistry`; no credentials cross back to the renderer.

## L2 — Connection modal

Add the chat-owned modal and a single renderer-side controls owner shared by the onboarding entry and model pill.

Build the provider chooser first, then inline credential and generic callback panels. The modal subscribes before beginning a flow, survives the model popover closing, does not light-dismiss an active login, and restores the active state if reopened. Accessibility basics are part of the slice: dialog labeling, initial focus, Escape as explicit cancellation when safe, keyboard-operable choices, status announcements, reduced-motion-safe confirmation, and focus restoration or intentional handoff.

Acceptance:

- A provider can be selected and the complete fake OAuth flow can be driven from the chat surface.
- Browser, device-code, prompt, selection, waiting, progress, retry, and cancel states are understandable without transcript output.
- Successful login confirms in place; its explicit handoff closes the modal and opens the normal model picker with an editable provider search.

## L3 — First-run takeover and model-picker entry

Wire model availability into the chat surface:

- suppress onboarding while availability is loading;
- show the centered `Connect to a provider` takeover for an empty transcript with no available models;
- preserve historical transcript visibility with a compact blocked-composer connection panel;
- add the pinned connection action to the model picker in every list/search state;
- refresh the ordinary available-only model catalog after auth changes; the explicit success handoff may seed its ordinary search with the connected provider.

Acceptance:

- A fresh unconfigured workspace has one unmistakable next action.
- A configured workspace never flashes the takeover while loading.
- A returning unauthenticated workspace can still read its transcript.
- The connection action remains visible below populated, empty, loading, error, and no-search-match model states.

## L4 — Documentation and verification

Update the shipped agent reference and architecture-of-record to describe auth listing/login, credential ownership, sensitive channel behavior, and live model refresh. Add focused coordinator, channel-policy, and renderer-state tests; run the full repository check.

## Boundary / later

- Setup recipes cover stable, exceptional cloud-provider forms only; ordinary API-key providers continue to derive from Pi's model registry.
- Credential removal/account-management UI is separate. Reconnecting an OAuth provider is supported because it is required to recover stale credentials.
- No unavailable/locked model catalog and no model-first auth initiation.
- No persistent provider-only model mode and no automatic model selection; the success handoff only seeds the ordinary editable search.
- No provider-specific OAuth components; registered providers use the generic Pi callback vocabulary.
- No transcript entries for auth progress, success, cancellation, or failure.
