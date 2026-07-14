---
summary: "Settings defaults initialize missing durable values by materializing them into the workspace; runtime reads the persisted result instead of layering sparse overrides over live defaults."
status: accepted
---

# Settings defaults materialize; they are not an override layer

A sparse-override model makes effective configuration a permanent join between persisted fragments and whatever defaults the currently loaded feature version contributes. The same workspace file can then mean different things under different code versions, every read must apply precedence, and humans or agents inspecting the manifest cannot see the effective value.

**Decision.** A declared default fills missing durable settings during hydration or domain reconciliation and is written into the workspace. Runtime consumers read the resulting persisted value; they never compute `persistedOverride ?? contributedDefault` as an active configuration layer.

Existing persisted values always win, including `null` when the schema permits it. A later feature version may materialize newly introduced missing values, but changing the default for an already-materialized value does not rewrite an existing workspace. Changing established workspace behavior therefore requires an explicit edit, reset, or migration.

Defaults are initialization metadata, not another state owner. This follows [one owner per state](./2026-06-09-one-owner-per-state.md): after materialization, the durable workspace value is the only source of truth.

**Consequences.** Manifests are more verbose, but they are inspectable, agent-editable snapshots rather than sparse override programs. Feature upgrades do not silently move existing workspaces, and every client resolves the same durable value.

**Rejected:** sparse overrides resolved against live defaults on every read, retaining default provenance beside every materialized value, and silently rewriting existing values when contributed defaults change.

The evolving schema, hydration, reset, and editor mechanics live in [workspace settings](../design/workspace-settings.md).
