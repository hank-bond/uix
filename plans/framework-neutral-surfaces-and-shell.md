---
summary: "Make frontend frameworks a feature choice rather than a UIX requirement in five post-alpha stages. Settle the minimal DOM/ESM boundary, land and prove neutral surface mounting, and migrate framework ownership into features. Then replace the workspace shell, replace the independent picker, and finish the public contract."
---

# Framework-neutral surfaces and shell

## Status and intent

This is a post-alpha architecture plan. Do not pull it into the alpha critical path unless explicitly reprioritized. Current code will continue to evolve before this starts, so the first unit inventories reality and makes the replacement decision. The rest of the plan records outcomes and dependency order rather than pretending today's file-level implementation is stable.

The goal is framework neutrality, not dependency minimalism. React remains a strong choice for an opinionated app or workspace template. It gives humans and LLMs a constrained, well-trained authoring pattern and access to component systems such as Mantine. UIX should preserve that advantage without making React part of the substrate's definition.

The governing line is: **UIX standardizes what happens between surfaces, not how a surface renders internally.** UIX owns the integration points that need to work cohesively. These are feature loading and reload, surface composition, typed channels, settings, agent sessions, actions, resources, state, lifetimes, delivery, and containment. A feature owns its renderer, reactive model, components, local presentation state, design system, and framework versions.

This plan builds on [features are the loadable unit](../docs/decisions/2026-07-01-features-are-the-loadable-unit.md), [workspace manifest, not discovery](../docs/decisions/2026-07-02-workspace-manifest-not-discovery.md), and the current [runtime surface pipeline](../docs/decisions/2026-07-02-runtime-surface-pipeline.md). It also builds on the [workspace composition thread](../docs/design/workspace-feature-composition.md) and the future [Electron/server split](./electron-server-split.md). Before implementation, N0 must replace the current surface decision's React-specific conclusions without accidentally discarding its still-valid manifest, trust, origin, CSS-lifetime, no-builtin, reload, and failure-isolation conclusions.

Implementation follows the [human-paced loop](../docs/architecture/human-paced-implementation.md). Each unit is a separately reviewable landing. This plan is not permission to implement the whole arc at once.

## Settled direction

These are the decisions this plan may rely on. Details not stated here remain open.

- **The surface ABI is framework-neutral.** A trusted surface is an importable ESM definition mounted into a substrate-provided DOM location. No framework component, node, context, hook, or runtime object crosses the UIX boundary.
- **UIX provides integration and lifetime, not rendering or reactivity.** A mounted surface receives the UIX capabilities it needs and participates in deterministic mount, failure, reload, and cleanup behavior. UIX does not add signals, effects, computed values, dependency tracking, a generic store, a template language, a virtual DOM, or another component model.
- **Framework bridges are user/app/feature code.** A React surface may create a React root, a Svelte surface may mount a Svelte component, and a raw-DOM surface may append nodes. UIX may document small copyable examples but does not commit to maintaining an adapter package for each framework.
- **Framework neutrality is not framework indifference at the product layer.** An app scaffold may explicitly standardize on React/Mantine, provide its own providers/hooks/build setup, and steer LLMs toward that path. Those conventions do not become substrate contracts.
- **Styles and code accompany the surface through web-native delivery.** A surface contribution provides its mountable ESM entry and associated styles/assets in a form the substrate can deliver and clean up. The exact artifact and style representation is not yet decided.
- **Ordinary ESM identity should make sharing possible without requiring it.** Surfaces may use different frameworks or incompatible versions. The build graph should not force compatible dependencies into duplicate runtime instances when their build and URL graph can share them. The exact build and linking mechanism is deferred.
- **The fixed UIX chrome does not justify a frontend framework requirement.** The workspace shell and pre-workspace picker can eventually use direct HTML/CSS/DOM because they have a small, substrate-owned vocabulary. This is not a recommendation that application features avoid frameworks.
- **The picker and workspace-shell migrations are discrete.** The picker exists before workspace composition and can be rewritten independently. The workspace shell follows the neutral mount seam because it currently owns surface composition through React.
- **Mixed-framework workspaces are valid, not necessarily optimal.** A coherent app will usually choose one stack for bundle efficiency, visual consistency, and shared conventions. UIX does not make that choice mandatory.

