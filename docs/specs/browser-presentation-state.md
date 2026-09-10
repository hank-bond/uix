---
summary: "Browser-local presentation state restores opted-in workspace preferences and conversation-item state across visits, with feature-defined author defaults."
kind: reference
status: draft
implementation: incomplete
---

# Browser presentation state

## Contract

_Browser presentation state_ preserves selected human-facing preferences and interaction state on one browser or device. Features opt in through a shared persistence capability rather than implementing their own storage plumbing.

_Author defaults_ are the initial values declared in feature code. A browser with no recorded choice uses those defaults. Human choices override them locally without changing application configuration.

## Dependencies

[`feature-composition.md`](./feature-composition.md) defines worktree-owned application configuration and full page reload after successful composition replacement. [`agent-viewpoints.md`](./agent-viewpoints.md) defines the conversation identity used to distinguish item state.

## Boundary

This specification owns local presentation continuity, not authoritative application data, feature turn state, or manifest settings. It distinguishes preferences shared across one workspace's conversations from interaction state belonging to one conversation item.

Persistence is optional and applies while browser storage is available and retains its local data. Cross-browser and cross-device synchronization are outside this scope. The capability does not preserve arbitrary component memory or make every interaction persistent.

## Requirements

### Opt-in and author defaults

- UIX **must** provide a shared capability for features to opt selected presentation values into local persistence.
- A feature **must** declare an author default and a stable feature-local name for each opted-in value.
- The capability **must** restore and persist opted-in values without requiring each feature to implement browser storage access.
- When no local value exists, the capability **must** use the author default from feature code.
- Author defaults for browser presentation state **must not** come from manifest settings.
- A presentation change **must not** require Agent execution, composition replacement, or a Git operation.

### Workspace preferences

- Workspace presentation preferences **must** belong to one workspace and feature on the current browser or device.
- Switching or reopening sessions within that workspace **must** retain the human's recorded preferences.
- A preference change in one workspace **must not** change another workspace's preferences.
- Preference identity **must not** depend on the selected conversation, Agent instance, attachment, or composition generation.

### Conversation-item state

- Per-item presentation state **must** belong to one workspace, feature, conversation session, and stable item identity.
- Reopening the same item **must** restore its opted-in presentation values.
- Items in different conversations **must not** share presentation state merely because their item identifiers match.
- Item identity **must not** depend on list position, component mounting, attachment identity, or composition generation.

### Persistence and restoration

- Opted-in values **must** survive page reload and closing and reopening the workspace on the same browser or device.
- Both Electron and the web host **must** provide this local continuity.
- A browser or device without recorded presentation state **must** start from author defaults.
- UIX **must not** synchronize this state through a backend or between devices.
- Presentation changes **must not** write the workspace manifest, session history, or feature turn state.
- Page reload **must not** depend on keeping surface components mounted to preserve opted-in values.

### Optional storage and invalid values

- When browser storage is unavailable, the capability **must** skip storage reads and writes and initialize presentation state from author defaults.
- Unavailable storage **must not** prevent mounting or interacting with a surface.
- A storage read failure **must** use the affected value's author default.
- When feature code cannot interpret a recorded value, the capability **must** use that value's author default without resetting unrelated values.
- A storage write failure **must not** block or undo the human's interaction. The changed value **may** remain in memory without a persistence guarantee.

### Chat presentation

- Chat's tool-summary presentation preferences **must** use workspace presentation preferences rather than manifest settings.
- Chat **must** persist each tool block's expanded state as conversation-item presentation state.

For example, choosing which arguments appear in a tool type's summary applies across conversations in the workspace. Expanding one particular tool block changes only that item's presentation.

## Conformance

A conforming implementation demonstrates these outcomes:

1. A fresh browser uses author defaults. A human changes a Chat summary preference and sees that choice after switching sessions in the same workspace.
2. The preference survives page reload and closing and reopening the workspace. A different workspace and a fresh browser retain their own defaults.
3. A human expands a tool block, reloads the page, and later reopens the conversation. The same item remains expanded without changing another item's state.
4. Items with matching local identifiers in two conversations retain independent state. Reordering items does not transfer an expanded state to a different item.
5. Successful composition replacement reloads the page and restores opted-in values. Restoration does not depend on whether surface code changed or components remained mounted.
6. Electron and the web host provide equivalent local restoration without backend synchronization, manifest changes, or session-history entries.
7. A feature opts a named value into the shared capability with an author default and the applicable scope. It needs no feature-specific storage plumbing.
8. With storage unavailable, a surface starts from author defaults and remains interactive without storage reads or writes.
9. An unreadable or incompatible recorded value falls back to its author default. Unrelated valid values still restore.
10. A storage write fails after a human changes presentation state. The interaction remains effective, although reopening may restore an earlier value or the author default.

## Degrees of freedom

Storage encoding, key construction, serialization, and framework-specific helper interfaces remain implementation choices. Those choices must preserve the declared scopes, author defaults, and local restoration behavior.
