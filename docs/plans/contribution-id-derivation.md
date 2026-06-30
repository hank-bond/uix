---
summary: "Derive contribution/canonical ids from featureId + name across all facets so authors give only a local name; one uniform ContributionId brand (`${featureId}.<facet>.<name>`) plus one per-facet canonical-id brand (facet segment dropped), the api exposes author shapes only. Units: channels (done), agent tools (done), state messages (done), resources (done), private state (done)."
status: archived
---

# Spec: contribution id derivation

Feature authors used to hand-write the full dotted id for every contribution (`id: "canvas.anchor_read"`, `messageType: "uix.pane-visibility"`, `scheme: "uix-canvas"`, …), and in some facets hand-coordinate a _second_ downstream id by hand too (the pi tool name `canvas__anchor_read` alongside the contribution id). That asks the author to know and keep in sync several substrate naming conventions. This refactor moves all id derivation into the facets: the author gives a local `name`, the facet derives both the registry dedup id and the downstream-system address.

The model is established in the channels facet (committed) and applied uniformly to the remaining four. The identifier grammar lives in [`../architecture/concepts.md`](../architecture/concepts.md) (Identifier grammar); this plan is the build spec for landing it across the facets.

## Target model

Every facet: author gives `name` (+ payload/handler). The facet derives two ids.

- **`ContributionId`** — registry dedup key. One uniform brand, shared across facets, constructed by `toContributionId(featureId, facet, name)` → `${featureId}.<facet>.<name>`. Lives in `src/shared/contribution-id.ts`.
- **`…CanonicalId`** — the downstream-system address. One brand per facet (each has its own format), constructed by a facet-specific `<facet>CanonicalId(featureId, name)`. The facet segment is dropped from the canonical id because within the downstream system the channel/tool/scheme/storage-key kind is implicit.

Brands are nominal and constructed only by their validated helper; internal code (registry Sets, resolved `…Registration` shapes) carries the brand, genuine external string boundaries cast inline (`id as string`, the `CanvasKey` precedent). No `asString`-style unbrand helpers. The public `@uix/api` modules expose **author shapes only** — `…Contribution` types with a `name` field, no id fields, no brands. Id construction lives with its consumer: main-only facets keep canonical-id helpers in `src/main/`; cross-facet helpers (resources) go in `#shared`. The `ContributionId` grammar itself stays in `#shared` since every facet uses it.

| Facet | `ContributionId` | CanonicalId (brand + form) | Notes |
| --- | --- | --- | --- |
| Channels | `canvas.channel.writeback` | `ChannelCanonicalId` → `canvas.writeback` | transport address |
| Agent tools | `canvas.agent.anchor_read` | `AgentToolCanonicalId` → `canvas__anchor_read` | pi tool name; facet stamps `tool.name` |
| State messages | `canvas.state-message.pane-visibility` | `StateMessageCanonicalId` → `canvas.pane-visibility` | wire tag + persisted-section key; `uix.` prefix dropped |
| Resources | `canvas.resource.doc` | `ResourceCanonicalId` → `canvas-doc` | resource type key (feature-namespaced; transport scheme is substrate-owned) |
| Private state | `canvas.state` | `StateCanonicalId` → `canvas` | one per feature, no `name` field; persisted turn-state blob key |

Envelope/customType ids stay substrate-owned (`uix.state`, `uix.turn-state`, the `<uix-state>` envelope); only the inner contribution tags go feature-scoped.

## Units

Implement in order; each is a facet, ends green (tsc + tests), and is committed on its own. Channels is the reference pattern for the author shape (`name`-keyed) and the `ContributionId`/canonical-id split. U3–U5 simplify two things: (a) no separate normalization module — id derivation lives alongside the registry; (b) registry classes are exported directly — no opaque interface wrappers, no public `register()` on the facade, just `register<Facet>Contributions(registry, featureId, contributions)` as the sole registration path. `registerFeatureContributions` threads `featureId` through to each facet's bulk helper.

### U1 — Channels ✅ done (committed)

`featureChannelId`/`channelCanonicalId` split, `ChannelCanonicalId` brand, `ChannelRegistration` moved to `src/shared/channel-normalization.ts`, api stripped to author shapes, preload/workspace-client cast inline at the IPC boundary. Reference for the rest.

### U2 — Agent tools ✅ done (committed)

