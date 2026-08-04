---
summary: "Give Canvas a reusable local web-asset library in eight reviewable units. These cover feature-static resources, a same-origin asset route, AGENTS.md catalogs, DOM serialization controls, authoring guidance, a component model, serve-time expansion, and conflict-handling updates."
status: active
---

# Canvas reusable assets and transient derived DOM

Let Canvas documents compose reusable JavaScript, web components, CSS, HTML, and other browser assets by stable local path instead of regenerating or embedding those assets in every document. The collection belongs to the Canvas feature: the workspace-owned Canvas feature carries a conventional `public/` tree and serves it read-only on the same isolated origin as its documents.

This keeps Canvas HTML small, saves inference tokens, and makes reusable pieces composable across many Canvas writes. A paired persistence control lets a document distinguish hydrated DOM that is meaningful saved state from derived output that should be recreated from persistent source when the document loads.

This plan builds on the case-1 hydrated-document model in [canvas-data-channel](../docs/design/canvas-data-channel.md). It does not turn assets into a workspace-wide concept or begin the broader application-hosting work discussed for future UIX apps.

## Decisions assumed

- [Canvas stage one](../docs/decisions/2026-05-31-canvas-stage-one.md) — Canvas HTML runs in a script-enabled iframe on a feature-isolated resource origin.
- [Pi self-extension ethos](../docs/decisions/2026-06-05-pi-self-extension-ethos.md) — Canvas stays raw, composable web content rather than gaining hardcoded renderer integrations.
- [Features are the loadable unit](../docs/decisions/2026-07-01-features-are-the-loadable-unit.md) — Canvas owns the collection and its conventions; the substrate supplies only the generic resource-serving capability it needs.
- [No agent-driven UI manipulation](../docs/decisions/2026-05-30-no-agent-ui-manipulation.md) — the agent edits Canvas documents and reusable source files rather than manipulating the live iframe through an agent-side UI API.
- Humans win edit conflicts. A human writeback commits unconditionally; a conflicting agent change is rejected with an actionable diff and the agent redoes its work on the new base. Agent effort is free; humans are expensive.
- The persisted Canvas document is the authored form (references, reflected props, slotted content); the serve layer expands it into the rendered view. The store is the diff surface; the serve layer is the paint surface.

## Build invariants

- The reusable collection is Canvas-owned, not a global workspace asset catalog.
- Assets are ordinary files under the workspace-owned Canvas feature and use stable browser paths under `/assets/`.
- The asset server is static and read-only. It does not become a route framework, package resolver, transform pipeline, or write API.
- Authored and third-party assets use the same serving path while remaining visibly separated in the source tree.
- Canvas writeback persists hydrated DOM by default. Non-persistence is explicit and applied only while serializing a clone.
- Asset discovery is progressively disclosed through `AGENTS.md`; the complete catalog is not injected into every agent turn.
- Saved documents are the authored form — component references, reflected props, and slotted content — never generated internals.
- The serve layer is a pure deterministic function from document to expanded HTML, using the same render path hydration adopts (load never re-renders).
- Every editable control is authored-and-persisted or controlled-and-excluded; human edits land in reflected props, not generated internals.
- Conflicts resolve by policy, not by library: humans win; agent writes are conditional atomic replaces; agent edits are guarded merges.

## S0: Feature-local static resources

Add a small static-directory form to feature resource contributions. A feature identifies a directory relative to its entry, and the substrate serves files from that directory through the feature's resource origin.

The substrate owns the generic concerns of resolving the feature-relative directory, keeping requests inside it, and returning files with browser-appropriate content types. Canvas should not implement its own unrelated static-server machinery inside a programmatic route handler.

This is the only substrate addition in the plan. It is a general way for a feature to expose packaged static files, not a dependency manager or workspace asset system.

Acceptance:

- A feature can expose a feature-local directory through its resource origin.
- Nested browser assets load with appropriate content types.
- Requests cannot escape the declared directory.
- Existing programmatic resource contributions continue to work unchanged.
- The static contribution follows the feature's existing activation and disposal lifetime.

## C1: Canvas public asset collection

Add a conventional `public/` directory to the Canvas feature and expose it through a Canvas-owned `/assets/` route on the same origin as Canvas documents.

Transport feasibility is confirmed: the scheme already serves module scripts in CORS mode (the surface pipeline), the assets route is same-origin to the frame (`uix-resource://canvas.<workspaceId>`), the frame sandbox allows scripts, and canvas responses carry no CSP. The substrate deliberately grants no CORS to feature-origin consumers, so collection assets must remain on the Canvas feature origin — this route is that by construction.

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
- Module scripts from `/assets/` are served with script-appropriate MIME types (`text/javascript`).
- Documents reference collection assets by absolute `/assets/...` paths; relative paths are not supported.
- Static assets are served cacheable with `?v=` content-hash busting while documents stay `no-store`.
- Modules can use normal relative imports within the collection.
- Authored and vendored assets are both addressable by short stable paths.
- The Canvas document stores references to reusable assets rather than copies of their implementations.
- The convention travels with the Canvas feature when that feature is copied into a workspace.

## C2: Progressive asset catalog

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

## C3: Explicit transient DOM serialization

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

## C4: Authoring guidance and end-to-end proof

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
- when to use `none` or `shell` and regenerate from persistent source;
- which persistence model each component uses and where authored content belongs, per the authoring decision tree in C5.

Update the relevant resource and Canvas documentation, then run focused resource, Canvas serving, serialization, catalog, and scaffold tests followed by the repository checks.

Acceptance:

- The example Canvas contains references and persistent source/state rather than copied implementation or disposable generated output.
- Derived output is recreated from the local asset after reload.
- The Canvas authoring guidance makes the source-versus-derived-state choice explicit.
- A newly scaffolded workspace receives the convention through its ordinary copied Canvas feature.
- Shipped documentation clearly separates the generic static-resource capability from the Canvas-owned collection.

## C5: Component authoring model (how to use components)

Components in the collection follow one authoring contract so documents stay thin, diffs stay meaningful, and agents and humans author the same component.

- **Layers.** A component splits into library code (behavior and styles, referenced by documents and propagating to every instance when changed), structure (authored markup in the document), and data (props and attributes). Derived output (rendered diagrams, computed subtrees) is generated from persistent source and never persisted (C3).
- **Golden documents.** The collection carries canonical instance documents in a `templates/` namespace; instantiating copies a golden document and edits its data. Improvements promote from an instance to its golden document (structure) or to the library (behavior and styles) as an explicit agent-mediated gesture. Instance-to-golden drift is visible.
- **Agent authorship.** The agent authors an instance as a reference plus props plus slotted content. Component shape is enforced by the component, so the agent cannot diverge into arbitrary internal markup; new shapes are new files in the collection.
- **Human authorship.** Human edits to interactive controls flow through the component: the control's event updates a reflected prop on the host, and writeback persists the host attribute. Controls rendered from props are excluded from serialization (shadow DOM, or C3 persist markers); authored elements persist directly. A shared controlled-value mixin implements the flow once.
- **Discoverability.** The catalog (C2) documents each component with a summary, use trigger, and accepted shape; a machine-readable component manifest is generated from the same metadata.

### Authoring decision tree

The coding agent applies this tree to every piece of content it authors, so placement is deterministic rather than a matter of taste. Ordering matters: the first two questions remove content from the instance document entirely before the edit-unit question applies; the edit-unit question pins the persistence form before the rendering model is chosen, so light-vs-shadow is mostly determined rather than chosen.

**Q1 — Is it derived** (regenerated from source, not authored — mermaid SVG, diff viewport, computed previews)?

- **Yes → Derived (L0).** Never in the document. Regenerated at serve time or on source change. Mark `persist=none`/`shell` (C3). Shadow viewport or plain element.
- **No** → Q2.

