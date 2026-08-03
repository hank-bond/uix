---
summary: "UIX owns a lazy Pi runtime, exposes it through substrate channels, and installs manifest-composed agent facets without ambient built-in tools."
kind: reference
status: active
---

# Agent integration

UIX owns one Pi `AgentSessionRuntime` for the workspace. The runtime starts lazily when a prompt or session mutation first needs a live session.

An authentication-free `SessionManager` opens the selected durable graph before runtime creation. This separation lets surfaces read history and session summaries without loading model or authentication services.

Every runtime generation binds one active `AgentSession`. UIX binds Pi extension resources before using that session, so resource discovery and `session_start` follow Pi's supported lifecycle.

Electron gives Pi one application-owned profile under `<userData>/pi`. The profile is shared across UIX workspaces and isolated from the host Pi command-line profile. UIX never copies or falls back to the host profile.

Pi stores profile-level credentials, settings, custom models, extensions, skills, prompts, and context there. The workspace agent working directory still supplies project-local `.pi` settings and resources, and process environment variables remain available to Pi. Session history remains under the workspace's `.uix/sessions` directory.

## Agent channel

Surfaces use the substrate-owned `agentChannels` contract from `@uix/api/agent-channels`. The contract registers under the reserved `agent` owner id.

Chat is an ordinary feature that consumes this contract. Any feature surface can consume the same requests and events without importing Chat.

The contract groups four areas:

- **Prompting and status:** Accept prompts and publish the agent lifecycle and transcript event stream.
- **Sessions:** Read history, list summaries, replace the selected graph, and set titles.
- **Models:** Read status, list available models, manage favorites, and select a model.
- **Provider authentication:** List Pi-owned methods and coordinate one generic login flow.

[`sessions-and-transcripts.md`](./sessions-and-transcripts.md) documents durable sessions and transcript projection. [`models-and-authentication.md`](./models-and-authentication.md) documents model and provider controls.

## Reload

Substrate reload uses typed Electron Inter-Process Communication (IPC), not an agent channel. Reload replaces manifest features and workspace settings before reconciling Pi.

If model or authentication services exist, reload recreates that services tier. If a live session exists, reload also calls Pi's native `session.reload()` path.

Reload does not create Pi services or a session solely to reload them. Replacement feature turn state restores before the renderer receives the changed surface composition.

## Agent contributions

Manifest features can contribute these Pi-facing facets:

- Feature-namespaced agent tools.
- Intentional exact-name agent tool overrides.
- One stable system-prompt section.
- Pi skill files or directories.
- Branch-scoped turn-state cells.
- Model-visible agent-context sections.

UIX starts Pi with built-in tools inactive. The workspace feature composition therefore defines the complete available tool surface.

Ordinary tools receive names such as `${featureId}__${name}`. Exact-name overrides retain their authored Pi name and fail activation on a competing claim.

Internal `AgentInstaller` functions adapt live registries into one UIX-owned Pi extension factory. They are substrate wiring, not a feature-facing extension point.

The reference `workspace_tools` feature contributes reason-bearing `read`, `write`, and `command` tools plus passthrough `edit`. Bare workspace scaffolding instead copies editable passthrough Pi tool source.

[`agent-context.md`](./agent-context.md) explains system-prompt sections, skills, turn state, and hidden model-visible context. [`contributions.md`](./contributions.md) lists every feature facet.