`AgentToolContribution`: `id: string` → `name: string`. New `AgentToolCanonicalId` brand + `agentToolCanonicalId(featureId, name)` → `${featureId}__${name}` (pi's double-underscore naming). The facet stamps `tool.name` from the canonical id, so authors stop hand-writing it — the author's `tool` becomes `Omit<ToolDefinition, "name">` (facet-owned name). `registerAgentToolContributions(registry, featureId, contributions)` threads `featureId` + normalizes. Canvas `agent-tools.ts`: `name: "anchor_read"` etc., drop the `name: "canvas__anchor_read"` from each tool def. Wire-visible: pi tool names are now derived, but persisted history/snippets referencing `canvas__anchor_read` still match because the derivation reproduces the same string.

**Placement note:** normalization lives in `src/main/agent/agent-tool-normalization.ts`, not `src/shared/` — unlike channels, the renderer has no agent-tool consumer (no serde path), so there is no functional requirement for it to be renderer-importable. It imports only the genuinely cross-facet `ContributionId` grammar from `#shared`. **This is the pattern for main-only facets going forward:** only facets with a renderer consumer (resources, because the renderer builds resource URLs) need `#shared` placement for their canonical-id/helpers.

**Author-shape generic:** `AgentToolDefinition<TParams extends TSchema = TSchema> = Omit<ToolDefinition<TParams>, "name">` is generic-with-default. One-off inline tool literals use the bare alias (widened); reusable tool factories narrow it (`AgentToolDefinition<typeof myParams>`) to thread `Static<TParams>` into `execute`/`renderCall`/`prepareArguments` and type-check the `parameters` field against the specific schema — mirrors pi's own `createReadToolDefinition: ToolDefinition<typeof readSchema>`. Canvas's three factories demonstrate the narrowed form; the `params: ReadParams` hand-annotations are gone (inferred from the return type).

Files: `src/main/agent/tools.ts`, new `src/main/agent/agent-tool-normalization.ts`, `src/features/canvas/backend/contributions/agent-tools.ts`, `src/main/features/contributions.ts` (thread featureId), tests. _(U2 landed with normalization in `src/main/agent/` rather than `src/shared/`; see the placement note above.)_

**Pattern notes (post-U2 simplifications):** Two things U3–U5 will do differently: (1) no separate normalization module — id derivation lives in the same file as the registry and is called from the bulk `register<Facet>Contributions` helper; and (2) the `*Registry` types become opaque branded tokens — no public `register()` method at all. Features provide `Contributions[]`, the bulk helper derives ids and registers internally, and the registry is just a token accepted by the bulk helper and the installer/assembler. U1 and the shared `ContributionId` grammar remain as-is; U2 is already committed.

### U3 — State messages ✅ done (committed)

`BaseContribution.messageType` → `name`. `StateMessageCanonicalId` brand + `stateMessageCanonicalId(featureId, name)` → `${featureId}.${name}`; `contributionId` via the shared helper → `${featureId}.state-message.${name}`. These helpers live in `src/main/agent/state-messages.ts` (main-only, same placement rationale as U2). Drop the `uix.` prefix entirely (the `<uix-state>` envelope + `uix.state` customType stay substrate-owned; inner tags go feature-scoped, e.g. `<canvas-pane-visibility>`). `stateTag` keeps dots→dashes (no more `uix.` strip). `nearestPersistedBodies` keys off the derived canonical id — still works.

**Registration:** no separate normalization module. `registerStateMessageContributions(stateMessages, featureId, contributions)` is the sole registration path — it derives both ids internally, registers into the store, applies initial values, returns a `Disposable` bag. The `StateMessageRegistry` class is exported directly (no opaque interface wrapper); features go through the bulk helper. `contributionId` function renamed to `toContributionId` to avoid variable shadowing; the shared `assertIdToken` regex widened to allow hyphens in facet/name segments.

Canvas `state-messages.ts`: `name: "pane-visibility"`, `name: "canvas-diff"`.

### U4 — Resources ✅ done

`ResourceContribution`: `id` → `name`; resource type derived = `ResourceCanonicalId` = `${featureId}-${name}` (feature-namespaced, kills cross-feature resource collisions). `registerResourceContributions(registry, featureId, contributions)` threads `featureId` + derives the resource type. Canvas: `name: "doc"` → resource type `canvas-doc`; the older feature-owned canvas protocol constants go away. **Superseded runtime detail:** resource routes now use one substrate protocol scheme (`uix-resource`) with workspace/feature origin encoded in the host; `ResourceCanonicalId` is no longer the URL scheme. See [resource-routes](./resource-routes.md). **Registry:** exported class, same pattern as U3.

Files: `src/main/resources/registry.ts`, new `src/shared/resource-canonical-id.ts` (just the brand + constructor, not a full normalization module), `src/features/canvas/backend/contributions/resources.ts`, `src/features/canvas/shared/addressing.ts`, `src/features/canvas/workspace/Canvas.tsx`, `src/main/features/contributions.ts` (preflight signature), tests. Update `src/docs/` if any resource doc names the scheme.

### U5 — Private state ✅ done

`StateContribution`: drop `id` entirely (one contribution per feature; it routes its own keys internally). `StateCanonicalId` = `featureId` (the persisted `uix.turn-state` blob key). `ContributionId` = `${featureId}.state` (registry dedup). `registerStateContributions(registry, featureId, contributions)` stamps both ids; `appendPreparedTurnState` keys the blob by the canonical id (= featureId) instead of `contribution.id`. Canvas `state.ts`: drop `id: "canvas"`. Main-only facet — brands and derivation live in `src/main/state/registry.ts`. **Registry:** exported class, no opaque wrapper — `StateRegistry` drops public `register()`, same pattern as U3.

Files: `src/main/state/registry.ts`, `src/features/canvas/backend/contributions/state.ts`, tests.

## After all units

- `src/main/features/contributions.ts`: every `register<Facet>Contributions` call threads `featureId` (channels already does; U2–U5 add it).
- `docs/architecture/concepts.md` Identifier grammar: already updated to the target model (this plan's source of truth). Reconcile any drift once all facets land. ✅ done — fixed `contributionId` → `toContributionId` helper name and the id-construction placement sentence (channels/resources in `#shared`; agent tools/state messages/private state in `src/main/`).
- Run `npm run docs:check`.
- **Future cleanup:** once U1/U2 are retrofitted to the class-directly-exported pattern (no interface wrappers), the `create*Registry` factory functions become trivial `new X()` passthroughs and can be dropped in favor of direct construction. `ChannelRegistry` is the only one that still captures closure state (the IPC `handle`/`publish` functions); those become constructor params.
- **Drop the `ContributionId` dedup guard (decided):** every registry has both a `ContributionId` dedup guard and a `…CanonicalId` dedup guard. Within a facet, `name → contributionId` and `name → canonicalId` are both injective (every canonical constructor is plain `${featureId}<sep>${name}` with a token regex that forbids dots; the only normalization — `stateTag` dots→dashes in state messages — runs at wire-tag emission time, not during id derivation). So within a facet the two guards are equivalent: neither catches anything the other doesn't. Across facets the contributionId guard cannot fire either, because the facet segment is embedded in the id (`canvas.channel.writeback` vs `canvas.agent.writeback`) — a single cross-facet `Set<ContributionId>` behaves identically to five per-facet Sets. The `ContributionId` guard is therefore dead weight in all five facets and is removed. The `…CanonicalId` guard is irreducibly per-facet (each canonical id is a different brand/format/downstream namespace: IPC channel, pi tool name, persisted-section key, resource type, blob key) and stays where it is. User-visible effect: the "same name twice" error now surfaces as the canonical message (`State message already registered: canvas.foo`) rather than the contributionId message; accepted. Hoisting the contributionId guard into `registerFeatureContributions` (the original framing of this bullet) was rejected — it would have moved the redundant guard, not the load-bearing one, and broken direct callers (canvas tests) for no behavioral gain.

## Boundary

This refactor does not relocate the `…Contribution` _types_ into `@uix/api` (several still live in `src/main/...`); it only moves id _construction_ out of author hands and into the substrate. Canonical-id helpers live with their consumer (main-only facets keep them in `src/main/`; cross-facet helpers like resources go in `#shared`). The `ContributionId` grammar remains the one genuinely cross-facet piece in `#shared`. Type relocation is a separate, larger move. It does not redesign `WorkspaceClient`'s `request(name: string)` transport boundary (legacy pre-Workspace-iframe; tracked by [workspace-runtime-foundation](./workspace-runtime-foundation.md)).
