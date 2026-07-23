---
summary: "Give Canvas a reusable local web-asset library in five reviewable units: feature-static resources, a same-origin public asset route, progressively disclosed AGENTS.md catalogs, transient DOM serialization controls, and authoring guidance."
status: active
---

# Canvas reusable assets and transient derived DOM

Let Canvas documents compose reusable JavaScript, web components, CSS, HTML, and other browser assets by stable local path instead of regenerating or embedding those assets in every document. The collection belongs to the Canvas feature: the workspace-owned Canvas feature carries a conventional `public/` tree and serves it read-only on the same isolated origin as its documents.

This keeps Canvas HTML small, saves inference tokens, and makes reusable pieces composable across many Canvas writes. A paired persistence control lets a document distinguish hydrated DOM that is meaningful saved state from derived output that should be recreated from persistent source when the document loads.

This plan builds on the case-1 hydrated-document model in [canvas-data-channel](../design/canvas-data-channel.md). It does not turn assets into a workspace-wide concept or begin the broader application-hosting work discussed for future UIX apps.

## Decisions assumed

- [Canvas stage one](../decisions/2026-05-31-canvas-stage-one.md) — Canvas HTML runs in a script-enabled iframe on a feature-isolated resource origin.
- [Pi self-extension ethos](../decisions/2026-06-05-pi-self-extension-ethos.md) — Canvas stays raw, composable web content rather than gaining hardcoded renderer integrations.
- [Features are the loadable unit](../decisions/2026-07-01-features-are-the-loadable-unit.md) — Canvas owns the collection and its conventions; the substrate supplies only the generic resource-serving capability it needs.
- [No agent-driven UI manipulation](../decisions/2026-05-30-no-agent-ui-manipulation.md) — the agent edits Canvas documents and reusable source files rather than manipulating the live iframe through an agent-side UI API.

## Build invariants

- The reusable collection is Canvas-owned, not a global workspace asset catalog.
- Assets are ordinary files under the workspace-owned Canvas feature and use stable browser paths under `/assets/`.
- The asset server is static and read-only. It does not become a route framework, package resolver, transform pipeline, or write API.
- Authored and third-party assets use the same serving path while remaining visibly separated in the source tree.
- Canvas writeback persists hydrated DOM by default. Non-persistence is explicit and applied only while serializing a clone.
- Asset discovery is progressively disclosed through `AGENTS.md`; the complete catalog is not injected into every agent turn.

## S0 — Feature-local static resources

Add a small static-directory form to feature resource contributions. A feature identifies a directory relative to its entry, and the substrate serves files from that directory through the feature's resource origin.

The substrate owns the generic concerns of resolving the feature-relative directory, keeping requests inside it, and returning files with browser-appropriate content types. Canvas should not implement its own unrelated static-server machinery inside a programmatic route handler.

This is the only substrate addition in the plan. It is a general way for a feature to expose packaged static files, not a dependency manager or workspace asset system.

Acceptance:

- A feature can expose a feature-local directory through its resource origin.
- Nested browser assets load with appropriate content types.
- Requests cannot escape the declared directory.
- Existing programmatic resource contributions continue to work unchanged.
- The static contribution follows the feature's existing activation and disposal lifetime.

## C1 — Canvas public asset collection

Add a conventional `public/` directory to the Canvas feature and expose it through a Canvas-owned `/assets/` route on the same origin as Canvas documents.

The initial organization is intentionally ordinary:

```text
features/canvas/public/
  components/   reusable web components
  scripts/      workspace-authored modules and helpers
  styles/       reusable CSS
  vendor/       copied third-party browser assets
```

Canvas documents reference files with normal browser markup:

```html
<link rel="stylesheet" href="/assets/styles/dashboard.css" />
<script type="module" src="/assets/components/chart-card.mjs"></script>
```

User-created scripts live alongside the Canvas feature and can be edited directly. An npm, GitHub, or other remote source is copied into `vendor/` as a local browser asset; its source, version or commit, and license are recorded beside it. Nothing is fetched or updated automatically at runtime.

