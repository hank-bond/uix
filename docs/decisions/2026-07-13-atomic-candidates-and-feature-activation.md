---
summary: "Persisted candidates validate and commit atomically, while feature activation is isolated by feature and rolls back all substrate-owned settings and facet registrations for a failed feature without aborting siblings."
status: accepted
---

# Atomic candidates and feature-scoped activation

Reload crosses two different failure boundaries: persisted configuration becomes live state, then independently authored feature code activates against that state. Treating either boundary as one undifferentiated best-effort loop creates mixed generations that are difficult to observe, explain, or repair.

**Persisted candidates commit atomically.** A disk read, external edit, or batch mutation is a candidate snapshot for its declared transaction boundary. UIX parses, hydrates, and validates the complete candidate before replacing live state. If any part is invalid, none of that candidate is applied: the previous live snapshot remains authoritative and UIX reports validation diagnostics. It does not silently drop, repair, or retain selected fields from the rejected candidate. Where several core workspace namespaces participate in one `/reload`, they stage before one commit so the workspace does not combine old and new configuration.

This rule applies at the owner boundary rather than the physical-file boundary alone: one managed document write is atomic, one settings mutation is atomic, and the workspace configuration read by `/reload` is atomic even though `uix.workspace.json` contains several domains. Collecting all useful validation errors is preferred to failing at the first one, but diagnostics never authorize partial application.

**Feature activation is atomic and isolated per feature.** Once the persisted workspace candidate is accepted, each manifest feature activates as one independent runtime unit. Its hydrated settings scope and every substrate-owned facet registration are provisional until activation succeeds. If loading, context construction, contribution validation, or any registration fails, UIX removes all settings and contributions installed for that feature; no half-feature remains. Sibling features continue activating and the failed feature is reported.

A failed activation during wholesale reload leaves that feature absent; UIX does not restore its previous implementation. Restoring arbitrary old feature code and external effects would be a different hot-swap transaction model. UIX only guarantees rollback for state and registrations it owns. Trusted feature code that performs direct external side effects during activation is responsible for those effects, which is another reason features should work through contributed capabilities and substrate-managed lifetimes.

This sharpens [features are the loadable unit](./2026-07-01-features-are-the-loadable-unit.md): the per-feature bag is a transaction boundary, not merely shutdown cleanup. It also follows [one owner per state](./2026-06-09-one-owner-per-state.md): the owner accepts one validated next value rather than combining live fragments from different candidates.

**Rejected:** best-effort field application, ignoring invalid entries, retaining old values for only the invalid portions of a new candidate, aborting every sibling because one feature's runtime activation failed, and claiming rollback for side effects outside substrate ownership.