## Current and target boundary

Today `SurfaceContribution.render()` returns a `ReactNode`: `@uix/api/workspace` exposes capabilities through React contexts/hooks. The surface compiler hardcodes React JSX and a page-shared React instance. And both the workspace page and picker are React roots.

The target is deliberately smaller than a frontend framework API:

```text
UIX workspace shell
        |
import ESM surface definition
        |
provide DOM mount location + UIX capabilities + lifetime + styles
        |
feature-owned rendering implementation
```

An illustrative React bridge is enough to show the division, but it is not a proposed UIX API:

```tsx
mount(uix) {
  const root = createRoot(uix.target);
  root.render(<App uix={uix} />);
  return () => root.unmount();
}
```

The exact call signature, capability shape, cleanup value, and style representation are N0 questions.

## Units

### N0: Inventory and decide the minimal boundary

When we promote this plan after alpha, inventory every place where React currently participates in the public surface API, browser-side state ownership, and surface compilation/delivery. Also inventory shared modules, first-party features, shell layout, picker, tests, scaffolding, and package dependencies. Classify each use as substrate integration, fixed shell presentation, or feature-owned rendering.

Use small executable spikes to decide only the contracts needed by the next units: surface mount/lifetime/failure, style and asset delivery, and the ESM/build boundary. Compare module-sharing approaches against current reload isolation and the future HTTP host rather than choosing one from architectural taste. Distill the result into a replacement decision that explicitly supersedes the React-specific portions of [runtime surface pipeline](../docs/decisions/2026-07-02-runtime-surface-pipeline.md) and restates every surviving invariant.

Outcome: later units can implement one coherent surface from source or build output through import, mount, failure, reload, and cleanup without inventing architecture mid-change.

### N1: Land and prove the neutral mount seam

Replace `render(): ReactNode` with the decided DOM-mount contract. Keep the outer workspace page in React temporarily. It renders a bare mount location and delegates all surface setup and teardown to one framework-neutral mount owner. Preserve current style lifetime, feature-bound capabilities, error isolation, composition order, and reload behavior. Remove the old render path rather than maintaining two public ABIs.

Prove the seam with one minimal raw-DOM surface and one minimal feature-owned React root. Do not migrate Chat and Canvas until those proofs establish that no React value or hidden provider identity crosses the substrate boundary.

Outcome: React and non-React surfaces can run side by side under the current shell with deterministic failure and cleanup behavior.

### N2: Move framework and delivery ownership out of the substrate ABI

Migrate Chat and Canvas to feature-owned React roots and feature/app-owned hooks, providers, and renderer dependencies. Implement the ESM/style/build-delivery decision from N0 so the substrate no longer provides a blessed React instance or hardcodes React as the only surface source format. Preserve the ability for compatible module URLs to share browser evaluation and for incompatible framework versions to coexist without conflation.

You may promote this unit into its own narrower build plan after N0. Do so if compilation, dependency resolution, CSS/assets, and hosted delivery prove too large for one reviewable implementation arc. That promotion is preferable to hiding a second architecture project inside this unit.

Outcome: React is an ordinary implementation dependency of React features. A trivial surface can use raw JS/TS without React. UIX's public surface and delivery contracts do not require knowledge of a frontend framework.

### N3: Replace the workspace shell

Move only the substrate state/lifetime ownership currently hidden in React providers and effect components into explicit framework-independent owners. Reuse existing channel clients, controllers, registries, and binding functions. Then replace the workspace entry, surface panels, loading/error/empty presentation, and resizable layout with direct DOM and CSS.

Do not generalize the shell's fixed rendering needs into a reusable UIX template/component system. The resizable layout is the main implementation risk and must preserve panel identity, persisted ratios, minimum sizes, pointer and keyboard behavior, and accessible separator semantics.

Outcome: the workspace shell contains no frontend-framework dependency while framework-owned feature surfaces continue to mount through the same neutral boundary.