The collection is not limited to JavaScript. CSS, HTML fragments, images, fonts, WASM, and other static browser resources can use the same route when needed.

Acceptance:

- A Canvas document can load a local module and stylesheet from `/assets/`.
- Modules can use normal relative imports within the collection.
- Authored and vendored assets are both addressable by short stable paths.
- The Canvas document stores references to reusable assets rather than copies of their implementations.
- The convention travels with the Canvas feature when that feature is copied into a workspace.

## C2 — Progressive asset catalog

Give each catalog directory an `AGENTS.md` that follows the repository documentation graph's overview-plus-index pattern.

Each directory describes itself with a summary and use trigger. Its parent index uses that compact description as the entry for the directory. Direct asset files are annotated manually with:

- a summary of what the asset provides;
- `use_when` guidance describing when it should be selected;
- a short usage note when the path alone is insufficient.

The index builder rolls child-directory summaries into their parent `AGENTS.md` while preserving authored prose and file annotations. A check mode keeps generated indexes current and catches missing catalog metadata or broken paths.

The Canvas authoring skill points only to the root catalog. The agent starts there, descends through relevant summaries, and reads an implementation only when it needs to use or modify that asset.

Acceptance:

- `public/AGENTS.md` provides a compact entry into the collection.
- Every child directory contributes its summary and use trigger to its parent index.
- Reusable files have manually authored summary and `use_when` metadata at their owning directory.
- Index generation is deterministic and preserves prose outside its generated region.
- The catalog can grow without adding its full contents to the Canvas system prompt or authoring skill.

## C3 — Explicit transient DOM serialization

Extend the Canvas writeback serializer with two explicit persistence policies:

```html
<div data-uix-persist="none"></div>
<div data-uix-persist="shell"></div>
```

The default remains today's hydrated serialization.

- `none` omits the marked element from the serialized document.
- `shell` keeps the marked mount element but omits its generated children.

The filtering happens on the serialized clone and never mutates the live document. This lets a Canvas keep persistent renderer source or user state in the document while recreating derived output from a local asset after load. When generated output is itself the state that should survive, the author leaves it unmarked and it persists normally.

Acceptance:

- Unmarked Canvas documents retain their current persistence behavior.
- `none` omits a marked element from writeback.
- `shell` preserves the mount element while omitting generated descendants.
- The live DOM is unchanged by serialization.
- Script-triggered `window.__uixWriteback()` uses the same persistence behavior as ordinary Canvas writeback.

## C4 — Authoring guidance and end-to-end proof

Add a small end-to-end example that combines:

- persistent source or state in a Canvas document;
- a reusable local module and stylesheet;
- derived output mounted in a `shell` region;
- regeneration after the document reloads.

The example proves the composition model without choosing Mermaid or another renderer as a built-in Canvas dependency.

Update the Canvas authoring skill to explain:

- how to traverse the asset catalog;
- where authored and vendored assets belong;
- how to reference reusable modules, web components, styles, and fragments;
- when generated DOM should persist;
- when to use `none` or `shell` and regenerate from persistent source.

Update the relevant resource and Canvas documentation, then run focused resource, Canvas serving, serialization, catalog, and scaffold tests followed by the repository checks.

Acceptance:

- The example Canvas contains references and persistent source/state rather than copied implementation or disposable generated output.
- Derived output is recreated from the local asset after reload.
- The Canvas authoring guidance makes the source-versus-derived-state choice explicit.
- A newly scaffolded workspace receives the convention through its ordinary copied Canvas feature.
- Shipped documentation clearly separates the generic static-resource capability from the Canvas-owned collection.

## Boundary / later

- No workspace-wide asset collection or manifest.
- No import-map registry, package resolver, bundler, automatic downloads, or automatic updates.
- No serving of `node_modules` or arbitrary workspace paths.
- No asset-management UI, file watcher, or HMR.
- No general backend route framework or application-hosting work.
- No built-in Mermaid, charting library, design system, or web-component suite.
- The persistence markers belong to Canvas's document serializer, not to feature surfaces generally.
