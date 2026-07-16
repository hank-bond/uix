---
summary: "Workspace actions are feature-owned renderer workflows arranged in presentation trees: one renderer registry privately holds callbacks, publicly projects serializable descriptors, resolves durable workspace keybindings and conflicts, and lets replaceable palette/menu/tree features invoke actions by id while backend effects continue through typed channels."
status: exploring
---

# Workspace actions

## Current synthesis

UIX needs human-callable operations that do not assume Chat is the interaction shell. Features should be able to publish actions such as opening a model picker, showing a dialog, refreshing backend state, or reloading the workspace. Other features should be able to discover and invoke those actions without importing the owner's React state or backend channel contract.

The substrate supplies an action registry and keybinding dispatch, not a command-palette UI. UIX ships an opinionated Ray/VS Code-style palette as a default feature over that substrate. A workspace may remove it, replace it, render the same actions as menus or a tree, or expose no global action browser at all; direct keybindings continue to work without a palette.

### Action model

An **action is a renderer workflow**. Its callback may change feature-local UI state, open a native `<dialog>`, invoke another action, or call a typed channel request. UIX should not add a parallel main-process action-handler system: channels already own typed backend validation, logging, events, and durable effects. Even a backend-only operation is represented by a small renderer callback over a channel request.

Actions are contributed as nested keyed objects. Each object key is a local name, never a caller-supplied id; the feature-scoped registration facet derives the canonical id from the feature owner and complete key path, such as `chat.conversation.compact`. Group/action titles are display-only and produce paths such as `Chat > Conversation > Compact`, so titles may change without changing identity. Moving a contribution to a different keyed path intentionally gives it a new identity; its old saved binding remains as a harmless dormant entry.

The renderer registry flattens contributed leaves in authored order. The key path retains identity and each descriptor's title path retains enough presentation structure for palette, menu, and tree features; no normalized public group objects are exposed until a concrete consumer needs group metadata that paths cannot express. A palette searches title, canonical id, and path.

One authored action contribution deterministically becomes three renderer projections with the same derived id and lifetime:

- the private registrations retain callbacks and enabled/running state;
- the public catalog is a flat list of JSON-safe descriptors: id, owner, title, path, optional description, resolved binding, enabled/running state, and conflicts;
- the default-binding template contains only ids whose leaves declare `defaultBinding` and changes independently from enabled/running-only catalog updates.

Keeping `defaultBinding` on the action leaf is authoring colocation, not runtime coupling: the callback never receives or reads it, and normalization splits the metadata immediately. A separate default contribution tree would duplicate keyed paths, create drift, and add another registration lifetime for no current benefit.

Any surface can subscribe to the catalog and invoke an id. The registry executes the owner's private callback, so cross-feature composition exposes neither callback references nor another feature's channels. The callback normally closes over the state and typed client of the surface that registered it. Substrate-scoped channel contracts remain available where intended, as Chat already demonstrates with the `agent` contract.

Action invocation is asynchronous and errors return to the invoking UI; keybinding-triggered errors need a central observable diagnostic because there is no direct caller UI. Each action id has one in-flight invocation slot: another invocation while its callback promise is pending returns `already_running` and is not queued. Registration lifetime owns callback availability, but unregistering does not claim to cancel work the callback already started.

Long-running operation lifecycle belongs to the feature or backend that understands it, not to the action registry. A start action normally finishes once a typed channel accepts the operation; progress, cancellation, deduplication, and any queue remain feature-owned state exposed through channel events and requests. The feature can contribute separate start/cancel/show-progress actions whose enabled state follows that operation. This avoids a generic queue guessing whether repeated intents should be dropped, merged, supersede one another, or execute sequentially.

### Surface composition

Actions register from mounted surfaces so they can close over real React state. Surface composition gains one presentation distinction instead of a separate action-module pipeline:

- **panel surfaces** participate in workspace layout;
- **ambient surfaces** mount for the workspace lifetime without taking panel space.

An ambient surface may render a native `<dialog>` or only register effects/actions. Chromium's modal top layer already provides cross-workspace stacking, backdrop, focus trapping, and Escape behavior while the dialog retains DOM ancestry under the feature's scoped-CSS root. The default command palette is therefore an ordinary ambient surface, not substrate overlay UI.

