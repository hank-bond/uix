---
summary: "The agent runtime opens Pi sessions, handles models and provider sign-in, restores feature state, and keeps the renderer's transcript current."
---

# Agent runtime

The driver owns each live Pi runtime and delegates focused work rather than letting helpers enroll themselves. Ordered installers attach UIX behavior when a runtime starts. Their order matters because Pi runs hooks in registration order.

A selected Pi branch is the shared source for the persisted transcript and restored feature state. Historical projection and live observation must produce the same renderer transcript shape. Live rows begin with temporary IDs when necessary, then adopt Pi's durable entry IDs when Pi persists their messages.

Workspace settings record the selected session, default model, and favorites. Session-file readers provide history and summaries without opening a model runtime, while the driver creates full Pi services only when an operation needs them.

Provider discovery and interactive sign-in share Pi's authentication state. A completed sign-in refreshes model availability without coupling provider-specific prompts or links to the renderer transport.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[auth-providers.ts](./auth-providers.ts)** Derives the provider sign-in list from Pi's available login methods and current connection state.
- **[branch-projection.ts](./branch-projection.ts)** Derives current transcript and restorable feature state from one selected Pi branch.
- **[driver.ts](./driver.ts)** Runs the selected Pi session and coordinates prompts, models, sign-in, transcripts, and feature state for the renderer.
- **[installers.ts](./installers.ts)** Assembles UIX's ordered Pi setup hooks into the single in-process extension used by each runtime.
- **[instance-state.ts](./instance-state.ts)** Owns the mutable collaborators and projections scoped to one live agent instance.
- **[provider-auth-flow.ts](./provider-auth-flow.ts)** Runs one interactive provider sign-in at a time and exposes its prompts, links, progress, and result to the renderer.
- **[session-files.ts](./session-files.ts)** Finds recent Pi session files and resolves a session ID to its JSONL file.
- **[session-settings.ts](./session-settings.ts)** Defines the workspace setting for the selected Pi session.
- **[session-summary.ts](./session-summary.ts)** Reads session titles, first user-message previews, and timestamps without opening each Pi session.
- **[settings.ts](./settings.ts)** Defines workspace settings for the default model and favorite models.
- **[system-prompt.ts](./system-prompt.ts)** Assembles UIX and feature prompt sections and appends them to Pi's system prompt before each run.
- **[tool-file-location.ts](./tool-file-location.ts)** Derives stable absolute and workspace-relative locations for transcript rows from read and write tool paths.
- **[transcript-item-identity.ts](./transcript-item-identity.ts)** Rekeys temporary live transcript IDs to durable Pi entry IDs when Pi persists messages.
- **[transcript-observer.ts](./transcript-observer.ts)** Mirrors live Pi session events as renderer transcript updates with the same item shape as persisted history.
- **[transcript.ts](./transcript.ts)** Derives the transcript items shown by the renderer from persisted Pi session entries.
- **[turn-state-coordinator.ts](./turn-state-coordinator.ts)** Restores feature state from the selected branch before allowing the driver to commit new state.

<!-- INDEX:END -->