### N4: Replace the independent picker and finish the contract

Rewrite the small pre-workspace picker with direct HTML/CSS/DOM. It remains substrate-owned App-shell UI because no workspace or feature composition exists yet. Do not invent a second app-shell feature system to make it replaceable. This rewrite may land any time after N0 and does not depend on N1–N3.

Once the workspace and picker are both neutral, remove remaining substrate React wiring where the actual package boundaries permit it. Publish concise raw-DOM and React authoring examples and update the architecture and shipped surface docs. Add conformance coverage for coexistence, failure, reload, style cleanup, and dependency identity as decided in N0. Documentation must continue to distinguish the neutral substrate from any opinionated React/Mantine app scaffold.

Outcome: developers can understand, build, and use UIX as a browser substrate without React, while React features and products remain a first-class ordinary composition.

## Questions N0 must answer

The questions are intentionally more exhaustive than the decisions above. They are prompts for future investigation, not implied answers.

### Surface identity and mount shape

- Does `mount` receive one context object, a target plus context, or narrower capability handles?
- Is the mount target always an `HTMLElement`? Or should the contract name a smaller DOM capability that could also cover a shadow-root child or future contained host?
- Does the substrate create and own the target element, and may a feature replace, clear, detach, or attach a shadow root to it?
- Is mount synchronous? If you allow asynchronous mount, what is visible while it resolves and how do you represent cancellation?
- What may mount return: `Disposable`, a cleanup function, either, or nothing?
- Can one surface definition have multiple mounted instances, and which identity distinguishes contribution, module, panel, and mount instance?
- Are surface updates always unmount/remount on substrate reload, or does any definition-level update path exist?
- Which facts belong in the backend `surfaces` facet, which live in the ESM module, and which the host derives?
- How is the imported default export validated without encoding framework assumptions?
- Must a mount target begin empty, and who clears residual DOM after failed or incomplete cleanup?

### Capabilities and state projection

- Which capabilities must every surface receive, and which are optional or feature-bound? Options include typed channel client, raw workspace client, settings, actions, session control, resources, diagnostics, host capabilities, or future agent links.
- Should a surface receive the raw workspace client at all when the substrate can mint narrower clients?
- How does a contractless surface request additional public feature channels without gaining ambient access to host internals?
- Are settings exposed as current `get`/`set`/`onChange` operations, as a feature-bound handle, or through another domain-specific shape?
- Which session and action projections are legitimate substrate capabilities versus conveniences currently exposed because Chat needed them?
- Where a domain has a current immutable projection plus invalidation, should its public shape use `getSnapshot()`/`subscribe()`, callback payloads, an `EventTarget`, or a purpose-specific API?
- How do subscriptions participate in mount cleanup without UIX inventing generic reactivity?
- Which capability objects are stable for the whole mount lifetime, and which may publish replacement snapshots?
- How are capability availability and host differences represented for Electron versus browser/server hosts?
- How do future capability additions avoid turning one mount context into an unbounded service locator?

### Lifetime, reload, and error behavior

- Does the mount receive an `AbortSignal`, return cleanup, or use both? What concrete resources require each mechanism?
- If both exist, does the substrate abort before or after invoking returned cleanup?
- What happens when mount throws synchronously after partially acquiring resources?
- How can a framework report a render error that occurs after `mount` returns?
- Does a reported error replace the surface body, preserve the last good UI, append a diagnostic, or delegate presentation to the feature?
- Who catches React render errors once the substrate no longer provides a React error boundary?
- How are cleanup failures reported without preventing sibling surfaces from disposing?
- What happens to in-flight requests, event callbacks, build processes, and late async completions during feature reload?
- Is cleanup required to be idempotent, and does the substrate protect against duplicate invocation regardless?
- How does Strict Mode or another framework's development behavior interact with a bridge owned by the feature?
- Do globally permanent mechanisms such as `customElements.define()` require documented reload constraints or a supported indirection pattern?
- Which lifetime semantics must be identical between Electron custom-protocol delivery and a hosted browser page?

