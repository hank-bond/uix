---
summary: "Pi owns model availability and provider authentication. UIX projects generic catalogs, workspace defaults, favorites, status, and one restorable login flow."
kind: reference
status: active
---

# Models and provider authentication

The agent driver owns a lazy Pi `AgentSessionServices` tier above the live session. This tier contains `ModelRuntime`, settings, and loaded extension resources.

Model and authentication requests can start that tier before the first prompt. Session creation reuses the same services instead of loading an overlapping copy.

## Model state

Pi owns the live branch-aware model through native `model_change` entries. UIX separately persists an optional workspace default under `agent.defaultModel`.

At session open, the workspace default applies only when the selected branch has no model change. Without either value, Pi performs its own resolution.

Surfaces never mutate model settings directly. They use these agent-channel operations:

- `list_models()` returns only available authentication-configured models with workspace-local favorite state.
- `set_model_favorite({ provider, id, favorite })` updates `agent.favoriteModels` and returns the refreshed catalog.
- `agent_status()` returns the tool working directory, optional live model, and optional workspace default.
- `select_model({ provider, id })` validates availability, persists the default, and switches a live session.
- `status_changed` publishes a complete replacement status after relevant live changes.
- `model_availability_changed` tells consumers to fetch the available catalog again.

Unavailable favorite references remain persisted. They return to the catalog when their provider becomes available again.

Both model fields can be absent. That state means no model is chosen, and surfaces must present it without inventing a fallback.

Chat's model picker groups favorites and all available models. Selecting a row and changing its favorite state remain independent actions.

## Provider catalog

Pi providers define interactive API-key and OAuth login methods through `ModelRuntime`. UIX projects those methods into `ProviderAuthCatalogEntry` values.

Connection source and optional non-secret labels come from Pi's provider status. Ambient-only authentication does not appear as an unusable interactive method.

UIX does not merge backend identities, inspect `auth.json`, define credential fields, or maintain provider-specific setup instructions. Presentation may group related identities without changing provider ids.

## Authentication flow

The agent contract exposes one generic flow:

- `list_auth_providers()` lists interactive methods and non-secret status.
- `begin_provider_auth_flow()` starts one API-key or OAuth interaction.
- `current_provider_auth_flow()` restores the active snapshot or returns `null`.
- `answer_provider_auth_flow()` answers the current Pi prompt.
- `open_provider_auth_link()` opens a retained link after active-flow validation.
- `cancel_provider_auth_flow()` cancels the matching flow.
- `provider_auth_flow_changed` publishes replacement snapshots.

Main synchronously claims one flow before loading `ModelRuntime`. The restorable snapshot retains notices, links, phase, and the current prompt.

Pi can request text, secret text, or a described selection. It can also publish informational links, authorization URLs, device codes, progress, success, or failure.

Flow and prompt ids reject delayed answers. Prompt abort signals reject superseded input, while flow cancellation suppresses late provider callbacks.

Electron injects a system-browser opener into the driver. Surfaces do not receive a general arbitrary-URL capability.

Pi alone persists credentials in the application-owned profile. Complete credentials never return to UIX or enter workspace settings and session history.

Successful authentication refreshes model availability and emits `model_availability_changed`. UIX does not select a model automatically.

## Sensitive logging

Authentication answers, URLs, codes, and flow snapshots use channel logging descriptions. IPC crossings remain observable without recording sensitive payloads.

Chat renders every provider interaction through one generic panel. Closing the modal leaves the backend flow active, and reopening restores its snapshot.

See [`how-to/add-a-channel.md`](./how-to/add-a-channel.md) for payload-description rules and [`settings.md`](./settings.md) for model defaults and favorites.
