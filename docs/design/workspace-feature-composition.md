---
summary: "Exploring surface, layout, and feature-agent composition inside one-workspace runtimes while hosts supervise concurrent workspaces and agent instances preserve a later multi-agent path."
kind: explanation
read_when: "Read before designing surface contributions or layout, feature-agent linking, multi-agent sharing of feature state, reintroducing any Host/iframe boundary, or deciding whether chat/canvas should be treated as substrate."
status: exploring
---

# Workspace, feature, and agent composition

## Current synthesis

UIX implements one single-page workspace per Electron application instance. `uix.workspace.json` explicitly orders feature entry modules; there is no discovery, compiled-in feature inventory, or Host iframe.

A feature is both the loadable boundary and the coherent capability bundle. It can contribute backend facets and trusted React surfaces. Packages remain distribution boundaries rather than another UIX lifecycle.

The workspace page mounts manifest-contributed surface modules in composition order. Surface code shares the page realm through `@uix/api/workspace`; it does not import Electron APIs.

Canvas authored HTML remains inside a feature-owned iframe. UIX has no general iframe surface kind or `postMessage` channel transport. Those primitives should wait for a foreign or generated surface that needs them.

The implemented workspace runtime owns one `WorkspaceAgentRuntime` and one `AgentInstanceSupervisor`. Its first policy provides one guarded primary agent instance per session. Attachments on the same session share that instance, while turns and asynchronous operations hold independent guards. Feature-to-agent links, multiple agents on one session tree, and shared feature state remain design axes. Concurrent workspaces belong to host supervision rather than workspace composition. [`host-workspace-runtime-boundaries.md`](./host-workspace-runtime-boundaries.md) owns that boundary, and [`agent-session-routing.md`](./agent-session-routing.md) owns attachments and agent instances.

The next Agent composition step separates one workspace feature generation from the mutable Agent facets instantiated for each `AgentInstance`. H4 keeps one implicit Agent composition across the workspace. Agent personalities, role selection, and agent-to-agent messaging remain deferred until after host extraction. The instance boundary should permit later workspace-defined compositions to select reusable facets without adding those concepts to the current author or wire contracts.

The current public surface ABI returns a React node, and the compiler supplies a shared React instance. Those are implementation constraints rather than part of the layout or lifetime contract.

The post-alpha target is an ESM definition that mounts into a substrate-provided DOM target with direct typed capabilities and deterministic cleanup. UIX supplies no reactive abstraction or framework-adapter matrix. An app template may still recommend React and Mantine because their constrained pattern, component ecosystem, and model training distribution are product-level strengths rather than substrate requirements. Mixing frameworks remains valid but is not the optimized application path: compatible dependencies may share ordinary ESM chunks, incompatible versions may coexist, and no framework object crosses the surface boundary.

Bare workspace creation scaffolds only editable passthrough Pi tools. Chat, Canvas, and `workspace_tools` form the repository reference application, not workspace defaults.

The next composition pressure comes from ambient surfaces, layout slots, contained surfaces, and eventual feature-to-agent links. New primitives should follow concrete product needs without reintroducing a privileged feature path.

### Retained composition constraints

The manifest-driven runtime surface pipeline is built: a `surfaces` facet carries entry-file references, surface modules load from the reserved substrate origin, and platform CSS module scripts provide reload-scoped styles. App-shipped defaults remain ordinary manifest references rather than built-ins. The post-alpha [`framework-neutral-surfaces-and-shell.md`](../../plans/framework-neutral-surfaces-and-shell.md) plan replaces the React-specific pieces while preserving manifest composition, trust, origin, CSS lifetime, and failure isolation.

The removed Host-to-Workspace iframe was a useful failed experiment. It added a frame and `postMessage` bridge without isolating trusted feature code or improving one-workspace-per-window composition. The surviving rule is transport independence: workspace code uses substrate clients rather than Electron APIs, so another host can replace the transport.

