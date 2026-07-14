---
summary: "Exploring a uniform schema-defined settings-scope model: whole-object defaults materialize instead of layering, static and dynamic keys share one validator path, reload commits atomically, feature handles stay scoped, and a replaceable editor consumes a constrained cross-feature projection."
status: exploring
---

# Workspace settings

## Current synthesis

Every persisted settings scope should be one schema-defined object. The definition pairs one TypeBox object schema with optional whole-object defaults; the schema determines whether keys are statically named (`Type.Object`), dynamically validated (`Type.Record`), nested, optional, or some combination. UIX should not expose separate fixed-settings and dynamic-settings concepts or setup functions.

The same model covers both persistence locations:

- a workspace namespace such as `settings.agent` or `settings.keybindings` is validated by that namespace's definition;
- a manifest feature entry's `settings` value is validated by that feature's definition.

For example, `agent` uses an object with named optional fields, while keybindings uses `Type.Record(ActionIdSchema, ShortcutOrNullSchema)` so every runtime-defined property name and value is still validated. The record must reject additional properties that do not satisfy the action-id pattern. Settings helpers should make closed-object validation the default rather than requiring each author to remember `additionalProperties: false`.

Loading follows one path: start from the persisted object (or `{}`), recursively fill missing values from the definition's default object, validate the complete result with the one schema, then install the validated object as live state. Existing values win; arrays, scalars, and `null` are atomic. Per [settings defaults materialize](../decisions/2026-07-13-settings-defaults-materialize.md), anything filled by a default is written into the manifest and runtime never consults a sparse override/default stack. The current direction is also to materialize registered empty namespaces as `{}`: this is simpler than deletion/empty-parent cleanup and makes the available configuration surface visible to humans and agents.

Candidate reload obeys [atomic candidates and feature activation](../decisions/2026-07-13-atomic-candidates-and-feature-activation.md): core workspace namespaces stage and validate before any live configuration or feature composition changes. Feature settings join that feature's provisional activation lifetime; if later context construction or facet registration fails, the settings scope and every substrate-owned contribution for that feature roll back together while siblings continue.

Normal operational access remains owner-scoped. Backend `ctx.settings` and renderer `useFeatureSetting` let a feature read and mutate only its own scope; substrate domains receive their own namespace handles. The broader human-administration axis follows the command-palette pattern: the substrate can later project serializable setting descriptors, complete scope values/defaults, structural/referential diagnostics, draft validation, and constrained candidate replacement, while an ordinary replaceable ambient feature renders the default settings modal. That future feature receives no other feature's raw handle, and features remain free to build richer scoped editors for themselves. The deliverable remains in the [plans backlog](../plans/backlog.md); raw manifest edits plus reload are sufficient meanwhile.

Keybindings are the first dynamic scope and exercise the important semantics. `settings.keybindings` directly maps canonical action ids to a materialized shortcut or `null`, without an inner `bindings` property. Action-contributed defaults only fill missing ids; catalog and dispatch read the workspace map alone. Well-formed inactive ids remain durable and project as unresolved diagnostics rather than schema errors, preserving feature reinstall choices while allowing a future editor to expose likely typos.

## Open questions

- What presentation metadata belongs beside schemas for a generic settings editor: title, description, ordering, sensitivity, and preferred control hints?
- Which settings must be hidden or non-editable because another store owns them, especially credentials and command-backed secrets?
- How should a future editor validate and repair a malformed external draft when the live runtime correctly retains the previous atomic snapshot?
- Should bespoke setting controls be registered as editor contributions, or should generic descriptors link/invoke feature-owned actions that open richer UI?
- What exact reset/delete operations belong on the general settings substrate versus domain APIs such as keybindings?

## Log

### 2026-07-13 — one scope schema, materialized defaults, and a replaceable editor

Workspace actions exposed three connected problems in the current settings shape. First, `settings.keybindings` needs runtime-defined action ids, but the existing `SettingDefinitions` API assumes a predeclared schema per property. Splitting settings into fixed and dynamic setup functions would make persistence shape an architectural distinction that TypeBox already expresses: one namespace schema can be a `Type.Object` or `Type.Record`. The direction became one schema/default definition per scope and one hydration/validation path.

Second, sparse overrides were rejected as distributed state management. Defaults are materialization inputs: missing values fill and persist, existing values always win, and runtime reads only the durable result. Empty registered scopes remain visible as `{}` because this is both simpler and a useful manifest affordance. The stable conclusion was distilled into [settings defaults materialize](../decisions/2026-07-13-settings-defaults-materialize.md).

Third, a pan-feature settings modal does not require hardcoded cockpit UI. It mirrors the command palette: the hub standardizes a narrow serializable catalog and validated operations where cross-feature composition is worthwhile; an ordinary feature decides how to render them. Owner-scoped handles remain the normal feature API. This was seeded as [replaceable cross-feature settings editor](../plans/backlog.md), while keybindings retain unresolved ids so that editor can eventually distinguish malformed data, likely typos, and intentional dormant configuration.