**Q2 — Is it tool-owned** (describes the app/template itself, meant to carry forward to every instance — hover copy, chrome text, empty states)?

- **Yes → Template (L2).** Lives in the golden document or component. Injected at serve time (C6). Not in the instance document — unless overridden for this instance, in which case the override persists and shows in the diff.
- **No** → Q3 (instance content — about the work).

**Q3 — What is the edit unit** (what do humans and agents add, remove, or change)?

- **Value** (one field, one toggle, one config) → **Prop.** Reflected attribute; persists as state. Human edits hoist via a controlled-field mixin when interactive. Diff is an attribute change. → Q4.
- **Element** (a collection that grows or shrinks — comments, rows, items) → **Structure.** Light DOM or slotted content. Persists as markup. Human edits via writeback (free); the agent edits markup directly. Diff is element-level.

**Q4 — (value/prop) where does the value render?**

- Inside a control the component itself draws → shadow + hoisting.
- As a gate over authored or derived content → prop on the host; the gated content is shadow (derived) or light (authored).
- Never edited by a human (pure display/config) → shadow if machinery, light if the design system must reach the internals.

**Display-only components (no editing at all):**

- Enhances authored markup (card, stack) → light.
- Owns machinery or chrome (toolbar, shell) → shadow.
- The design system must style its internals → light (or `::part` on shadow).

**The hybrid** (the norm for app-shell components): shadow chrome + slotted light content (authored, persisted) + controlled props (state):

```html
<review-app files="...">
  <!-- shadow chrome, prop -->
  <review-comment ... />
  <!-- slotted, light, persisted -->
</review-app>
```

**Governance (always applies):** the catalog declares each component's model; a component never switches models; the enforcement check validates declaration equals definition.

Acceptance:

- A document instantiates a component by reference plus props and slotted content, with no copied implementation.
- A human edit to a component control persists as a host attribute, not as the inner element's value.
- Editing the library propagates to existing instances on their next serve; editing an instance does not.
- An instance experiment promotes to its golden document or the library by an explicit gesture, and drift is visible.
- Components remain usable without the framework library (plain custom elements and HTML).

## C6: Serve-time expansion (how to serve)

The serve layer expands a stored document into the complete view before the frame parses it — internals pre-rendered (declarative shadow DOM where components use shadow) — so the browser paints the final view in one pass. This is the Canvas-specific equivalent of server-side rendering, executed at serve time in the same layer that injects the writeback shim.

- Expansion is a pure deterministic function of document content plus the current library, cached by document hash and library version.
- The expanded markup is produced by the same render path the client adopts on hydration, so hydration upgrades behavior without restructuring (no second paint).
- Derived content (C3 `none`/`shell`) is generated at serve time too, so it renders without flash but never persists or diffs.
- In Electron the expansion is local and cheap. A future web mode serves the same expanded document on first load and deltas afterward (C7).

Acceptance:

- The frame receives one complete document per load and paints it without a skeleton-then-content transition.
- Hydration adopts the served shape; served and hydrated DOM match.
- Expansion output is reproducible for identical input and invalidated only by document or library change.
- Documents in the store remain the thin authored form; expansion never persists.

## C7: Versioned updates and conflict handling (how to handle updates)

Every canvas document carries a version; the store is authoritative, and the frame tracks the version it last applied plus a dirty flag for unflushed human edits. All writes declare the base they were made against.

- **Human writeback** is a versioned full-document flush that commits unconditionally (humans win). It carries the base version it serialized from so the ledger stays accurate and the agent can be told when its base moved.
- **Agent edits** are proposed as guarded anchored changes and merged onto current: hunks that apply cleanly land; hunks that collide with human edits are rejected with the human's version and the new base.
- **Agent writes** are conditional atomic replaces: they land only if their base is still current; otherwise they are rejected with the human's diff and the new base, and the agent re-reads and redoes. Writes never merge. Pure rejection is the decided v1 policy — no merge fallback; a guarded-merge upgrade is deferred unless rejections chafe in practice.
- **Frame convergence** applies agent changes in place: flush if dirty, diff from the frame's applied version to the target, send anchored patch operations to the shim, apply, ack. A failed application falls back to a full reload.
- The agent's base comes from its turn-start snapshot rather than a tool-supplied number.
- Retries are limited to one per conflict; repeated conflict surfaces to the human.

