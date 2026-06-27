---
summary: "Derive contribution/canonical ids from featureId + name across all facets so authors give only a local name; one uniform ContributionId brand (`${featureId}.<facet>.<name>`) plus one per-facet canonical-id brand (facet segment dropped), the api exposes author shapes only. Units: channels (done), agent tools, state messages, resources, private state."
status: active
---

# Spec: contribution id derivation

Feature authors used to hand-write the full dotted id for every contribution (`id: "canvas.anchor_read"`, `messageType: "uix.pane-visibility"`, `scheme: "uix-canvas"`, …), and in some facets hand-coordinate a _second_ downstream id by hand too (the pi tool name `canvas__anchor_read` alongside the contribution id). That asks the author to know and keep in sync several substrate naming conventions. This refactor moves all id derivation into the facets: the author gives a local `name`, the facet derives both the registry dedup id and the downstream-system address.

The model is established in the channels facet (committed) and applied uniformly to the remaining four. The identifier grammar lives in [`../architecture/concepts.md`](../architecture/concepts.md) (Identifier grammar); this plan is the build spec for landing it across the facets.

## Target model

Every facet: author gives `name` (+ payload/handler). The facet derives two ids.

- **`ContributionId`** — registry dedup key. One uniform brand, shared across facets, constructed by `contributionId(featureId, facet, name)` → `${featureId}.<facet>.<name>`. Lives in `src/shared/contribution-id.ts`.
- **`…CanonicalId`** — the downstream-system address. One brand per facet (each has its own format), constructed by a facet-specific `<facet>CanonicalId(featureId, name)`. The facet segment is dropped from the canonical id because within the downstream system the channel/tool/scheme/storage-key kind is implicit.

Brands are nominal and constructed only by their validated helper; internal code (registry Sets, resolved `…Registration` shapes) carries the brand, genuine external string boundaries cast inline (`id as string`, the `CanvasKey` precedent). No `asString`-style unbrand helpers. The public `@uix/api` modules expose **author shapes only** — `…Contribution` types with a `name` field, no id fields, no brands. Id construction and the resolved `…Registration` shapes live in `src/shared/<facet>-normalization.ts`.

| Facet | `ContributionId` | CanonicalId (brand + form) | Notes |
| --- | --- | --- | --- |
| Channels | `canvas.channel.writeback` | `ChannelCanonicalId` → `canvas.writeback` | transport address |
| Agent tools | `canvas.agent.anchor_read` | `AgentToolCanonicalId` → `canvas__anchor_read` | pi tool name; facet stamps `tool.name` |
| State messages | `canvas.state-message.pane-visibility` | `StateMessageCanonicalId` → `canvas.pane-visibility` | wire tag + persisted-section key; `uix.` prefix dropped |
| Resources | `canvas.resource.doc` | `ResourceCanonicalId` → `canvas-doc` | = scheme (feature-namespaced) |
| Private state | `canvas.state` | `StateCanonicalId` → `canvas` | one per feature, no `name` field; persisted turn-state blob key |

Envelope/customType ids stay substrate-owned (`uix.state`, `uix.turn-state`, the `<uix-state>` envelope); only the inner contribution tags go feature-scoped.

## Units

Implement in order; each is a facet, ends green (tsc + tests), and is committed on its own. Channels is the reference pattern — copy its shape: `…Contribution` (author, `name`-keyed) → `…Registration` (resolved, branded ids) → normalization module produces the resolved form → registry takes the resolved form → `registerFeatureContributions` threads `featureId` through normalization.

### U1 — Channels ✅ done (committed)

`featureChannelId`/`channelCanonicalId` split, `ChannelCanonicalId` brand, `ChannelRegistration` moved to `src/shared/channel-normalization.ts`, api stripped to author shapes, preload/workspace-client cast inline at the IPC boundary. Reference for the rest.

### U2 — Agent tools ✅ done (committed)