A surface is a layout and lifetime contribution, not an application boundary or single-resource abstraction. One feature may contribute several surfaces, one internally composed surface, or none. The contribution declares availability; workspace layout decides placement, focus, visibility, and size.

Trusted page-realm surfaces and contained iframe surfaces are not interchangeable display modes. A contained surface must account for origin, runtime, style, resource, and message boundaries from the start. The substrate should share logical channel contracts across transports without hiding those containment differences. Framework diversity among trusted surfaces does not itself require an iframe.

Feature-to-Agent links should install only Agent-related facets. Workspace facets such as resources, channels, documents, and surfaces belong to the feature runtime even when no Agent is linked. Per-link state belongs only where behavior genuinely differs by Agent.

Multiple Agents sharing one feature require an explicit concurrency model. Resource-keyed state and optimistic revision checks are a useful start, but the substrate should not promise shared mutation safety before a concrete feature proves the lock or conflict contract.

Link and unlink events may need durable Agent-visible records because they change which tools and context exist. UI-only layout changes do not automatically belong in the transcript. The future link manager must keep those two kinds of change separate.

## Open questions

- What first use case requires a contained iframe surface rather than a feature-owned iframe inside a trusted surface?
- Which fixed shell slots are general enough to expose without hardcoding one application layout?
- What durable record represents adding or removing a feature-to-agent link?
- Which state belongs to a feature runtime, and which state belongs to one future Agent link?
- What locking or optimistic-concurrency contract permits multiple Agents to share one feature?
- Which React-independent surface capabilities and lifetime contract should the post-alpha migration settle?

## Near-term direction

1. Keep the framework-neutral surface migration out of the alpha critical path; promote its review-gated plan explicitly.
2. Keep resources and channels workspace-scoped by default, while instantiating mutable Agent facets for each guarded primary agent instance. Any workspace operation that touches instance state must resolve it from trusted attachment context rather than ambient selection or feature payload fields.
3. Wait for the first foreign, generated, or executable surface before adding general iframe transport.

## Log

### 2026-07-29 — bare workspaces own an ejected Pi tool surface

Settled the agent-tool baseline and the distinction between framework scaffolding and the repository's reference app. UIX-owned Pi sessions start with built-in tools inactive (`noTools: "builtin"`); features assume no ambient coding tools and contribute every capability they need. Create New Workspace copies only editable passthrough `read`, `write`, `edit`, and `bash` definitions under a manifest-listed `pi_tools` feature. This keeps Pi responsible for built-in suppression without duplicating a default-name list, makes the manifest the complete UIX-selected capability surface, and gives authors source they can immediately rename, wrap, or remove. The repository's Chat, Canvas, and reason-bearing `workspace_tools` remain an opinionated reference composition and are no longer copied into bare workspaces. A proposed feature-level global exclusion policy was rejected because negative cross-feature authority and reload rollback state disappear when the runtime starts neutral.

### 2026-07-18 — surface-instance provenance, not ambient active keys

Removed Canvas's hardcoded open/active/agent-changed key sets. They collapsed workspace presentation and document state into one implicitly single-instance list. Document mutations remain keyed by resource id; when multiple instances of a surface exist, interactions that need presentation provenance should carry the originating surface-instance id instead of updating ambient feature state.

### 2026-06-20 — workspace as the app, features linked to agents

During canvas featurification, the old "pane contribution" framing started to look too narrow. The user clarified that UIX's purpose is to provide primitives for building and running agent-powered/agent-authored apps, with no substrate business logic. Chat and canvas are batteries-included bootstrap features, not required core. A user may disable canvas, hide chat, or build a single feature UI that owns its own internal chat/buttons/forms and calls the agent through substrate primitives.

