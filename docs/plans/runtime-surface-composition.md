---
summary: "Build spec for runtime surface composition: seam-cut the renderer onto a SurfaceRegistry (S1), esbuild-serve surface modules over the substrate origin with import-map shared deps and CSS module scripts (S2), backend @uix/api value imports (S3), chat/canvas become real manifest features loaded from source (S4), create-new scaffolds template copies with workspace-installed feature deps (S5), resizable row layout (S6)."
status: active
---

# Spec: runtime surface composition

Builds [runtime-surface-pipeline](../decisions/2026-07-02-runtime-surface-pipeline.md). Assumes [workspace-manifest-not-discovery](../decisions/2026-07-02-workspace-manifest-not-discovery.md) (manifest feeds the loader) and [features-are-the-loadable-unit](../decisions/2026-07-01-features-are-the-loadable-unit.md) (definition shape, reload symmetry). Design context: [workspace-feature-composition](../design/workspace-feature-composition.md).

## Progress

S1–S4 landed and verified live: `b054bbb` (S1 seam: surfaces facet + registry, uix channel, contracts carry their owner), `3a55832` (S2 pipeline: esbuild-served modules on the substrate origin, runtime mount), `e256072` (S3: loader alias table for `@uix/api`/typebox value imports), `bc9820a` (S4: chat/canvas load from source, agent contract behind `@uix/api/agent-channels`, `bundled.ts` deleted; plus fixes/cleanups the review surfaced — CORS grants with `corsEnabled` scheme privilege, `@uix/api` made self-contained by moving `resource-routes`/`channel-normalization`/`contribution-id` into `src/api/` and deleting all re-export stubs, canvas's `?raw` vite-ism replaced with `readFileSync(import.meta.url)`).

Remaining: S5, S6. Known S5 wrinkle: canvas's backend imports **parse5**, which resolves by node_modules walk-up inside the repo but not from a scaffolded workspace elsewhere on disk. Resolved (2026-07-02): parse5 does **not** join the blessed alias set. The blessed set is exactly two things — self-reference (`@uix/api`, the substrate's own contract, which must be the live instance) and the contract schema language (typebox) — mirroring pi's loader, which aliases only its own packages plus typebox and lets every other extension dep resolve by ordinary node_modules walk-up. Canvas is the reference feature and gets no special circumstances: its dep is an ordinary feature dep. Feature deps are declared in a per-feature `package.json` (inert to the loader — the manifest still points at entry files, per [workspace-manifest-not-discovery](../decisions/2026-07-02-workspace-manifest-not-discovery.md)); create-new writes a workspace-root `package.json` with `workspaces: ["features/*"]` and runs one `npm install` at scaffold time; npm hoists/nests conflicting versions natively and walk-up resolves per feature. Install is scaffold-time only, never a startup step; after scaffold, dep changes are the agent's/user's `npm install`, with a missing dep failing loudly into `failed[]`. (Correction for the record: `require.resolve("parse5")` works fine — its exports `default` condition satisfies require resolution; only subpaths like `parse5/package.json` are blocked. Moot now that no alias is added.)

## Context snapshot

The backend half of feature loading is manifest-driven, but the frontend is still a build-time import list: `src/renderer/workspace/layout.tsx` imports `chatSurface`/`canvasSurface` statically and `SurfaceMount` mints typed channel clients. A manifest-listed feature can contribute channels and agent tools today but no UI. The pieces the pipeline needs already exist or are verified: `uix-resource://` is registered `standard + secure + supportFetchAPI` (dynamic `import()` works), the route model partitions origins by host (feature-origin content is already frame-only under the page's `default-src 'self'` CSP), and esbuild 0.21 bundles feature-local code while passing `.css` imports through external with attributes and rewritten cache-bust queries (tested). Electron 42's Chromium natively executes import maps, import attributes, and CSS module scripts.

## Units

### S1 — Surface facet + registry-driven composition (seam cut)

`FeatureContributions` gains `surfaces?: readonly string[]` (entry refs resolved against the feature entry's directory). New `SurfaceRegistry` facet registry — per-feature bag, registration order preserved, cleared on reload like every other facet — plus a substrate channel under the reserved `uix` id: a list request (composition order: manifest order, then declaration order) and a `surfacesChanged` event fired after a load pass. Convention alignment in the same unit: `defineSurface` becomes object-arg (`{ name, contract, render, styles? }`), `ChannelContract` gains its owner id (`feature`) so `defineSurface` drops the positional `featureId` and backend registration validates contract owner against the registering feature; surface modules adopt the default-export convention. The renderer replaces the static `layout` array with a registry-driven list; chat/canvas remain a statically imported tail appended renderer-side (temporary, invisible to the registry protocol — no builtin concept). App is pixel-identical after.

Acceptance: registry + channel covered by tests (registration order, per-feature disposal, reload re-registration); typecheck holds across the `defineSurface`/contract signature change; app renders unchanged.

### S2 — Compile/serve pipeline + runtime mount

Substrate-owned resource routes on `uix-resource://uix.<ws>`: bundled surface entry modules (content-hash-busted URLs) and read-only feature-dir file serving for CSS/assets. esbuild bundle-on-demand: feature-local imports in, the blessed shared set (`react`/`react/jsx-runtime`/`react-dom`/`typebox`/`@uix/api/workspace`) mapped to virtual CommonJS modules that read the page-populated shared-instance global — esbuild's CJS interop turns named imports into runtime property reads, which is what makes re-exporting a runtime module object work at all (the import-map-plus-static-shim form from the decision can't statically re-export runtime objects; same guarantee — one React — less machinery, no import map). `.css` stays external with attributes + hash query. CSP `script-src`/`style-src` widen to exactly the substrate origin. CORS: module scripts/CSS module scripts/fonts are always fetched in CORS mode and the page is a _different_ origin (dev server / `file:`), so the routes echo the requester's origin — except `uix-resource://` origins, which get no grant (the decision's "no CORS headers" blanket would have blocked the page itself). Renderer: dynamic-import each listed URL, validate the default export, mount through `SurfaceMount` inside a per-surface error boundary (error card names the feature and entry), adopt/unadopt `styles` sheets on mount/unmount, re-fetch and re-import on `surfacesChanged`.