Future action-triggered sidebars remain panel surfaces. Their show/hide/focus model should be designed when that concrete consumer arrives; ambient surfaces do not need to solve panel visibility or surface instances.

### Bindings and customization

Bindings are durable workspace choices stored directly as the dynamic action-id map at `settings.keybindings` in `uix.workspace.json` — there is no inner `bindings` property. Per the [workspace-settings design](./workspace-settings.md), every settings scope has one object schema plus optional whole-object defaults: ordinary named scopes use `Type.Object`, while keybindings use `Type.Record(ActionId, Shortcut | null)` through the same hydration, validation, persistence, and subscription path. Dynamic keys remain structurally validated, but syntactically valid ids need not be active. Registered settings namespaces materialize at least `{}` so the manifest exposes the configurable area instead of hiding it behind sparse overrides.

Defaults create complete configuration rather than participating in runtime resolution. After frontend actions register, the renderer sends its batched default-template projection to main; main computes `{ ...declaredDefaults, ...persistedBindings }`, validates and persists the complete map, then returns/broadcasts the confirmed snapshot. Existing values—including `null`—always win, later default changes do not rewrite existing workspaces, removed actions leave dormant entries, and reinstalling an action recovers its prior binding. Renderer catalog and dispatch remain gated until initial confirmation and then consult only the main-owned map. A changed default template may repeat the idempotent reconciliation for late-mounted actions without turning defaults into a live fallback layer.

Main owns durable configuration and complete-scope replacement; the renderer owns keyboard interpretation and action execution. A renderer customization feature submits one complete candidate map, main validates and atomically replaces it, and main broadcasts the confirmed result. Missing means eligible for materialization, `null` means explicitly unbound, and a shortcut is concrete; UI intents called bind/unbind/reset merely construct the next candidate, with reset copying the current declared default (or omitting an id that has none). Human or agent file edits still require substrate reload, while channel edits publish immediately.

The renderer joins active descriptors with confirmed bindings and computes conflicts centrally after resolving `mod` for its own platform. If multiple active actions resolve to one shortcut, that shortcut invokes none; each action remains invokable by id. Conflicts are included in the public catalog but never persisted because they depend on the active client and composition. A well-formed persisted id with no action is projected in a separate unresolved list, not rejected or represented as a fake action: it may be a typo, or it may belong to a temporarily removed feature. A future settings editor can repair/delete these entries while preserving intentional dormant choices.

The v1 shortcut grammar follows established editor conventions without a dependency: `+` joins one chord, `mod` means Command on macOS and Control elsewhere, common modifiers and gesture key names normalize deterministically, and one modifier is required. A binding describes the keys a human presses rather than the character those keys produce, so modifiers remain explicit (`shift+1`, never `!`); browser `key`/`code` translation stays inside the dispatcher adapter rather than entering the persisted format. Spaces are reserved for later follow-up sequences, and the internal chord representation can already express no modifiers; pending state, timeout, prefix ambiguity, Escape/context eligibility, and event suppression stay out of v1. The key dispatcher handles only a focused workspace client, not Electron's process-global shortcut facility. Electron accelerators that overlap workspace actions, notably native reload, must yield to the renderer dispatcher, while true App/OS chrome such as quit remains Electron-owned.

### Deliberate limits

Renderer actions do not run without an attached workspace renderer, access Node/main objects directly, become agent tools, or replace typed backend APIs. Pi slash commands remain separate; a feature may deliberately wrap one in an action. A future native application menu can mirror the serializable catalog and route selection to the focused renderer, but it is not an alternate action execution path.

## Open questions

- What panel visibility/focus API should follow once an action-triggered sidebar is concrete?
- When should the generic cross-feature settings catalog and replaceable settings-modal feature be promoted from the [plans backlog](../plans/backlog.md)?

## Log

### 2026-07-12 — actions, keybindings, and a replaceable default palette

The new-conversation discussion exposed the need for human operations that do not assume Chat exists. We considered front- and backend action handlers, but backend handlers would duplicate channels. The resulting split is renderer callbacks for interaction and typed channels for backend work.

