---
summary: "The `@uix/api` boundary holds the author contracts that features import and the substrate implements."
---

# Author contracts

The api boundary is one group: every production file here is a contract a feature author imports or a definition the substrate implements. Contracts stay schema- and type-only where possible so the same shapes serve backend and browser code. Behavior lives in the runtime, client, and host packages behind these contracts.

The files divide by facet. `feature.ts` defines the Workspace and Agent factories and their contribution points. Channels (`channels.ts`, `channel-resolution.ts`) derive validated communication. Web routes (`web-routes.ts`, `path-pattern.ts`) define typed local contracts. Installation chooses their namespace and Workspace or viewpoint scope. Resources and documents (`resources.ts`, `resource-routes.ts`, `documents.ts`) address durable content. The agent facets (`agent-tools.ts`, `agent-context.ts`, `agent-skills.ts`, `agent-system-prompt.ts`, `agent-channels.ts`, `turn-state.ts`) define what features contribute to each agent runtime slice. Actions, keybindings, and settings (`actions.ts`, `shortcuts.ts`, `settings.ts`) describe the interactive surface contracts, while `workspace.ts` binds the workspace client, sessions, and surfaces to feature components. `contribution-id.ts` provides the shared id grammar, `log.ts` the feature logger, and `index.ts` the public facade.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[actions.ts](./actions.ts)** Action contribution and catalog contracts.
- **[agent-channels.ts](./agent-channels.ts)** Agent request and event contracts, including prompt, active-turn activity and cancellation, models, and authentication.
- **[agent-context.ts](./agent-context.ts)** Agent-context contribution type.
- **[agent-skills.ts](./agent-skills.ts)** Pi skill paths provided by an active feature.
- **[agent-system-prompt.ts](./agent-system-prompt.ts)** A stable feature-owned section appended to the Agent's system prompt.
- **[agent-tools.ts](./agent-tools.ts)** Agent tool contribution types.
- **[channel-resolution.ts](./channel-resolution.ts)** Typed channel contributions.
- **[channels.ts](./channels.ts)** Typed channel request and event contracts.
- **[contribution-id.ts](./contribution-id.ts)** Shared contribution-id brand and constructor.
- **[documents.ts](./documents.ts)** Document store contract.
- **[feature-web-root-url.ts](./feature-web-root-url.ts)** Validated directory addresses for feature web routes, independent of host scheme.
- **[feature.ts](./feature.ts)** Defines Workspace and per-Agent feature factories and their contribution contracts.
- **[index.ts](./index.ts)** The `@uix/api` public facade re-exporting shared feature-author contracts.
- **[log.ts](./log.ts)** Feature logger contract.
- **[path-pattern.ts](./path-pattern.ts)** Normalizes feature-relative route patterns and encodes and decodes their URL parts.
- **[resource-canonical-id.ts](./resource-canonical-id.ts)** Resource canonical id brand and constructor.
- **[resource-routes.ts](./resource-routes.ts)** Normalizes resource routes and encodes and decodes host-neutral logical URLs.
- **[resources.ts](./resources.ts)** Resource address capability and contribution type.
- **[settings.ts](./settings.ts)** The settings scope contract.
- **[shortcuts.ts](./shortcuts.ts)** Parses, normalizes, and resolves shortcuts for the platform.
- **[substrate-channels.ts](./substrate-channels.ts)** The substrate's own channel contract and surface-composition types.
- **[surface-shared-modules.ts](./surface-shared-modules.ts)** Surface runtime shared-module contract.
- **[turn-state.ts](./turn-state.ts)** Turn-state contribution types.
- **[web-routes.ts](./web-routes.ts)** Typed web route contracts and handler contributions.
- **[workspace.ts](./workspace.ts)** Feature workspace client and surface contracts.

<!-- INDEX:END -->
