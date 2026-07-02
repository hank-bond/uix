---
summary: "Landed spec that converged the old extension loader and the feature contribution system into one feature-loading path: the contribution contract moved behind @uix/api (F1), the loader merged into features/ with FeatureDefinition entries and ExtensionAPI deleted (F2a/F2b), and bundled + discovered features now share one lifetime under featuresBag with /reload re-running the whole composition (F3)."
status: landed
---

# Spec: feature loading convergence (landed)

Shipped as `e0e1280` (F1: contract behind `@uix/api`), `300125a` (F2a: canvas stops importing cockpit internals — anchors moved into the feature, `FeatureContext.log`, shim sweep), `833b475` (F2b: one loader, `FeatureDefinition` entries, `ExtensionAPI` deleted, `uix.features`/`.uix/features/` renames), and the F3 commit (bundled features activate through the load pass under `featuresBag`; reload re-runs the whole composition, with bundled failures error-isolated like discovered ones). One acceptance note: bundled feature _source_ changes still require the dev rebuild (they're compiled into the app bundle); reload re-runs their registration with fresh context/bags — the edit-and-reload loop applies to discovered features, which is where the agent self-modifies.

Builds [features-are-the-loadable-unit](../../decisions/2026-07-01-features-are-the-loadable-unit.md). Assumes [manual-reload-extensionsbag](../../decisions/2026-05-31-manual-reload-extensionsbag.md) (reload bag mechanics) and [extension-activation-and-isolation](../../decisions/2026-05-30-extension-activation-and-isolation.md) (activation/error-isolation mechanics, carried forward). Design context: [workspace-feature-composition](../../design/workspace-feature-composition.md).

## Context snapshot

Two parallel systems exist. The extension side (`src/main/extensions/`): `discovery.ts` (side-effect-free package scan of `.uix/extensions` roots for `pi`/`uix` package.json fields), `loader.ts` (jiti-loaded TS entries, per-entry `DisposableBag`, error isolation, single-flight reload into `extensionsBag`), and `context.ts` (an `ExtensionAPI` whose only method is a stubbed `registerCommand`). The feature side (`src/main/features/`): `FeatureDefinition` (`id`, optional `context` hook, `contribute(ctx)` returning five facet contributions), `registerFeatureContributions` with per-facet lifetime bagging, and `bundled.ts` — a hardcoded inventory registered from `main/index.ts` into `appBag`, not `extensionsBag`.

The convergence: discovery/loader machinery survives; `ExtensionAPI` dies; a discovered entry default-exports a plain `FeatureDefinition` that flows through the exact path bundled features use; everything lands under the reload bag. Reload symmetry is required because the expected workflow is the agent self-modifying feature source and the user reloading, like pi.

Two facts that keep the job small: preflight is currently feature-independent (`registerFeaturePreflightContributions` ignores its feature list and registers the one substrate `uix-resource://` scheme), so discovered features need no pre-`app.whenReady` loading; and the API boundary is already half-moved (`@uix/api/channels`, `@uix/api/resources`, `@uix/api/workspace` exist — only `FeatureDefinition`/`FeatureContext` and the agent-facet contribution types still live in main internals).

## Units

### F1 — Move the contribution contract behind `@uix/api`

Type moves only, no behavior change. `FeatureDefinition`, `FeatureContributions`, `FeatureContext`, and the agent-tool/turn-state/agent-context contribution types move to `@uix/api` (a `feature` module plus filling out per-facet modules). Add a type-only `DocumentStoreFactory` interface that `src/main/documents/store` implements. Invert the imports: main-process registries import their contribution types _from_ `@uix/api`; `features/contributions.ts` stops importing types out of registries. Bundled features (canvas) switch their `#backend/features/contributions` import to `@uix/api` — the forcing function proving the contract is external-ready.

Acceptance: no `src/main/**` import inside `@uix/api` modules except type-only imports that the API itself defines; canvas's backend contributions compile against `@uix/api` alone; all checks green.

### F2 — One loader, one directory, FeatureDefinition entries

Merge `src/main/extensions/` into `src/main/features/` (`discovery.ts`, `roots.ts`, `loader.ts`, `bundled.ts`, `contributions.ts`). The loader keeps jiti, per-entry bags, sequential activation, error isolation, and single-flight load, but instead of invoking `factory(api)` it takes the entry's default-exported `FeatureDefinition` (validate the shape: `id` string, `contribute` function; a bad export lands in `failed[]` like a throw) and runs it through the same registration path `main/index.ts` runs bundled features through: build `FeatureContext`, run `context?.()`, `registerFeatureContributions(...)` into the per-feature bag. Delete `extensions/context.ts` and `src/shared/extension-types.ts` (`ExtensionAPI`, `ExtensionFactory`, command types); update `@uix/api`'s index. Rename the manifest key `uix.extensions` → `uix.features` and the discovery roots `.uix/extensions/` → `.uix/features/` (including the dogfood dir and the broken-extension canary).

Also close the remaining features-import-internals debt enumerated during F1 review: move `src/main/anchors/` into `src/features/canvas/backend/` (anchors are canvas-private by intent — deliberately not generalized into substrate), and give `FeatureContext` a feature-scoped logger so feature code stops importing `#backend/log`. Sweep the transitional type re-export shims left in the main registries once call sites import from `@uix/api`.

Acceptance: a dogfood `.uix/features/<name>/` package whose entry exports a `FeatureDefinition` gets its contributions registered and torn down on reload; the canary still exercises error isolation; nothing imports `ExtensionAPI`; canvas backend imports nothing from `#backend/*`.

### F3 — One lifetime: bundled features under the reload bag

Bundled features stop registering from `main/index.ts` into `appBag`; the load pass registers bundled + discovered alike into per-feature bags under the reload bag (rename `extensionsBag` → `featuresBag`). `/reload` clears the bag and re-runs the whole composition, then delegates to `driver.reload()` as today. Before switching, verify each facet registry tolerates dispose-then-re-register against a live agent session: channel dispose re-`ipc.handle` for the same canonical id, agent tools/turn state/agent context re-registering between turns, resource route re-registration. Any registry that chokes gets fixed here — falling back to bundled-in-`appBag` asymmetry is explicitly not the outcome, since reload symmetry is the decision's point.

Acceptance: edit a bundled feature source or a `.uix/features/` entry, `/reload`, and the new contribution graph is live without restarting Electron; prompt→response and canvas writeback still work after reload mid-session.

## Out of scope

- **Discovery-fed surface composition** — the renderer's `layout.tsx` stays a build-time import list; the runtime surface registry and the iframe surface transport for foreign/generated surface code are their own thread (backlog seed).
- **Async feature factories** — deferred until a feature needs activation-time `await`; non-breaking to add.
- **Preflight for discovered features** — today's preflight is feature-independent; revisit when a feature needs its own scheme/route class before `app.whenReady`.
- **Commands** — if they return, they return as a `FeatureContributions` facet.

## Validation rhythm

Per unit: implement one small chunk, run typecheck/lint/format/docs checks plus targeted tests, stop for review, commit only after explicit approval.