Acceptance:

- A human edit never silently disappears, including when an agent write landed in between.
- An agent write against a stale base is rejected with the human's hunks and a new base the agent can redo against.
- An agent edit disjoint from human changes applies onto current without losing either.
- The frame converges to a newer version without a full reload when anchors apply; reload remains the fallback.
- Turn-start snapshots are the source of truth for agent bases.

## Open questions

**Framework choice (deferred — collect information, do not decide yet).** v1 components are plain custom elements plus the C5 conventions; adopting Elena, Lit, hybrid-js, or staying convention-only is a canvas-internal maintenance judgment (the substrate boundary is unaffected, and the persistence contract keeps documents framework-agnostic regardless). Future agent interactions should record, as the compendium grows:

- the first component that genuinely needs reactive re-rendering (the buy-late trigger) — note what it needed;
- where hand-rolled conventions start biting: reflection loops, batching, `attributeChangedCallback` timing, `@scope` quirks, form association — recurring pain is the signal;
- candidate maturity over time: Elena's release/SSR trajectory, hybrid-js, Lit's `@lit-labs/ssr` — re-check when the trigger fires;
- whether a candidate's defaults fight the document-as-artifact model (shadow-first vs. light-leaning);
- whether the candidate keeps serve-time render parity cheap (Node-safe `render()` for the C6 expansion);
- confirmation that artifacts remain protected by the persistence contract, so migration cost stays bounded to component sources.

**Pre-hydration human edits (undecided).** Whether to accept the small loss window before a component hydrates, or have the writeback shim record pre-hydration edits to `data-*` attributes the component adopts on connect. Not formally robust for v1.

**Runtime bridge scope.** Extending the frame's postMessage vocabulary with a typed request/response (`uix:canvas-request`) — the canvas equivalent of channels. What the capability allowlist exposes, whether it reuses channel contracts, and when to build it (live refresh + on-demand backend; likely after S0/C1/C6).

**Fragment refresh mechanism.** An HTMX-style attribute vs. a small shim equivalent, for invalidating derived content (the diff) when source files change. Buy vs. write.

**Serve-time render context scope.** What data sources `ctx` exposes to component `render()` at serve time (doc store, collection files, later channel-like access). Pin before C6.

**Template-override mechanics.** How an instance overrides template-injected content (marker? attribute?) — the C5 tree keeps the escape hatch; the mechanism is undecided.

**`templates/` namespace location.** Where golden documents physically live (inside `public/`? alongside?) and how the agent discovers and instantiates them through the catalog.

**Enforcement check.** The declaration-equals-definition lint (and potential tree-compliance checking): where it runs, what it validates.

**Promotion gesture UX.** How promotion happens concretely — agent proposes → user approves? drift visibility as the trigger?

## Boundary / later

- No workspace-wide asset collection or manifest.
- No import-map registry, package resolver, bundler, automatic downloads, or automatic updates.
- No serving of `node_modules` or arbitrary workspace paths.
- No asset-management UI, file watcher, or HMR.
- No general backend route framework or application-hosting work.
- No built-in Mermaid, charting library, design system, or web-component suite.
- The persistence markers belong to Canvas's document serializer, not to feature surfaces generally.
- No general SSR framework; serve-time expansion is Canvas-serving-specific and deterministic.
- No OT or CRDT machinery; writers serialize per document and conflicts resolve by policy.
- No unbounded agent retry loops; a single in-turn retry, then the conflict surfaces to the human.
