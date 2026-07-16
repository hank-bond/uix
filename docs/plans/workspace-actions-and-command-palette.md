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
- [Atomic candidates and feature activation](../decisions/2026-07-13-atomic-candidates-and-feature-activation.md) — workspace settings reload commits one validated candidate, while a failed feature leaves none of its settings or facet registrations behind and does not abort siblings.
- [Settings defaults materialize](../decisions/2026-07-13-settings-defaults-materialize.md) — action defaults seed missing durable bindings and then disappear from runtime resolution; the workspace map is the one source of truth.

## Build invariants

- Authors supply nested local-name keys, never ids; the facet derives canonical `${featureId}.${keyPath}` identity, while display titles do not participate.
- Public descriptors are serializable; callbacks stay private to their registration.
- Palette, menu, surface, recursive, and keyboard invocation share `invokeAction(id)`.
- Actions are frontend effectors: every callback executes in the renderer, and backend work composes through typed channel requests rather than a backend action-handler facet.
- Main owns the complete durable binding map; the renderer owns default declarations, client-platform interpretation, referential diagnostics, conflicts, and invocation.
- Conflicted shortcuts execute nothing, while their actions remain invokable by id.
- Existing materialized bindings beat contributed defaults; stale ids are retained harmlessly.
- Removing the default palette does not disable the registry or direct keybindings.

## A0 — Action definitions and pure normalization

Define the renderer-facing types and pure normalization before adding React or persistence.

The authored form is an ordered nested keyed object of titled groups and action leaves. Keys are local names; a leaf has a title, optional description/default binding, current enabled state, and async-capable callback. The feature-scoped registration boundary supplies the owner, so authors never provide ids. Normalization validates every key and derives canonical ids from the feature plus complete key path, then emits a flat searchable descriptor list in depth-first authored order. Display-title paths retain grouping without exposing public group nodes.

Keep executable and public shapes explicit: only the internal registration retains `run` and contributed defaults; `ActionDescriptor` must survive JSON serialization. Invocation callbacks return `void | Promise<void>` and callback failures reject to the invoking UI. Each action id has one non-queued in-flight slot; a duplicate invocation returns `already_running`.

Acceptance:

- Canonical ids derive only from the feature owner and keyed path; changing a title does not change identity.
- Moving a leaf to another keyed path intentionally changes identity.
- Descriptor projection is flat and contains no function, React value, or group node.
- Ordering is deterministic and normalization has focused tests.

## A1 — Renderer registry and surface registration

Add one workspace-scoped registry and expose registration, catalog subscription, and invocation through `@uix/api/workspace` context/hooks.

`SurfaceMount` binds the owning feature id; feature code cannot claim another owner. React effect lifetime unregisters callbacks on unmount/reload. Invocation checks current enabled/running state, executes the private callback, and reports errors without affecting sibling registrations. Recursive invocation uses the same path.

Use Chat as the first proof: register actions from the component owning model controls to open the existing picker in Favorites and All Models scopes. The callbacks close over the existing typed agent client and React state—no backend round trip or duplicate store.

Acceptance:

- A surface can register, update, invoke, and unregister a keyed action contribution.
- Consumers see descriptors and invoke ids, never callbacks.
- Duplicate canonical ids across registrations fail with owner attribution.
- Chat actions open the requested picker scope and preserve existing focus behavior.
- Unmount/reload removes callback availability and safely observes any pending completion without claiming to cancel feature-owned work.

## A2 — Durable bindings and conflict projection

### Settled design and motivation

