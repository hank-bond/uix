---
summary: "Build workspace actions and the replaceable default command palette in seven reviewable units: action normalization, renderer registration, durable keybindings and conflicts, keyboard/Electron dispatch, ambient surfaces, the palette feature, and customization/docs verification."
status: active
---

# Workspace actions and default command palette

Build the action layer settled in [workspace-actions](../design/workspace-actions.md): features register renderer workflows in nested trees; the workspace resolves ids and durable keybindings; replaceable features can display and invoke the serializable catalog. Backend effects continue through typed channels. The first default browser is a Ray/VS Code-style command palette shipped as an ordinary ambient feature surface.

## Decisions assumed

- [Pilot substrate](../decisions/2026-05-30-uix-is-a-pilot-substrate.md) and [Pi self-extension ethos](../decisions/2026-06-05-pi-self-extension-ethos.md) — actions help the human operate the workspace, while the opinionated palette remains replaceable feature UI.
- [Features are the loadable unit](../decisions/2026-07-01-features-are-the-loadable-unit.md) and [runtime surface pipeline](../decisions/2026-07-02-runtime-surface-pipeline.md) — action callbacks arrive through manifest-composed surfaces and use the shared `@uix/api/workspace` runtime.
- [One owner per state](../decisions/2026-06-09-one-owner-per-state.md) — callbacks/catalog are renderer runtime state; bindings are main-durable workspace settings; conflicts are derived.
- [Workspace manifest, not discovery](../decisions/2026-07-02-workspace-manifest-not-discovery.md) — materialized bindings remain inspectable and agent-editable in `uix.workspace.json`.

## Build invariants

- Canonical `${featureId}.${localActionId}` identity is independent from display-tree placement.
- Public descriptors are serializable; callbacks stay private to their registration.
- Palette, menu, surface, recursive, and keyboard invocation share `invokeAction(id)`.
- Backend work uses typed channel requests; there is no backend action-handler facet.
- Conflicted shortcuts execute nothing, while their actions remain invokable by id.
- Existing persisted bindings beat contributed defaults; stale ids are retained harmlessly.
- Removing the default palette does not disable the registry or direct keybindings.

## A0 — Action definitions and pure normalization

Define the renderer-facing types and pure normalization before adding React or persistence.

The authored form is an ordered nested tree of titled groups and action leaves. A leaf has a feature-local id, title, optional description/keywords/default binding, current enabled state, and async-capable callback. Normalization receives the feature owner separately, validates ids and uniqueness across the whole tree, and produces an ordered tree plus searchable leaf projection with canonical ids and title paths.

Keep executable and public shapes explicit: only the internal registration retains `run`; `ActionDescriptor` must survive JSON serialization. Settle the minimal invocation result/error shape, same-action re-entry behavior, and teardown cancellation contract here.

Acceptance:

- Moving a leaf between groups changes its path but not canonical id.
- Duplicate local ids fail loudly.
- Descriptor projection contains no function or React value.
- Ordering is deterministic and normalization has focused tests.

## A1 — Renderer registry and surface registration

Add one workspace-scoped registry and expose registration, catalog subscription, and invocation through `@uix/api/workspace` context/hooks.

`SurfaceMount` binds the owning feature id; feature code cannot claim another owner. React effect lifetime unregisters callbacks on unmount/reload. Invocation checks current enabled/running state, executes the private callback, and reports errors without affecting sibling registrations. Recursive invocation uses the same path.

Use Chat as the first proof: register actions from the component owning model controls to open the existing picker in Favorites and All Models scopes. The callbacks close over the existing typed agent client and React state—no backend round trip or duplicate store.

Acceptance:

- A surface can register, update, invoke, and unregister a tree.
- Consumers see descriptors and invoke ids, never callbacks.
- Duplicate canonical ids across registrations fail with owner attribution.
- Chat actions open the requested picker scope and preserve existing focus behavior.
- Unmount/reload leaves no stale callback or in-flight state owner.

## A2 — Durable bindings and conflict projection

Add a substrate-owned `keybindings` workspace namespace containing `bindings: Record<ActionId, Shortcut | null>`. Define a TypeBox shortcut schema and one platform-neutral normalized grammar; v1 supports one modified-key chord unless A0 proves another first consumer needs more.

Add a narrow substrate channel to read bindings, reconcile active defaults, set/unbind/reset a binding, and publish changes. The renderer batches active defaults after registration settles; main fills only missing values through `WorkspaceManifestStore`. Existing values—including `null`—always win, and removed ids are not deleted.

The renderer registry joins active descriptors with persisted values and computes normalized conflicts once. Catalog leaves include resolved binding and `conflictsWith`; conflicts are never persisted. Keyboard dispatch must remain inactive until initial hydration completes.

