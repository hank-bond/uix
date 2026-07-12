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

Actions are authored as nested groups and leaves. Group/action titles produce paths such as `Chat > Conversation > Compact`; a palette may flatten leaves and search title, canonical id, keywords, and path, while menu/tree features preserve the hierarchy. Invocation identity is separate from placement: each leaf has a feature-local id unique across that feature's complete tree, and the registry derives `${featureId}.${localId}`. Moving an action between groups does not break callers or saved bindings.

One workspace renderer registry holds two views:

- the private registration retains the callback;
- the public catalog contains JSON-safe descriptors: id, owner, title, path, optional description/keywords, resolved binding, enabled/running state, and conflicts.

Any surface can subscribe to the catalog and invoke an id. The registry executes the owner's private callback, so cross-feature composition exposes neither callback references nor another feature's channels. The callback normally closes over the state and typed client of the surface that registered it. Substrate-scoped channel contracts remain available where intended, as Chat already demonstrates with the `agent` contract.

Action invocation is asynchronous and errors return to the invoking UI; keybinding-triggered errors need a central observable diagnostic because there is no direct caller UI. Registration lifetime owns callback lifetime. The first implementation should settle same-action re-entry and cancellation on unmount/reload rather than leave stale async callbacks implicit.

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

- What nested TypeScript helper gives useful inference and explicit order without duplicating the normalized catalog shape?
- Does v1 need more than one modified-key chord per action? Key sequences, multiple bindings, and focus/context expressions can wait unless a first consumer forces them.
- Should the registry reject same-action re-entry by default, and what cancellation signal is meaningful when a channel request is already in flight?
- What panel visibility/focus API should follow once an action-triggered sidebar is concrete?
- Should the default palette eventually include a binding editor, or should that be a separate replaceable feature?

## Log

### 2026-07-12 — actions, keybindings, and a replaceable default palette

The new-conversation discussion exposed the need for human operations that do not assume Chat exists. We considered front- and backend action handlers, but backend handlers would duplicate channels. The resulting split is renderer callbacks for interaction and typed channels for backend work.

The catalog retains nested menu semantics rather than flattening at registration. Palettes can search a flat projection and display paths such as `Chat > Conversation > Compact`; menus and trees can preserve the hierarchy. Stable action ids remain independent from that placement.

Chat's provider modal corrected an unnecessary proposed primitive: UIX does not need a custom overlay host. Native `<dialog>.showModal()` already enters Chromium's top layer across the shared page and remains under the feature surface's scoped-CSS root. The needed composition extension is an ambient surface that stays mounted without consuming grid space, which keeps the palette removable and replaceable.

Every contributed default binding materializes into the workspace manifest. Active conflicts are detected centrally and disabled rather than resolved by load order or automatic conflict edits. Renderer features can update bindings through a narrow API; humans and agents can edit the manifest directly and reload.
