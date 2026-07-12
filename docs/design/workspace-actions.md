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

One workspace renderer registry holds two views:

- the private registrations retain callbacks and contributed defaults;
- the public catalog is a flat list of JSON-safe descriptors: id, owner, title, path, optional description, resolved binding, enabled/running state, and conflicts.

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

Bindings are durable workspace choices under a substrate-owned `keybindings` settings namespace. Actions may contribute a default. On first active registration, each missing default is materialized into `uix.workspace.json`; existing values always win and `null` explicitly unbinds. This intentionally snapshots defaults per workspace: later feature-default changes do not rewrite existing workspaces, removed actions leave harmless dormant entries, and reinstalling an action recovers its prior binding.

The renderer joins active descriptors with persisted bindings and computes conflicts centrally after platform normalization. If multiple active actions resolve to one shortcut, that shortcut invokes none; each action remains invokable by id. Conflicts are included in the public catalog but never persisted because they depend on the active composition.

A narrow substrate channel allows renderer features to set, unbind, and reset bindings without receiving the raw workspace-settings handle. Humans and agents may also edit the manifest and reload UIX. The key dispatcher handles only a focused workspace window; it is not Electron's process-global shortcut facility. Electron accelerators that overlap workspace actions, notably native reload, must yield to the renderer dispatcher, while true App/OS chrome such as quit remains Electron-owned.

### Deliberate limits

Renderer actions do not run without an attached workspace renderer, access Node/main objects directly, become agent tools, or replace typed backend APIs. Pi slash commands remain separate; a feature may deliberately wrap one in an action. A future native application menu can mirror the serializable catalog and route selection to the focused renderer, but it is not an alternate action execution path.

## Open questions

- Does v1 need more than one modified-key chord per action? Key sequences, multiple bindings, and focus/context expressions can wait unless a first consumer forces them.
- What panel visibility/focus API should follow once an action-triggered sidebar is concrete?
- Should the default palette eventually include a binding editor, or should that be a separate replaceable feature?

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