Acceptance: the dogfood `hello` feature contributes a surface with a CSS module script and it renders; editing the surface source + `/reload` shows the change; a throwing surface module renders an error card while the rest of the workspace stays live; a canvas iframe cannot fetch a surface module (no CORS).

### S3 — Backend runtime-value `@uix/api` imports

jiti alias table in the feature loader mapping `@uix/api` (and `typebox`) to the compiled-in implementation, so feature backend code value-imports the API instead of type-only imports. Dogfood `hello.ts` upgraded to value-import from both halves.

Acceptance: a workspace feature entry that value-imports `@uix/api` and `typebox` activates; loader tests cover the alias.

### S4 — Chat and canvas load through the pipeline from source

Purify both features to user-space imports only — relative paths, blessed bares, `@uix/api`; no `#shared`/`#features`/`#backend` aliases. The known wrinkles this surfaces are the point: the agent channel contract (and the transcript types chat consumes) moves from `#shared/ipc` behind `@uix/api`, and chat's font assets flow through the feature-dir file serving. Chat gains a small feature entry file contributing only its surface; canvas's `FeatureDefinition` gains its `surfaces` entry. The dev workspace manifest lists both by reference into `src/features/`. Then delete: `bundled.ts`, the static renderer tail, and `layout.tsx`'s import list.

Acceptance: bare `npm run dev` boots behaviorally identical with everything runtime-loaded; deleting chat's manifest line removes the chat pane on `/reload`; editing `Chat.tsx` + `/reload` shows the change; `rg` finds no cockpit-internal imports under `src/features/`.

### S5 — Create-new scaffolds the default features

Create-new copies the template feature dirs into the new workspace (e.g. `<ws>/features/chat/`, `<ws>/features/canvas/`) and writes manifest references to the copies. Template source is the repo's `src/features/` in dev; the packaged-binary `resourcesPath` half lands with the packaging arc. Existing dogfood workspaces created with `features: []` don't retroactively gain chat — add the lines by hand, accepted pre-1.0.

Dependency story (see Progress note): the canvas template dir gains a minimal `package.json` declaring `parse5`; scaffold writes a workspace-root `package.json` with `workspaces: ["features/*"]` and runs `npm install` once (npm on PATH is a v1 assumption; an install failure surfaces through the feature-failure path rather than a broken pane). Attendant work in the same unit: reload feedback carries per-feature failure detail (feature name, entry, error message), not just a `featuresFailed` count, so the agent/user can act on a module-not-found; watcher/reload globs ignore `node_modules` under the workspace; the now-dead `exclude: ["parse5"]` in `electron.vite.config.ts` and the stale bundling comment in `canvas/backend/normalize.ts` are deleted; the feature-authoring docs state the convention (deps go in the feature's `package.json`, `npm install` at the workspace root after changing them) so agents install proactively instead of via the error — deferred: no current feature-authoring page exists (`src/docs/extensions.md` predates the manifest arc and still describes retired `.uix/extensions` discovery); the convention lives in `scaffold.ts`'s header until that page is rewritten.

Acceptance: picker → create-new → the fresh workspace opens with working chat/canvas, with parse5 resolved from `<ws>/node_modules` (no parse5 alias in the loader); editing the workspace's copy + `/reload` changes it without touching the repo source; a feature importing a missing dep lands in `failed[]` with a legible module-not-found while the rest of the workspace stays live.

### S6 — Resizable row layout

`react-resizable-panels` horizontal row: surfaces left-to-right in composition order, draggable dividers, ratios persisted to `localStorage` keyed by workspace. Can land any time after S1.

Acceptance: dragging a divider resizes adjacent surfaces; the ratio survives relaunch; adding a surface via manifest + `/reload` slots it in at its composition position.

## Out of scope

- **Iframe surface transport** — returns when foreign/generated surface code exists; everything here is trusted first-party.
- **Layout in the manifest** — order is the manifest's feature order; named slots/grid areas/persisted layout schemas wait for real demand.
- **Feature↔agent link metadata, per-workspace substrate scoping** — separate threads.
- **Packaged-binary template resources** — electron-builder isn't set up; S5 reads templates from the repo path until the packaging arc.
- **Disabling page HMR for a uniform pure-reload dev mode** — noted as attractive once S4 lands; not part of this arc.

## Validation rhythm

Per unit: implement one small chunk, run typecheck/lint/format/docs checks plus targeted tests, stop for review, commit only after explicit approval.