The catalog retains nested menu semantics rather than flattening at registration. Palettes can search a flat projection and display paths such as `Chat > Conversation > Compact`; menus and trees can preserve the hierarchy. Stable action ids remain independent from that placement.

Chat's provider modal corrected an unnecessary proposed primitive: UIX does not need a custom overlay host. Native `<dialog>.showModal()` already enters Chromium's top layer across the shared page and remains under the feature surface's scoped-CSS root. The needed composition extension is an ambient surface that stays mounted without consuming grid space, which keeps the palette removable and replaceable.

Every contributed default binding materializes into the workspace manifest. Active conflicts are detected centrally and disabled rather than resolved by load order or automatic conflict edits. Renderer features can update bindings through a narrow API; humans and agents can edit the manifest directly and reload.

### 2026-07-12 — single-flight invocation, feature-owned operations

We separated an action invocation from a long-running operation. The registry gets one non-queued in-flight slot per action id and reports `already_running` for duplicate invocation. It does not provide generic user cancellation or a task queue: a feature starts cancellable or queued work through its typed backend API, owns progress and cancellation there, and projects that state back into action enabled states or separate cancel actions.

### 2026-07-12 — keyed contributions and a flat public catalog

We aligned actions with the facet-wide identifier rule: authors never supply ids. A surface registers a nested keyed contribution object, and its feature-scoped registry handle derives canonical ids from the feature plus key path. Titles remain display-only. Normalization emits private callback registrations and a flat public descriptor list; title paths preserve enough grouping for current palette/menu/tree consumers, so public group descriptors and keyword metadata were dropped.

### 2026-07-13 — flat keybinding namespace and the settings-editor pattern

The manifest shape should serve humans and agents rather than mirror the current fixed-key `SettingsRegistry`: `settings.keybindings` directly maps action ids to shortcuts or `null`, without a redundant inner `bindings` cell. Its dynamic property names remain schema-validated against the canonical action-id grammar. Well-formed ids that do not resolve against the active renderer registry are retained for feature reinstallation and projected as unresolved diagnostics, so a future editor can distinguish malformed data from a possible typo or dormant choice.

That editor follows the command-palette pattern: the substrate standardizes the cross-feature hub — serializable definitions/values/diagnostics plus constrained candidate validation/replacement — while an ordinary replaceable ambient feature renders the default settings modal. Normal feature settings handles remain owner-scoped, and features remain free to provide bespoke editors on the same axis. Until that projection and feature are promoted from the backlog, humans and agents edit the raw manifest and reload. Shortcut strings reserve `+` for one chord and spaces for later sequences; v1 rejects sequences because dispatch would also need pending state, timeout, prefix ambiguity, cancellation, and event-suppression semantics.

### 2026-07-13 — frontend actions, main-owned bindings, and the materialization handshake

Actions remain entirely frontend effectors: keybindings invoke renderer callbacks, local callbacks mutate UI directly, and callbacks that need backend effects call typed channel requests whose handlers/events stay in the channel substrate. This keeps one action invocation path and avoids inventing backend actions when composition already yields them.

Durable bindings nevertheless belong to main for hosted-client agreement. Because default bindings are authored beside frontend action handlers, startup/reload uses one handshake: normalization projects a default template, renderer sends it after registration settles, and main overlays its persisted complete map, validates/persists, and returns the authoritative snapshot. The one reconciliation round trip is the accepted cost of full materialization; sparse overrides would avoid it only by forcing every renderer to resolve defaults forever.

We kept `defaultBinding` colocated on the action leaf because deterministic normalization can split executable, public, and default-template projections at negligible cost, while separate action/default contribution trees can drift. Runtime binding edits submit a whole candidate scope and main publishes only the confirmed replacement; bind/unbind/reset are UI meanings over shortcut/null/default values rather than separate persistence mechanisms.

### 2026-07-15 — shortcut strings describe gestures

The `Shift+1` case clarified that persisted bindings describe the keys a human presses, not the text produced after a keyboard layout applies modifiers. Modifiers therefore stay explicit and the base key remains named as part of the gesture (`shift+1`, not `!`). DOM `KeyboardEvent.key`, `code`, and layout translation belong to the later dispatcher adapter; deprecated numeric key codes and browser-specific names do not enter the durable format.