### Styles, assets, and DOM containment

- Does a surface definition provide `CSSStyleSheet` objects, CSS URLs, output metadata, imported CSS modules, or another standard representation?
- Can one surface provide multiple ordered stylesheets, and is ordering part of its contract?
- Does UIX continue structurally wrapping static styles in `@scope`, and where does that transformation happen for generated CSS?
- How are `@font-face`, `@keyframes`, `@property`, and other document-global names handled?
- How do relative `url()` assets resolve in local custom-protocol and hosted HTTP modes?
- How does the build communicate generated hashed CSS and asset filenames to UIX?
- May a feature use runtime CSS injection or CSS-in-JS, and what cleanup, containment, CSP, and reload obligations then belong to its bridge?
- How do portals and overlays interact with the surface style scope and mount target?
- Does the neutral contract need to anticipate a future shadow surface? Or can that remain a distinct later surface kind without changing trusted light-DOM mounting now?
- Which existing CSP and origin guarantees apply to generated module chunks, CSS, fonts, workers, and assets?
- Can surfaces share styles or assets without making one feature's lifetime remove another feature's resource?

### Framework compilation and build invocation

- Does UIX run feature build commands, consume already-built output, support both, or delegate orchestration to the workspace/app?
- If UIX runs a command, where is it declared: feature definition, surface contribution, workspace manifest, package metadata, or an explicit build artifact manifest?
- Is a build command associated with a feature, one surface, or a workspace containing multiple surfaces?
- Is the command represented as argv without a shell, and how do authors express pipelines or platform-specific commands when needed?
- What working directory, environment, PATH, timeout, cancellation, logging, and process-tree termination semantics apply?
- When does it run: startup, substrate reload, changed-source detection, explicit build action, or some combination?
- How are duplicate commands coalesced when one feature contributes multiple surfaces?
- Does UIX ever run package installation? The current expectation is no, but N0 should verify that build/scaffold workflows remain coherent.
- What is the no-build path for ordinary JS/TS or prebuilt ESM?
- What output must a framework compiler produce? One entry, an ESM graph, a manifest, CSS/assets, source maps, or stable logical names pointing to hashed files?
- Must framework compilation preserve bare package imports, or may it emit shared and private chunks itself?
- How are Svelte/Vue/Solid compiler requirements represented without UIX maintaining framework-specific compiler plugins?
- How does a build failure prevent a stale prior artifact from loading while preserving failure isolation for unrelated features?
- Can feature builds run concurrently, and what resource or output-directory collisions must the build prevent?
- How are development diagnostics mapped from generated output back to editable feature source?
- Is edit → reload → build sufficient, or does any real alpha/post-alpha workflow justify watch mode or HMR?

### Module graphs, caching, and dependency versions

- Does UIX perform a workspace-wide multi-entry final bundle, admit a build-owned content-hashed graph, externalize selected imports through an import map, or combine these approaches?
- What is the smallest mechanism that lets identical resolved ESM URLs evaluate once without becoming a general module-federation system?
- Is the unit of final linking the feature, workspace, browser page, app template, or deployment?
- How does the chosen mechanism preserve current per-surface build and runtime failure isolation?
- If one feature's compilation fails, can unaffected surface entries and their shared chunks remain loadable?
- How does package-manager resolution determine whether two imports are truly compatible and shareable?
- What happens when compatible semver ranges nevertheless resolve to separate physical package copies?
- How are intentionally incompatible React or other framework versions kept paired with the correct renderer bridge and component code?
- Are workspace package-manager overrides sufficient for app-level dependency policy, or does UIX need diagnostics about duplicate large runtimes?
- How does the build name, content-hash, retain, and evict shared chunks across reloads?
- Does changing one surface invalidate only its entry and changed chunks, or rebuild/readdress the whole workspace graph?
- How does browser module caching interact with manual substrate reload, failed reload, and rollback to the previous active feature composition?
- How does the local `uix-resource://` route map onto the future HTTP asset graph without changing feature imports?
- Should UIX measure/report bundle duplication, or is that strictly a build-tool/app concern?

