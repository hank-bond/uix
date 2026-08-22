---
summary: "The agent runtime opens Pi sessions, handles models and provider sign-in, restores feature state, and keeps the renderer's transcript current."
---

# Agent runtime

One workspace agent runtime owns shared provider and model services plus an agent instance supervisor. The supervisor retains session-keyed `AgentInstanceOwnership`s and issues guards that provide operational `AgentInstance` values. Each instance owns its session manager, Agent feature factories, facet registries, restored state, and lazily booted Pi runtime. Ordered installers read that instance's registries when Pi starts or reloads.

Each instance's branch is the shared source for its persisted transcript and restored feature state. Historical projection and live observation must produce the same renderer transcript shape. Live rows begin with temporary IDs when necessary, then adopt Pi's durable entry IDs when Pi persists their messages.

Bulk maintenance visits a stable live-instance snapshot under supervisor-owned temporary guards and passes only operational instance values to visitors. Workspace settings record the default model and favorites. Session-file readers provide history and summaries without opening a Pi runtime. Instance-specific operations use the operational value carried by a live guard, and running turns retain their own guards through the final safe boundary.

Provider discovery and interactive sign-in share Pi's authentication state. A completed sign-in refreshes model availability without coupling provider-specific prompts or links to the renderer transport.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[auth-providers.ts](./auth-providers.ts)** Derives the provider sign-in list from Pi's available login methods and current connection state.
- **[branch-projection.ts](./branch-projection.ts)** Derives current transcript and restorable feature state from one selected Pi branch.
- **[installers.ts](./installers.ts)** Assembles UIX's ordered Pi setup hooks into the single in-process extension used by each runtime.
- **[instance-state.ts](./instance-state.ts)** Owns the mutable collaborators and projections scoped to one live agent instance.
- **[instance-supervisor.ts](./instance-supervisor.ts)** Supervises session-keyed agent instances and issues explicit lifetime guards.
- **[instance.ts](./instance.ts)** Owns one live Pi execution, active-turn cancellation, and mutable feature state at one session viewpoint.
- **[provider-auth-flow.ts](./provider-auth-flow.ts)** Runs one interactive provider sign-in at a time and exposes its prompts, links, progress, and result to the renderer.
- **[reload-admission.ts](./reload-admission.ts)** Keeps Agent operations and Workspace feature reload outside each other's lexical scopes.
- **[session-files.ts](./session-files.ts)** Finds recent Pi session files and resolves a session ID to its JSONL file.
- **[session-manager.ts](./session-manager.ts)** Opens one explicit durable session into its own Pi manager.
- **[session-summary.ts](./session-summary.ts)** Reads session titles, first user-message previews, and timestamps without opening each Pi session.
- **[settings.ts](./settings.ts)** Defines workspace settings for the default model and favorite models.
- **[system-prompt.ts](./system-prompt.ts)** Assembles UIX and feature prompt sections and appends them to Pi's system prompt before each run.
- **[tool-file-location.ts](./tool-file-location.ts)** Derives stable absolute and workspace-relative locations for transcript rows from read and write tool paths.
- **[transcript-item-identity.ts](./transcript-item-identity.ts)** Rekeys temporary live transcript IDs to durable Pi entry IDs when Pi persists messages.
- **[transcript-observer.ts](./transcript-observer.ts)** Mirrors live Pi session events as renderer transcript updates with the same item shape as persisted history.
- **[transcript.ts](./transcript.ts)** Derives the transcript items shown by the renderer from persisted Pi session entries.
- **[turn-state-coordinator.ts](./turn-state-coordinator.ts)** Restores feature state from one selected branch before its guarded instance can commit new state.
- **[workspace-agent-runtime.ts](./workspace-agent-runtime.ts)** Creates per-session feature instances and coordinates their Pi runtimes, models, and turns.

<!-- INDEX:END -->