- **One settings concept.** Every feature and workspace settings scope declares one TypeBox schema for its complete object plus optional whole-object defaults; named scopes use `Type.Object` and dynamic scopes use `Type.Record` through the same hydration, validation, persistence, and subscription path. This avoids teaching authors, the future settings editor, and the loader separate fixed-key and dynamic-settings architectures when TypeBox already expresses both shapes.
- **Atomic settings and feature activation.** Workspace candidates stage and validate completely before commit, while each feature's settings scope and facet registrations install provisionally and roll back together if that feature fails. Partial configuration and half-installed features are harder to understand or repair than leaving the previous candidate intact or the failed feature absent.
- **Flat, visible persistence.** The substrate owns `settings.keybindings` directly as `Record<ActionId, Shortcut | null>` with no inner `bindings` property, and registered settings namespaces materialize at least `{}`. The manifest is a human/agent-facing configuration surface, so it should show where configuration belongs without redundant implementation-shaped nesting or sparse hidden areas.
- **Dynamic structural validation.** `ActionIdSchema` validates every record property against the canonical dotted owner/path grammar and `ShortcutSchema` validates every value; closed-object validation rejects keys outside the record pattern. Runtime-defined keys still need strict syntax, but syntactically valid ids cannot be rejected merely because their feature is temporarily absent.
- **Materialized defaults, not live layering.** Defaults are a template for creating or upgrading complete durable configuration: for this flat map, materialization is `{ ...declaredDefaults, ...persistedBindings }`, followed by validation and persistence. Existing shortcuts and `null` always win, changed defaults do not rewrite established workspaces, newly introduced missing ids fill once, and catalog/dispatch read only the confirmed workspace map; this trades one reconciliation handshake for eliminating permanent distributed default/override resolution.
- **Three durable states.** A missing id is unspecified and eligible for default materialization, `null` is explicitly unbound and blocks materialization, and a shortcut is the concrete binding. Reset copies the current declared default into the complete candidate (or removes the id when no default exists), so normal edits replace one validated settings object atomically rather than publishing a delete/reconcile intermediate state.
- **Main owns configuration; renderer owns interaction.** Main/server validates, persists, and broadcasts the complete binding map, while the renderer resolves client platform semantics, matches keyboard events, computes conflicts, and invokes callbacks. This keeps shared durable state hosting-compatible without moving browser behavior or callback references into the backend.
- **Actions are frontend effectors.** Every action handler registers and executes in the renderer; a human-triggered backend operation is simply an action callback composed with a typed channel request, whose backend handler and later frontend event subscribers remain ordinary channel concepts. A separate backend action-handler facet would duplicate the typed request/event SDK and create a second invocation system.
- **Colocated authoring, split projections.** `defaultBinding` stays on the authored action leaf, and normalization deterministically emits a private executable registration, a public JSON-safe descriptor, and a default-binding template entry with the same derived id and lifetime. This keeps the handler ignorant of bindings while preventing the drift and extra authoring ceremony of two matching action/default trees.
- **Frontend-declaration reconciliation.** After action registration settles—and again only when the default-template projection changes—the renderer batches `{ actionId: defaultBinding }` declarations to main; main overlays its current durable map, validates/persists when changed, and returns the complete confirmed snapshot. Defaults necessarily originate where frontend actions are declared, while this handshake preserves main as the sole durable owner and remains idempotent for late-mounted actions or reload.
- **Whole-scope runtime edits.** Renderer customization submits one complete candidate `settings.keybindings` object; main validates and atomically replaces it, then broadcasts the confirmed snapshot. UI controls may call their intents bind/unbind/reset, but persistence has one validate-and-replace operation rather than piecemeal state mechanics; v1 accepts last-write-wins between rare concurrent clients instead of inventing revisions, locks, or CRDTs before collaborative editing exists.
- **Frontend referential diagnostics.** Main performs structural validation only; the renderer joins the durable ids against its live action registry and exposes inactive ids separately as `unresolvedBindings`, never as fake action descriptors. Only the frontend knows the active action composition, and unresolved must remain a soft diagnostic because a removed feature may later return.
- **Derived conflicts fail closed.** The renderer resolves `mod` for its own platform, groups active actions by normalized shortcut, projects every other claimant in `conflictsWith`, and dispatches none of them by keyboard while preserving direct id invocation. Conflicts depend on the current client and active composition, so persisting or resolving them by load order would create stale or surprising behavior.
- **One portable chord in v1.** Canonical strings use `+` within a chord, `mod` for Command on macOS and Control elsewhere, and the established `ctrl`/`alt`/`shift` plus letter, digit, named navigation/editing, arrow, and function-key vocabulary; modifier order is accepted and normalized, duplicates are rejected, and at least one modifier is required. This follows VS Code/Mousetrap/CodeMirror/Pi conventions with a small internal parser and browser adapter rather than adding a dependency that would not cover UIX persistence, catalog, conflict, or context semantics.
- **Sequences are a compatible later extension.** Spaces are reserved and rejected in v1, while the internal chord representation permits an empty modifier set even though v1 policy rejects it. Later `g g`/bare-key command modes can therefore add pending state, timeout, Escape/context eligibility, and prefix rules without migrating existing bindings or redesigning parsing.
- **One binding per action in v1.** Each value is one `Shortcut | null`; multiple bindings remain deferred. A singular value keeps configuration, display, conflict projection, and editing simple, and the project prefers a later direct migration over carrying unused multiplicity now.
- **Reload, not file watching.** Channel-originated edits update main and all renderers immediately, while human/agent edits to `uix.workspace.json` take effect on substrate reload. This matches the existing disk-wins settings model and avoids introducing general filesystem reactivity as a side effect of keybindings.

### Landed prerequisites and foundation

The settings/lifetime prerequisites are complete: feature and workspace scopes share the one-schema model; manifest load/reload stages and validates one generation before promotion; settings registrations are provisional, identity-aware, and feature-bag-owned; grouped facet registration has strong exception safety; and rejected workspace candidates retain the prior live generation and handles. A2 builds only on this path—there is no compatibility settings or activation path to maintain.

