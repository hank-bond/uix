---
summary: "Design principles guide planning and review when shaping UIX features, state ownership, rollback, defaults, and public APIs."
kind: reference
---

# Design principles

Living list of load-bearing design rules. Add entries as they emerge from threads. Cite them in decisions and plans.

## Require a current use

Build only what a production path needs. A known future requirement may influence a choice between equally simple designs, but it does not justify more code. Add an abstraction, validation layer, diagnostic record, failure policy, or public contract only with its first production use.

Prefer functions, closures, collections, and lifetime bags until repeated use identifies a smaller shared primitive. A spike may test an external assumption, but an alternate implementation does not become production code. Do not record a distinction unless a current caller can observe it or act on it.

## Keep one checked implementation

Every review unit compiles, passes all checks, and leaves one supported production path. Do not plan a failing interval, compatibility path, temporary abstraction, or production module that a later unit replaces.

Migrate a breaking contract with all current callers when they cannot form smaller units that pass the checks. Prefer an explicit limited product policy over a general implementation without a current use.

## Make the right thing the only thing

When a feature needs to do something and there's only one correct way to do it, the substrate should do it for the feature. Pre-bind, pre-validate, or derive at the boundary rather than handing the feature raw primitives it has to assemble correctly. Every decision and implementation detail a feature author must remember is an opportunity to get it wrong.

## Separate authority, coordination, lifetime, and projection

Give each state value one authoritative owner, then keep supporting mechanisms in their proper roles.

A current value, registry, buffer, or store owns state. A promise coordinates asynchronous work. A bag or effect owns deterministic cleanup.

A map indexes a relationship, while a cache or renderer snapshot is a rebuildable projection. None becomes a second authority.

When current state can be replaced, commit the replacement at one named generation boundary. Make every read resolve through that authority.

Asynchronous consumers reject stale results instead of letting completion order choose current truth. Derived metadata may use a `WeakMap` when garbage collection provides sufficient cleanup. Resources and cleanup capabilities always have explicit lifetimes.

## Validate candidates atomically, isolate loadable units

Treat disk state, external edits, and batch mutations as candidate snapshots: parse, hydrate, and validate the complete transaction before replacing live state. A rejected candidate applies nothing and leaves the previous live snapshot authoritative. Expose diagnostics rather than silently repairing, dropping, or mixing fields.

After configuration commits, isolate runtime activation at the loadable-unit boundary. One feature's settings and substrate-owned contributions install provisionally as a unit. Failure removes all of them while sibling features continue. This does not promise restoration of the feature's previous implementation or rollback of arbitrary side effects outside substrate ownership. See [`2026-07-13-atomic-candidates-and-feature-activation.md`](../decisions/2026-07-13-atomic-candidates-and-feature-activation.md).

## State rollback stops at the authority boundary

Queries observe state, mutations intend to change a declared authority, and effects cross beyond the state UIX can coordinate and restore. A mutation gains rollback behavior only from its authority's actual checkpoint integration. Never imply that restoring local state or running compensation reverses an external effect. See [`rollback-boundaries.md`](../design/rollback-boundaries.md).

## Materialize defaults, do not layer them

A durable setting's default fills missing state and is then persisted. Runtime reads the materialized value rather than joining sparse overrides with live feature defaults on every access. Existing persisted values always win, and changing a default does not silently rewrite an established workspace. See [`2026-07-13-settings-defaults-materialize.md`](../decisions/2026-07-13-settings-defaults-materialize.md).