### Public API and framework-owned bridges

- Which current exports in `@uix/api/workspace` are substrate contracts, React conveniences, or accidental mixtures?
- What focused module names make the neutral boundary obvious without introducing a framework-branded adapter package?
- Where do the current React hooks move for Chat and Canvas: feature-local helpers, an app-template library, or direct component props?
- How much bridge code should the React example show before it accidentally becomes a quasi-supported adapter API?
- Should UIX provide helper functions only for non-framework concerns such as disposal or typed subscription cleanup?
- How do examples teach React, Svelte, Lit, or raw DOM consumers to adapt domain subscriptions without implying UIX owns a lowest-common-denominator reactive layer?
- What conformance behavior can the test suite verify against any mount implementation without importing its framework?
- Is one raw-DOM fixture plus first-party React enough, or does the build contract require a second compiled framework fixture to prove a distinct path?

### Workspace shell migration

- Which React providers currently own real substrate state/lifetime and which merely project already-neutral controllers?
- Should ownership move into several purpose-specific controllers/bindings or one workspace-page composition root?
- What is the smallest direct-DOM update convention for the fixed shell that does not grow into an internal rendering framework?
- Can surface catalog changes rebuild the whole small panel list, or must panel identity and mounted feature state survive selective composition changes?
- Which reload paths already imply full remount, and which UI-visible registry changes require keyed reconciliation?
- How are loading, empty, build-failure, import-failure, mount-failure, and post-mount-error states represented without React error boundaries?
- How should the resizable row implement pointer capture, keyboard resizing, minimum sizes, persisted ratios, dynamic panel insertion/removal, RTL, and accessible separator semantics?
- Is a small framework-neutral splitter dependency acceptable, or should the shell own this fixed behavior directly?
- What browser test environment is sufficient for DOM lifetime and accessibility behavior without coupling core tests to a framework?
- Which shell state is renderer-owned cache state and must remain correct when local persistence is absent or cleared?

### Picker and package boundaries

- Should the picker remain one static HTML page with a small ESM script, or does sharing shell styles/transport bootstrap justify a tiny common module?
- How are busy, error, cancellation, and recent-workspace updates expressed without creating reusable state/render helpers?
- Can the picker migrate before N1 without causing throwaway build configuration work?
- At what physical package boundary can React disappear from the substrate install while first-party React feature templates remain in the repository or product distribution?
- How do scaffolded feature `package.json` files declare renderer dependencies, and where does the opinionated app template declare shared conventions such as Mantine?
- Does removing the renderer Vite React plugin wait for both shell pages, or do feature build paths remain independently configured?
- How does this plan sequence with the [Electron/server split](./electron-server-split.md) so neither arc creates temporary package boundaries the other immediately removes?

## Whole-plan acceptance

- A raw-DOM surface and a React-owned surface mount together through one public contract with no React value provided by UIX.
- Surface removal, failure, and reload deterministically release framework roots, subscriptions, actions, styles, and other mount-owned resources without affecting siblings.
- Chat and Canvas retain behavior as ordinary React features whose renderer conventions and dependencies are not substrate APIs.
- The selected ESM delivery model permits shared evaluation by URL where compatible and safe, while keeping incompatible versions separate.
- The workspace shell and picker require no frontend framework and do not introduce a homegrown rendering/reactivity layer.
- Shipped docs explain the neutral contract, a no-framework path, and an opinionated React path without presenting either as the only valid feature implementation.
- The resulting browser boundary remains viable under both Electron and the planned server/HTTP host.

## Not in this plan

- Rewriting an opinionated React application or requiring first-party product features to avoid React.
- Maintaining adapter packages for frontend frameworks.
- Building UIX reactivity, templating, components, routing, or a generic frontend state library.
- Requiring all surfaces to use one framework/version or optimizing mixed-framework composition into the primary app path.
- Redesigning Shadow DOM or iframe containment, hostile-feature sandboxing, or generated executable UI.
- Choosing HTMX or another renderer as the new substrate framework.
- Building the Electron/server package split itself.