Acceptance:

- Missing contributed defaults materialize in `settings.keybindings.bindings`.
- Existing values survive reload and later default changes.
- Removing/reinstalling a feature preserves prior choices.
- Conflicting actions are marked but remain invokable by id.
- Set/unbind/reset validates at the channel boundary, persists, and updates the catalog.

## A3 — Keyboard dispatcher and Electron ownership

Install one workspace-page dispatcher over the hydrated registry. A gesture resolves to an action id and invokes through the registry with a keyboard source; no keybinding stores a callback.

Specify and test logical-key normalization, `mod`, editable targets, composition, repeat, disabled/running actions, modal event handling, and `preventDefault`. Conflicts fail closed: no callback runs and the catalog/diagnostic identifies every claimant. Keybinding-triggered callback failures enter an observable action diagnostic path because there is no invoking feature UI to receive the rejection.

Register `uix.reload` through the same renderer registry. Remove or redirect Electron's native Reload accelerator so Cmd/Ctrl+R reaches this action and calls the existing typed reload operation. Keep App/OS commands such as quit in Electron and preserve a separate development hard-refresh escape hatch. Do not use Electron `globalShortcut`.

Acceptance:

- Keyboard, surface, and recursive invocation share one callback path.
- Cmd/Ctrl+R performs substrate reload rather than Chromium page reload.
- Conflicted, unbound, disabled, repeated, or composing gestures follow documented behavior.
- The dispatcher exists only for the focused workspace renderer lifetime.

## A4 — Ambient surfaces

Extend `defineSurface` with presentation `panel | ambient`, defaulting to `panel`.

Ambient surfaces use the existing module pipeline, typed channel binding, feature settings provider, scoped/adopted styles, error isolation, and reload lifetime, but receive no panel/header or resizable-layout allocation. Mount them under a real `[data-uix-surface]` root so descendant native dialogs retain scoped styles in Chromium's top layer.

A workspace with only ambient surfaces still renders a sensible base/empty workspace while mounting those surfaces and accepting their actions. Do not add panel show/hide/focus or surface instances in this unit.

Acceptance:

- An ambient test surface mounts and registers actions without consuming panel space.
- Its native modal appears above panels with scoped styles and correct focus/dismissal behavior.
- Ambient failures remain diagnosable without replacing a visible panel.
- Reload/removal closes the modal and unregisters its actions.

## A5 — Default command-palette feature

Add a normal manifest-composed feature whose ambient surface renders the default palette. It registers `palette.open` with a default binding, subscribes to the public catalog, and invokes selected ids without privileged callback/channel access.

Search flattens leaves over title, canonical id, keywords, and group titles while displaying paths such as `Chat > Models > Favorite Models`. Results show resolved shortcuts and disabled/running/conflict state. Opening focuses search; keyboard navigation, Enter, light dismiss/Escape, reduced motion, and focus restoration are included. Close the palette before invoking so the chosen action can immediately open another native dialog.

Ranking, styling, and any recents are palette-owned. Recents, if included, are renderer-local presentation cache rather than registry or manifest state.

Acceptance:

- Removing the feature removes only the palette and its opening action.
- A replacement test feature can render and invoke the catalog through public APIs.
- Search works by title, path, and id.
- Chat model actions work from the palette.
- Non-invokable results explain why they are disabled or conflicted.

## A6 — Customization, documentation, and verification

Prove both binding-edit paths. A renderer feature uses the narrow API to set/unbind/reset a binding and sees dispatcher/catalog state update immediately. An external or agent edit to `settings.keybindings.bindings` takes effect through substrate reload. Do not commit the substrate to a full binding-editor UI in this unit; decide during review whether that belongs in the default palette or a separate feature.

Update shipped docs for action trees, callback/channel composition, ambient surfaces, bindings, conflicts, and customization. Update architecture-of-record and add worked examples for one local-UI action and one backend-only channel action. Run focused registry, settings, keyboard, ambient-surface, and palette tests followed by the full repository check.

Archive the plan only when new workspace scaffolding includes the palette through an ordinary manifest reference and there is no compiled-in palette fallback.

## Boundary / later

- New-conversation session replacement is separate agent-runtime work. Once its typed request/event exists, a normal renderer action can wrap it and optionally collect a name.
- No backend action-handler facet, agent invocation of actions, or automatic Pi slash-command import.
- No process-global shortcuts, native OS menu, key sequences, multiple bindings, or context-expression language in v1.
- No general panel visibility, surface instances, or multi-copy surfaces. Those wait for a concrete sidebar/tree or multi-agent design.
- The default palette need not own keybinding editing; any feature can build it over the narrow API.
