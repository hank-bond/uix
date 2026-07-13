---
summary: "Audit and reconcile UIX vocabulary repo-wide in four review-gated units: inventory shape/lifecycle terms and drift, settle the canonical glossary, migrate public APIs before subsystem internals, then repair docs and add lightweight coherence checks."
status: active
---

# Repository vocabulary coherence

Review the concepts and naming conventions across code and docs, then migrate inconsistent names without changing behavior. The workspace-action pipeline is the seed: `ActionContribution` (author input) → `ActionRegistration` (normalized registry record) → `RegisteredAction` (live runtime state) → `ActionDescriptor` (public projection), with `ActionContributionUpdater` as the update/dispose capability returned by registration.

The goal is a small semantic vocabulary: names describe the shape and lifecycle stage of a thing, receiver context avoids redundant qualification, and one term does not quietly mean several different things. This is a breaking cleanup—rename integrations to the settled path rather than preserving aliases.

## Review rules

- Inventory before prescribing. Existing frequency is evidence, not authority; distinguish coherent patterns from copied drift.
- Compare shapes and lifecycle roles, not spelling alone. Two similarly named values may deserve different terms; two differently named values may be the same concept.
- Keep operation names contextual: `actionRegistry.invoke()`, while standalone functions retain their domain, such as `normalizeActionContribution()`.
- Preserve external vocabulary from Pi, Electron, React, and browser APIs where UIX is naming the external concept rather than inventing its own.
- If a naming mismatch reveals a real ownership or architecture mismatch, stop that item and route it through design rather than hiding it in a rename.
- Each migration unit remains behavior-neutral and ends green; no opportunistic subsystem redesign.

## V0 — Repository vocabulary inventory

Build a reviewable matrix from `AGENTS.md`, `docs/architecture/{concepts,conventions}.md`, `src/docs/`, `@uix/api`, registries, stores, renderer contexts, and feature code. For each recurring noun and verb, record its intended shape, lifecycle, ownership, representative declarations/call sites, conflicting uses, and proposed disposition.

Cover at least: Feature/extension, Definition, Contribution, Registration/Registered, Descriptor, Registry, Store, Buffer, Client, Provider, capability/Handle, Updater/Appender, Factory, Installer, Driver, Coordinator, Assembler, handler/listener/callback, and the canonical create/define/register/load/hydrate/open/bind/resolve/to/parse/get/read verbs.

Seed findings from workspace actions:

- Function types named `ChannelTransportHandle` and `ResourceTransportHandle` use `Handle` differently from the documented capability-object meaning.
- `AgentToolRegistry.register(contribution: AgentToolRegistration)` and `registeredContributions: AgentToolRegistration[]` call registrations contributions after normalization.
- Registry snapshots vary between public `registeredContributions`, private `#entries` + `list()`, and maps/sets without a documented rule.
- Some facets derive `XRegistration`; agent context and turn state instead retain `RegisteredXContribution`, with no stated criterion for the distinction.
- `docs/architecture/concepts.md` still describes a separate UIX extension/loadable-package concept despite the accepted feature-loading model, and some implementation-path references have drifted.

Acceptance:

- The matrix covers every exported UIX-owned architectural type and all repeated internal suffixes/verbs, not every local variable.
- Each flagged use has concrete call sites and a proposed keep/rename/design-review disposition.
- We review and approve the matrix before changing the canonical docs or code.

## V1 — Canonical glossary and naming rules

Reconcile `docs/architecture/concepts.md` and `conventions.md` into one coherent vocabulary contract. Concepts defines what each architectural noun means; conventions defines how those nouns and operation verbs appear in code. Remove stale feature/extension framing and implementation paths while preserving Pi's own extension vocabulary.

Explicitly settle the contribution pipeline vocabulary: author shape, normalized registry record, live registered state, public projection, and registration-returned capability. Settle whether `Handle` remains at all; how callback, handler, and listener differ; when a consumer-facing object is a Client; and when a registry exposes `list()` versus a named snapshot. Document receiver-context qualification and the rule for justified exceptions.

Acceptance:

- Every inventoried term has one primary definition, a small set of examples, and any exception is explicit.
- Concepts and conventions agree with the root orientation and accepted feature decisions.
- A new facet can name its author shape, normalized record, registry state, public projection, and returned capability without inventing synonyms.
- We review and approve the glossary before code migration.

## V2 — Public API migration

Apply the glossary first to `src/api/` and feature-facing renderer APIs. Update all in-repo features and tests in the same changes; do not add deprecated aliases. Work in small facet-sized commits so each public rename is understandable and independently green.

Prioritize names that teach authors the contribution model: feature definitions/contributions, settings access, channel contracts and handlers, resources, agent facets, surfaces, and workspace actions. Keep import-boundary cleanup scoped to names; packaging changes remain in the existing `@uix/api` boundary backlog unless a rename cannot be expressed honestly without them.

Acceptance:

- Public names follow the approved glossary with no compatibility aliases.
- Feature authors never provide substrate-derived ids or import cockpit internals.
- Shipped docs and in-tree features compile against only the new names.
- Every public migration passes focused tests and the full repository check.

## V3 — Internal subsystem migration and verification

Migrate internal names by coherent subsystem: contribution registries, settings/state ownership, runtime drivers/installers/coordinators, renderer providers/clients, and transport adapters. Prefer exact renames over structural refactors; separately design any item whose current name masks mixed responsibilities.

Finish with a repo-wide vocabulary audit across active docs and code. Add only lightweight automated checks that catch high-confidence regressions—for example retired UIX-extension phrases or explicitly banned type suffixes. Do not encode nuanced semantic judgments as brittle lint rules.

Acceptance:

- Registry parameters, fields, normalized records, and returned capabilities use their lifecycle-stage names consistently.
- No UIX-owned `Handle` use remains unless the glossary explicitly retains that meaning; handler/listener/callback roles follow the settled distinction.
- Active architecture docs describe HEAD, links and implementation paths resolve, and retired vocabulary remains only in historical decisions/plans where preserving history is intentional.
- `rg` audit, docs checks, focused subsystem tests, and `npm run check` pass.

## Boundary

This plan does not change runtime behavior, persistence formats, wire ids, manifest keys, or external Pi/Electron/browser terminology. It does not normalize historical write-once decisions; historical wording remains unless a broken link needs repair. Architectural issues discovered by the audit become separate design threads or plans rather than being smuggled into vocabulary commits.