We considered iframe-only panes for isolation, direct React/Lit component panes, and "one app iframe with internal web components". The resulting distinction: installed feature code has a local/npm-like trust model, while agent-authored executable output should still be isolated. Iframe isolation is valuable but should not define the pane/surface abstraction. The real composition unit is the workspace: enabled features plus layout plus one or more agents plus feature-agent linkages. Chat is a feature linked to an agent, not the agent itself.

This also exposed the multi-agent path. If features are linked to agents rather than globally baked into one agent, then multiple agents can share the same feature runtime once locks/concurrency controls exist. The substrate can identify agent-related contribution facets, but per-agent link state will eventually need separate instances. For now UIX remains single-agent, but the design should avoid choices that make multi-agent feature sharing impossible.

### 2026-06-20 — Host/Workspace split and surface containment

Refined the frontend model: Host is the embedding layer and Workspace is the web-compatible app runtime. In Electron, Host is the desktopification layer around a workspace iframe plus backend substrate; in a hosted deployment, Host becomes the page/server embedding layer. Everything nested under Workspace should be designed as browser-compatible app code, not Electron/preload-specific code.

Surfaces live inside Workspace. Shadow surfaces are the normal trusted/reusable feature composition mode, analogous to reusable component packages: they preserve feature boundaries for reuse and lifecycle but are not a security boundary. Iframe surfaces are available when a feature wants stronger containment, separate runtime/dependencies, imported/foreign code, or generated executable UI. The two modes are not naively swappable; the shared goal is API overlap through the workspace/backend bus, not identical implementation.

Durable, agent-relevant, or inter-feature events should route through the backend bus because backend owns state, rehydration, transcript/custom-message effects, and agent context. Ephemeral UI coordination can remain local inside Workspace. Nested iframe surfaces do not get a special second bus: they proxy over `postMessage` to the same logical workspace/backend bus that shadow surfaces call directly from within the Workspace iframe.

### 2026-07-01 — single-page collapse, and features become the loadable unit

Two developments since the last entries. First, the Host/Workspace iframe boundary was tried (W1–W2 of the runtime plan) and deliberately collapsed (`8adeb7d`): the extra frame and postMessage bridge bought nothing while every surface is trusted first-party code, and multi-workspace maps more naturally to multi-BrowserWindow than to in-page frame switching. What survived is the discipline, not the structure — workspace code stays web-compatible behind `WorkspaceClient`/`ChannelTransport`, and the iframe returns as a _surface-level_ containment mode when foreign/generated UI needs it, not as an app-level boundary. Surface contributions, shared channel contracts, and typed event publishers then landed in single-page form (`802e6d1`, `252c7d2`, `828b0c4`); the plan was archived with an outcome note ([workspace-runtime-foundation](../../plans/archive/workspace-runtime-foundation.md)).

Second, reviewing what remained for "chat/canvas as removable features" exposed that the real seam is loading: the May-era extension loader (discovery, jiti entries, per-entry bags, reload) feeds a stub `ExtensionAPI`, while the real contribution system is fed by a hardcoded bundled inventory. Decided to converge them under one word: **feature** is the loadable unit; "extension" is retired uix-side (pi keeps it for its own units); packaging several features for distribution is a future **App** concern, not a second layer now. Entries default-export a plain `FeatureDefinition` — the injected-API factory dies; an async factory form is deferred until something needs activation-time `await`. Bundled features route through the same registration path and the same reload bag as discovered ones, because the expected workflow is the agent self-modifying feature source and the user reloading, like pi — reload symmetry is the boundary test. Distilled into [features-are-the-loadable-unit](../decisions/2026-07-01-features-are-the-loadable-unit.md), built by [feature-loading-convergence](../../plans/archive/feature-loading-convergence.md).

### 2026-07-02 — Apps are directories; defaults scaffold at creation

