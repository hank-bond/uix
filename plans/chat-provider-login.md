---
summary: "Add chat-first provider connection UX over Pi's provider-owned ModelRuntime auth flows, followed by a no-model onboarding takeover and ordinary model-selection handoff."
status: active
---

# Chat provider login

Add the first-run path from an unconfigured UIX workspace to a usable Pi model without requiring the pilot to leave the cockpit. Chat renders the experience, but Pi's `ModelRuntime` owns provider definitions, authentication methods, prompts, credentials, model refresh, and availability.

The original split between UIX-authored API credential forms and a separate OAuth callback flow no longer applies. Pi providers now own both `api_key` and `oauth` login interactions through one prompt/notification vocabulary. UIX projects those methods and renders one generic flow; it does not merge backend provider identities, inspect `auth.json`, write credentials directly, or maintain provider-specific setup recipes. Chat may group related identities for presentation while every method retains Pi's provider id.

## Decisions assumed

- [Pilot substrate](../docs/decisions/2026-05-30-uix-is-a-pilot-substrate.md) and [Pi self-extension ethos](../docs/decisions/2026-06-05-pi-self-extension-ethos.md) — UIX presents Pi authentication; it does not own provider definitions, credentials, or availability policy.
- [Features are the loadable unit](../docs/decisions/2026-07-01-features-are-the-loadable-unit.md) — Chat consumes substrate-owned agent channels like any other feature. There is no Chat-private auth backend.
- [Agent controls](./archive/agent-controls.md) — model state remains Pi-native session state plus UIX's workspace default; provider login changes Pi auth and refreshes availability.
- [One owner per state](../docs/decisions/2026-06-09-one-owner-per-state.md) — one Chat controls owner coordinates model availability, the picker, modal, and active provider-auth flow.

## UX model

### Surface states

The Chat surface has three primary availability states:

1. **Checking** — model/auth availability has not resolved. Keep the ordinary surface neutral; never flash onboarding for configured users.
2. **No available models** — when the transcript is empty, show a front-and-center `Connect to a provider` takeover. If durable history exists, keep it readable and use a compact blocked-composer connection panel.
3. **Models available** — render ordinary Chat. The model picker retains a pinned `Connect to a provider` action in every search/list state.

A provider connection and selected model remain separate. Successful login refreshes Pi's available models and confirms in place; `Choose a model` then opens the ordinary available-only picker with an editable provider-seeded search. UIX neither exposes unavailable models nor silently selects a provider default.

### Connection modal

Authentication runs in a persistent Chat modal. Interactive methods derive directly from `provider.auth.apiKey.login` and `provider.auth.oauth.login`; Chat labels them by type as `API key` and `Sign in`. Providers ordinarily appear as their own rows, while OpenAI API access and the separate OpenAI Codex subscription identity share one OpenAI presentation row without changing either method's backend provider id. Non-secret connection source/label metadata comes from `ModelRuntime.getProviderAuthStatus()`.

Selecting a method opens the same generic flow panel. Starting it calls Pi's provider-owned `ModelRuntime.login(providerId, authType, interaction)`. Main owns one restorable flow snapshot from the moment startup begins; it retains provider notices alongside the current prompt rather than treating each callback as a replacement screen. The panel renders Pi's interaction vocabulary:

- text and secret prompts;
- selection prompts;
- authorization URLs and instructions;
- device codes and verification URLs;
- progress and informational notifications;
- success, failure, retry, and explicit cancellation.

Authorization and device-code URLs automatically open through the Electron-injected system-browser capability and retain `Open browser again`; informational links use the same active-flow validation. Chat cannot open arbitrary URLs. Light-dismiss does not cancel a flow, and reopening the modal restores its snapshot. Only one flow may run at once: selecting it again cancels it, while selecting another method cancels successfully before starting the replacement.

Flow answers are transient renderer-to-main signals. The driver correlates flow and prompt ids, passes each answer to the pending Pi prompt, honors prompt-level and flow-level abort signals, and rejects stale answers. Pi persists the resulting credential in UIX's app-owned profile; complete credential values never return to UIX and appear in neither settings nor session history.

## P0 — Sensitive channel logging and generic agent auth flow

The substrate-owned agent contract provides:

- `list_auth_providers` — provider-owned auth methods plus non-secret connection status;
- `begin_provider_auth_flow` — start one `api_key` or `oauth` login;
- `answer_provider_auth_flow` — answer the currently pending prompt;
- `open_provider_auth_link` — open a link retained from Pi's active flow snapshot;
- `cancel_provider_auth_flow` — abort the active login;
- `current_provider_auth_flow` — restore an active modal;
- `provider_auth_flow_changed` snapshots and `model_availability_changed` events.

Potentially sensitive answers, URLs, device codes, and flow snapshots use redacted crossing descriptions. Observability remains, but values do not enter terminal or NDJSON logs.

Acceptance:

- Fake providers can drive both API-key and OAuth flows, including multiple sequential fields, selections, informational links, and authorization context retained beside manual input.
- Only interactive Pi methods appear in the connection catalog, and only the currently pending flow/prompt can be answered.
- Startup ownership rejects concurrent flows; cancellation/disposal aborts pending prompts and suppresses late provider callbacks.
- Pi alone persists credentials and refreshes model availability.

## P1 — Generic connection modal

Chat projects the provider catalog without recipes and renders every method through one `ProviderAuthFlowPanel`.

Acceptance:

- Multi-field cloud providers work without provider-specific Chat code.
- Secret prompts use password inputs and are discarded from component state after advancement.
- Browser, device-code, prompt, selection, progress, retry, cancellation, and success states are keyboard-operable and announced appropriately.
- Success confirms in place and explicitly hands off to ordinary model selection.

## P2 — First-run takeover and model-picker entry

Wire model availability into Chat:

- suppress onboarding while availability is loading;
- show the centered connection takeover for an empty transcript with no models;
- preserve historical transcript visibility with a compact blocked-composer panel;
- retain the pinned connection action in populated, empty, loading, error, and no-match picker states;
- refresh the ordinary available-only catalog after auth changes.

## P3 — Verification and docs

Keep the shipped agent reference and architecture-of-record aligned with `ModelRuntime`, provider-owned auth, sensitive channel behavior, and live model refresh. Add focused coordinator, channel-policy, and renderer-state coverage; run the full repository check.

## Boundary / later

- Credential removal and account management are separate.
- No unavailable/locked model catalog and no model-first auth initiation.
- No automatic model selection; success only seeds ordinary editable search.
- No provider-specific auth components or setup recipes beyond presentation-only provider-family grouping.
- No transcript entries for auth progress, success, cancellation, or failure.
