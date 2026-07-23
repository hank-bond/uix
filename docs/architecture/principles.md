---
summary: "Design principles that guide planning and review — the rules we reach for when deciding how to shape a feature or API."
status: active
---

# Design principles

Living list of load-bearing design rules. Add entries as they emerge from threads; cite them in decisions and plans.

## Make the right thing the only thing

When a feature needs to do something and there's only one correct way to do it, the substrate should do it for the feature. Pre-bind, pre-validate, or derive at the boundary rather than handing the feature raw primitives it has to assemble correctly. Every decision and implementation detail a feature author must remember is an opportunity to get it wrong.

## Separate authority, coordination, lifetime, and projection

Give each piece of state one authoritative owner, then keep the mechanisms around it in their proper roles. A current value, registry, buffer, or store owns state; a promise coordinates asynchronous work; a bag or effect owns deterministic cleanup; a map indexes a relationship; and a cache or renderer snapshot is a rebuildable projection. None of those supporting mechanisms becomes a second authority.

When current state can be replaced, commit the replacement at one named generation boundary and make every read resolve through that authority. Async consumers reject stale results rather than letting completion order choose current truth. Derived metadata may follow an externally owned object through a `WeakMap` only when garbage collection is sufficient cleanup; resources and registrations always have explicit lifetimes.

## Validate candidates atomically; isolate loadable units

Treat disk state, external edits, and batch mutations as candidate snapshots: parse, hydrate, and validate the complete transaction before replacing live state. A rejected candidate applies nothing and leaves the previous live snapshot authoritative; report diagnostics rather than silently repairing, dropping, or mixing fields.

After configuration commits, isolate runtime activation at the loadable-unit boundary. One feature's settings and substrate-owned contributions install provisionally as a unit; failure removes all of them while sibling features continue. This does not promise restoration of the feature's previous implementation or rollback of arbitrary side effects outside substrate ownership. See [the decision](../decisions/2026-07-13-atomic-candidates-and-feature-activation.md).

## Materialize defaults; do not layer them

A durable setting's default fills missing state and is then persisted. Runtime reads the materialized value rather than joining sparse overrides with live feature defaults on every access. Existing persisted values always win, and changing a default does not silently rewrite an established workspace. See [the decision](../decisions/2026-07-13-settings-defaults-materialize.md).