Packaging discussion resolved where default features live in a prod build. Rejected the intermediate idea of materializing chat/canvas into a central `~/.uix/features/` on first boot — a central copy creates a template-update-policy problem (what happens when a new app version ships changed defaults over a user-edited copy) and doesn't match the workspace model. Instead: a **UIX App is a directory**, chosen by the user, located anywhere. The dir is the workspace composition on disk — feature packages visible in it, pi session + canvas store under its `.uix/`, discovery rooted at it. `resolveWorkspace()`'s `process.cwd()` was always a placeholder for exactly this ("a future project-picker replaces process.cwd() here").

Creating a new App scaffolds the shipped default feature packages (chat, canvas as source, from the binary's resources) into the dir; the user or agent can edit or delete them per App. Stamping at creation kills the update-policy question — new Apps get new templates, existing Apps keep theirs. The defaults double as the worked example for agents authoring features, which is why they must ship as readable source rather than compiled bundle code. Consequence for the loader: once scaffolding lands, `bundled.ts` must be removed rather than kept as a fallback, because a fallback would resurrect a default the user deliberately deleted.

The shell grows a small start modal: create a new App (pick dir, scaffold) or reopen a recent one (recents in Electron `userData`); one BrowserWindow per open App, which the single-page-workspace collapse already set up. Scaffolding chat/canvas stays gated on discovery-fed surface composition and runtime-value `@uix/api` imports; the App-dir/picker/per-app-state half has no such gate and can land first. Captured as two backlog seeds (App dirs + start picker; default features scaffold into new Apps).

### 2026-07-02 — workspaces, not Apps; manifest replaces auto-discovery

Same-day refinement of the entry above. Vocabulary: they're **workspaces**, matching what the code already calls them — "App" is retired. And auto-discovery is out: scanning `.uix/features/` roots was inherited from pi's layout, but a workspace already needs a composition record, so the **workspace manifest file** becomes the single source of truth. The manifest lives in the workspace root; the start modal opens manifests the way VS Code opens `.code-workspace` files (recents are manifest paths). `resolveWorkspace()` derives everything from the opened manifest: stateRoot and the agent's default cwd are the manifest's directory.

What the manifest buys over discovery: **explicit ordering** (the features array is load order — the same forced-by-semantics discipline as the agent-installer composition root), **trivial removal semantics** (delete the line; nothing can resurrect it), and **cross-workspace features for free** (a reference is relative-to-manifest for workspace-local packages or absolute for shared ones — no separate "global features" mechanism needed, deferred until wanted). First boot: no recents → modal → create workspace → scaffold default feature packages into the dir and write a manifest referencing them; the compiled-in bundled path is never loaded directly once this lands.

Consequences for the just-landed loader: the per-entry activation machinery (validation, per-feature bags, error isolation, single-flight, jiti) survives unchanged; `discovery.ts`/`roots.ts` root-scanning retires in favor of manifest resolution. The discovery portions of [features-are-the-loadable-unit](../decisions/2026-07-01-features-are-the-loadable-unit.md) get superseded by a new decision when this distills into a plan.

### 2026-07-02 — refs go straight to the file; App names the Electron shell

Two confirmations closing the manifest design. Manifest feature references point **directly at entry files**, not package dirs — the `package.json` layer only earned its place under discovery (the scanner needed a marker); with explicit references, a trivial feature is one `.ts` file plus one manifest line, the cheapest authoring loop for an agent. Folder references (dir → read its `package.json`) remain the compatible upgrade when something needs pi fields, multi-entry, or per-feature deps — pi's own bare-file → folder → package spectrum. And "App" lands as the name for the running Electron application itself — the shell showing the picker and hosting windows — completing the three-level vocabulary: App opens workspaces, workspaces compose features. Distilled into [workspace-manifest-not-discovery](../decisions/2026-07-02-workspace-manifest-not-discovery.md); build spec at [workspace-manifest-and-picker](../../plans/archive/workspace-manifest-and-picker.md).

### 2026-07-02 — runtime surface pipeline: platform modules, substrate origin, no builtin anywhere

Designed the frontend half of manifest-driven features — how a manifest-listed feature's surface reaches the workspace page. The shape that survived discussion: a `surfaces` facet on `FeatureDefinition` carrying only entry-file refs (identity stays in the frontend module, which default-exports its `defineSurface` result the way feature entries default-export their `FeatureDefinition`); esbuild-bundled ES modules served over the existing `uix-resource://` protocol on the reserved substrate origin; an import map sharing the page's live `react`/`typebox`/`@uix/api` instances (which is also the answer to runtime-value `@uix/api` imports — the backend twin is a jiti alias); and per-surface error boundaries as the frontend twin of the loader's `failed[]`.

Three discussion outcomes worth recording. **Isolation:** no second protocol — origin is scheme+host and the host partition already exists; the page's CSP (today `default-src 'self'`, feature-origin content frame-only) widens `script-src`/`style-src` to exactly the substrate origin, and surface routes refuse CORS to `uix-resource://` origins so iframe content can't fetch the modules (implementation correction: a blanket no-CORS posture would block the _page_ too — module scripts are always CORS-mode and the page is a different origin, so the routes echo non-`uix-resource` origins). Surface code runs in the page realm on the same manifest-opt-in trust the backend loader already extends; shadow DOM was never a security boundary. **CSS:** went with the newer platform standard — CSS module scripts (`with { type: "css" }`, natively executed by Chromium; esbuild passes the import through, verified) with sheets adopted/unadopted by the mount — over bundler-era sibling-css/link-injection or style-inject helpers, per the rule that we use the newest _standard_ but never invent. **No builtin concept:** the user's cut — an app-shipped default is just a manifest reference to the app's copy (repo source in dev, copied templates at create-new in prod), so the transitional compiled-in map dies before it's born, `bundled.ts` deletes at the end of the arc, and scaffolding folds into this arc instead of gating behind it. Guiding convention throughout: every fact stated in exactly one place and checked loudly at binding sites, because feature authors are agents — this also moved the channel owner id onto `ChannelContract` itself, dropping `defineSurface`'s positional `featureId`. Layout v1 grew one requirement: a manifest-ordered resizable row (`react-resizable-panels`, ratios in `localStorage`). Distilled into [runtime-surface-pipeline](../decisions/2026-07-02-runtime-surface-pipeline.md); build spec at [runtime-surface-composition](../../plans/archive/runtime-surface-composition.md).

Implementation finding from S2: the decision's import-map-plus-shim form for shared instances doesn't survive contact with ES module semantics — a static shim module cannot re-export a runtime object's names (`export` bindings are static; the export list would have to be hardcoded per dependency and chased across upgrades). The working mechanism keeps the decision's guarantee (one React, one typebox, one `@uix/api`, blessed set stated once) with less machinery: the pipeline maps blessed bare specifiers to virtual CommonJS modules reading a page-populated global, and esbuild's CJS interop turns named imports into runtime property reads. No import map, no shim route, no hardcoded origin in `index.html` beyond the CSP line. Recorded in the plan's S2 unit; the decision's outcome paragraphs stand.

### 2026-07-12 — feature system-prompt sections and skills compose into the linked agent

Canvas authoring exposed two different forms of Agent guidance that did not belong in tool metadata. Short feature semantics that must always be known use `agentSystemPrompt`: one static Markdown section per feature, assembled in manifest order with generated agent-context vocabulary after feature activation and snapshotted once per Pi runtime start/reload. Larger task-specific guidance is `agentSkills`: feature-relative skill paths forwarded through Pi's native `resources_discover` lifecycle, leaving Pi responsible for validation, compact system-prompt cataloging, and on-demand `SKILL.md` loading. Tool descriptions stay mechanical; changing turn data stays in `agentContext`.

Rejected putting the whole authoring guide in the system prompt (permanent context cost), relying only on a skill (models do not always load matching skills, so essential interaction contracts become unreliable), attaching conceptual guidance to `canvas__anchor_write` (couples what to author to one editing mechanism), and mutating `.pi/settings.json` or copying into `.pi/skills` (creates a second composition authority beside the workspace manifest). One internal system-prompt assembler is the sole Pi-facing hook for stable UIX sections; one skill installer is the sole feature→Pi resource-discovery bridge.

### 2026-07-26 — UIX owns frontend integration, not the frontend framework

Revisited React's role after the runtime surface pipeline made it both the implementation and the public renderer ABI. React remains a strong choice for an opinionated vibe-coding app: it gives nontechnical users a constrained pattern they do not have to steer, models have unusually broad training distribution over its successful conventions, and component systems such as Mantine make one-shot task interfaces practical. Those are reasons for an app template to choose React, not reasons for every UIX surface to require it.

The target boundary is an ESM `SurfaceDefinition` that receives an ordinary DOM mount target, direct typed UIX capabilities, static styles, an abort signal, error reporting, and deterministic cleanup. A framework bridge is feature/app source: React creates a root, Svelte mounts a component, Lit renders a template, and raw DOM appends nodes. UIX documents examples but owns no framework adapter matrix and, crucially, no generic reactivity, signals, effects, template language, or component model. The fixed picker and workspace chrome can use direct DOM because their vocabulary is small; that is not an authoring recommendation for evolving apps.

Feature sharing does not imply one self-contained framework runtime per surface. A feature owns compilation into ESM, while the workspace owns final dependency resolution/delivery: compatible resolved imports may become shared content-hashed chunks evaluated once by the browser, and incompatible framework versions remain separate. Mixing frameworks in one workspace is valid but may be inefficient and visually incoherent; an opinionated app remains free to enforce one stack. The implementation is deliberately deferred until after alpha and captured in [framework-neutral surfaces and shell](../../plans/framework-neutral-surfaces-and-shell.md).

### 2026-07-26 — planning clarification: outcome before mechanism

Reviewing the deferred plan separated the conclusions actually reached from mechanisms proposed during the discussion. The settled outcome is a framework-neutral DOM/ESM surface boundary, user-owned framework bridges, no UIX reactivity, eventual direct-DOM shell chrome, and the ability for ordinary ESM URL identity to share compatible code without requiring one framework. We did not yet decide that UIX runs build commands, that a feature compiler preserves bare imports, that the workspace performs one multi-entry esbuild pass, that styles are exposed specifically as `CSSStyleSheet[]`, that every surface receives the same capability object, or that renderer ownership collapses into one `WorkspaceRuntime`. Those are post-alpha investigation questions, not architecture hidden in the plan.

### 2026-08-09: concurrent workspaces move above workspace composition

Separated concurrent workspace orchestration from workspace feature composition. Each `WorkspaceRuntime` owns exactly one manifest-selected feature composition and one agent-mount manager. A host-level workspace supervisor coalesces runtime boots and chooses whether workspace endpoints share a process or use isolated processes. This keeps duplicate feature and channel ids valid across runtimes and makes each runtime bag the complete workspace teardown boundary.

Replaced the selected-session singleton as the target model with one primary agent mount per session. This first policy supports shared multi-device views while preserving distinct session, mount, and future feature-agent-link identities. Multi-agent branch coordination remains open rather than being implied by concurrent workspace support.

### 2026-08-15: instance facets precede Agent personalities

Separated the immediate state-isolation requirement from the later product model for named Agent personalities or roles. H4.3 keeps one implicit workspace Agent composition but makes the workspace feature generation produce reusable Agent-facet definitions or factories. Each `AgentInstance` owns the mutable facet instances selected from that generation. This prevents two live sessions from sharing turn state, context buffers, stateful tools, or Canvas working projections while leaving a stable seam for later workspace-defined Agent compositions.

The one-visible-target client does not remove this requirement. Attachment retarget can leave the old turn running under an independent guard while the user starts work in another session. Instance-local feature state must therefore be correct before the client displays several agents concurrently.