The pure shortcut grammar now validates and canonicalizes portable one-chord gestures, resolves `mod` for a client platform, and keeps produced characters out of persistence (`shift+1`, not `!`). The composition root also registers `settings.keybindings` as the closed canonical-action-id record `Shortcut | null` with an explicit `{}` default; invalid external candidates retain the prior generation. Bound main request handlers serve the two-request `uix` channel: reconciliation with `{}` doubles as read, complete candidate replacement validates before one persistence write, and changed maps publish one confirmed snapshot.

### Remaining implementation

Extend `ActionRegistry` so normalization retains one stable default-template projection independent of enabled/running catalog updates. The workspace binding controller waits for action registration, performs the initial reconciliation handshake, subscribes to confirmed snapshots, gates future keyboard dispatch until confirmation, submits whole-scope edits, and joins active descriptors with bindings/conflicts while projecting unresolved ids separately.

Acceptance:

- Settings scopes have one schema/default definition path for both `Type.Object` and `Type.Record` values, and registered empty namespaces are visible as `{}`.
- An invalid workspace candidate applies no settings or feature-composition changes; a failed feature activation leaves no settings scope or facet contribution from that feature.
- Shortcut parsing, canonicalization, `mod` platform resolution, key vocabulary, rejected duplicates/sequences, and JSON round-tripping have focused table-driven tests derived from established prior art.
- One authored action contribution deterministically produces executable, public descriptor, and default-template projections with identical ids and lifetimes; no default change is triggered by enabled/running-only updates.
- Initial reconciliation materializes missing defaults directly in `settings.keybindings`, returns the main-owned confirmed map, and leaves keyboard dispatch unhydrated until that response arrives.
- Existing shortcuts and `null` survive reload and later default changes; removed/reinstalled features recover prior values, and newly missing ids materialize once.
- Whole-scope replacement validates before commit, persists atomically, and publishes one confirmed snapshot without an intermediate reset state.
- Malformed ids fail main validation, while well-formed inactive ids survive and appear only in the separate unresolved projection.
- Active platform-normalized conflicts mark every claimant, execute nothing by keyboard, and remain invokable directly by id.
- External manifest edits require reload; channel edits update the catalog immediately.

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

Search covers title, canonical id, and title path while displaying paths such as `Chat > Models > Favorite Models`. Results show resolved shortcuts and disabled/running/conflict state. Opening focuses search; keyboard navigation, Enter, light dismiss/Escape, reduced motion, and focus restoration are included. Close the palette before invoking so the chosen action can immediately open another native dialog.

Ranking, styling, and any recents are palette-owned. Recents, if included, are renderer-local presentation cache rather than registry or manifest state.

Acceptance:

- Removing the feature removes only the palette and its opening action.
- A replacement test feature can render and invoke the catalog through public APIs.
- Search works by title, path, and id.
- Chat model actions work from the palette.
- Non-invokable results explain why they are disabled or conflicted.

## A6 — Customization, documentation, and verification

Prove both binding-edit paths. A renderer feature builds and submits a complete candidate through the narrow binding API—its UI may label candidate changes bind, unbind, and reset—and sees the main-confirmed dispatcher/catalog state update immediately. An external or agent edit to `settings.keybindings` takes effect through substrate reload. Do not build the broader cross-feature settings editor in this unit; until that later deliverable lands, the manifest plus reload is the human/agent editing path. The future editor is tracked in the [plans backlog](./backlog.md) as a replaceable feature over a substrate settings catalog, rather than privileged palette behavior.

Update shipped docs for action trees, callback/channel composition, ambient surfaces, bindings, conflicts, and customization. Update architecture-of-record and add worked examples for one local-UI action and one backend-only channel action. Run focused registry, settings, keyboard, ambient-surface, and palette tests followed by the full repository check.

Archive the plan only when new workspace scaffolding includes the palette through an ordinary manifest reference and there is no compiled-in palette fallback.

## Boundary / later

- New-conversation session replacement is separate agent-runtime work. Once its typed request/event exists, a normal renderer action can wrap it and optionally collect a name.
- No backend action-handler facet, agent invocation of actions, or automatic Pi slash-command import.
- No generic action queue or user-facing action cancellation. Long-running work owns progress, cancellation, deduplication, and queuing in its feature/backend task model; actions only start or operate on it.
- No process-global shortcuts, native OS menu, key sequences, multiple bindings, or context-expression language in v1.
- No general panel visibility, surface instances, or multi-copy surfaces. Those wait for a concrete sidebar/tree or multi-agent design.
- The default palette need not own keybinding editing; any feature can build it over the narrow API.