`AgentToolContribution`: `id: string` → `name: string`. New `AgentToolCanonicalId` brand + `agentToolCanonicalId(featureId, name)` → `${featureId}__${name}` (pi's double-underscore naming). The facet stamps `tool.name` from the canonical id, so authors stop hand-writing it — the author's `tool` becomes `Omit<ToolDefinition, "name">` (facet-owned name). `registerAgentToolContributions(registry, featureId, contributions)` threads `featureId` + normalizes. Canvas `agent-tools.ts`: `name: "anchor_read"` etc., drop the `name: "canvas__anchor_read"` from each tool def. Wire-visible: pi tool names are now derived, but persisted history/snippets referencing `canvas__anchor_read` still match because the derivation reproduces the same string.

**Placement note:** normalization lives in `src/main/agent/agent-tool-normalization.ts`, not `src/shared/` — unlike channels, the renderer has no agent-tool consumer (no serde path), so there is no functional requirement for it to be renderer-importable. It imports only the genuinely cross-facet `ContributionId` grammar from `#shared`. Resources (U4) will need `#shared` placement because the renderer builds URLs from the derived scheme.

**Author-shape generic:** `AgentToolDefinition<TParams extends TSchema = TSchema> = Omit<ToolDefinition<TParams>, "name">` is generic-with-default. One-off inline tool literals use the bare alias (widened); reusable tool factories narrow it (`AgentToolDefinition<typeof myParams>`) to thread `Static<TParams>` into `execute`/`renderCall`/`prepareArguments` and type-check the `parameters` field against the specific schema — mirrors pi's own `createReadToolDefinition: ToolDefinition<typeof readSchema>`. Canvas's three factories demonstrate the narrowed form; the `params: ReadParams` hand-annotations are gone (inferred from the return type).

Files: `src/main/agent/tools.ts`, new `src/shared/agent-tool-normalization.ts`, `src/features/canvas/backend/contributions/agent-tools.ts`, `src/main/features/contributions.ts` (thread featureId), tests. _(U2 landed with normalization in `src/main/agent/` rather than `src/shared/`; see the U2 placement note above.)_

### U3 — State messages

`BaseContribution.messageType` → `name`. `StateMessageCanonicalId` brand + `stateMessageCanonicalId(featureId, name)` → `${featureId}.${name}`; `contributionId` via the shared helper → `${featureId}.state-message.${name}`. Drop the `uix.` prefix entirely (the `<uix-state>` envelope + `uix.state` customType stay substrate-owned; inner tags go feature-scoped, e.g. `<canvas-pane-visibility>`). `stateTag` keeps dots→dashes (no more `uix.` strip). `nearestPersistedBodies` keys off the derived canonical id — still works. `registerStateMessageContributions(registry, featureId, contributions)` threads `featureId` + normalizes. Canvas `state-messages.ts`: `name: "pane-visibility"`, `name: "canvas-diff"`.

Files: `src/main/agent/state-messages.ts`, new `src/shared/state-message-normalization.ts`, `src/features/canvas/backend/contributions/state-messages.ts`, tests. Update `src/docs/agent.md` (the state-message section currently names `uix.pane-visibility`/`uix.canvas-diff`).

### U4 — Resources

`ResourceContribution`/`ResourceSchemeContribution`: `id`/`scheme` → `name`; scheme derived = `ResourceCanonicalId` = `${featureId}-${name}` (feature-namespaced, kills cross-feature scheme collisions). `registerResourceContributions(registry, featureId, contributions)` + `registerResourceSchemeContributions` (preflight, needs featureId per feature) thread `featureId` + derive scheme. Canvas: `name: "doc"` → scheme `canvas-doc`; the fixed `CanvasProtocolScheme = "uix-canvas"` constant goes away. **Ripple:** the renderer (`Canvas.tsx`) and `shared/addressing.ts` (`canvasUrl`, `canvasKeyToHost`) build URLs from the scheme — they must consume the derived scheme. The canvas feature computes `canvas-doc` from the same `(featureId, name)` so backend + renderer stay in sync; the `resourceCanonicalId` helper must be renderer-importable (`#shared`).

Files: `src/main/resources/registry.ts`, new `src/shared/resource-normalization.ts`, `src/features/canvas/backend/contributions/resources.ts`, `src/features/canvas/shared/addressing.ts`, `src/features/canvas/workspace/Canvas.tsx`, `src/main/features/contributions.ts` (preflight signature), tests. Update `src/docs/` if any resource doc names the scheme.

### U5 — Private state

`StateContribution`: drop `id` entirely (one contribution per feature; it routes its own keys internally). `StateCanonicalId` = `featureId` (the persisted `uix.turn-state` blob key). `ContributionId` = `${featureId}.state` (registry dedup). `registerStateContributions(registry, featureId, contributions)` stamps both ids; `appendPreparedTurnState` keys the blob by the canonical id (= featureId) instead of `contribution.id`. Canvas `state.ts`: drop `id: "canvas"`.

Files: `src/main/state/registry.ts`, `src/features/canvas/backend/contributions/state.ts`, tests.

## After all units

- `src/main/features/contributions.ts`: every `register<Facet>Contributions` call threads `featureId` (channels already does; U2–U5 add it).
- `docs/architecture/concepts.md` Identifier grammar: already updated to the target model (this plan's source of truth). Reconcile any drift once all facets land.
- Run `npm run docs:check`.

## Boundary

This refactor does not relocate the `…Contribution` _types_ into `@uix/api` (several still live in `src/main/...`); it only moves id _construction_ out of the api and into `src/shared/`. Type relocation is a separate, larger move. It does not redesign `WorkspaceClient`'s `request(name: string)` transport boundary (legacy pre-Workspace-iframe; tracked by [workspace-runtime-foundation](./workspace-runtime-foundation.md)).
