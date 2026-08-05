---
summary: "Feature surfaces register renderer action trees. The workspace derives catalogs, invokes ids, materializes defaults, and disables conflicted keybindings."
kind: reference
status: active
---

# Workspace actions

An action is a human-invokable renderer workflow. Feature surfaces register action trees, while the workspace owns identity, discovery, invocation, and keybinding projection.

Actions are frontend effectors. An action that needs backend work calls a typed channel request rather than registering a second backend action system.

## Contribute actions

Surface components call `useActionContribution()` with a nested keyed object:

```tsx
useActionContribution({
  models: {
    title: "Models",
    children: {
      all: {
        title: "All models",
        defaultBinding: "mod+j",
        run: openAllModels,
      },
    },
  },
});
```

Object keys are local identity segments. The substrate binds the owning feature id and derives `chat.models.all`. Authors do not provide canonical ids.

Group titles organize presentation paths. A leaf contains `title`, optional `description`, optional `defaultBinding`, optional `enabled`, and a synchronous or asynchronous `run` callback.

Registration follows the component lifetime. Updating the contribution replaces its resolved leaves, while unmounting removes them.

## Catalog and invocation

`useActionCatalog()` returns a flat serializable `ActionCatalog`. Each entry contains:

- Canonical id and owning feature id.
- Title and group-title path.
- Optional description and confirmed binding.
- Enabled and running state.
- Every active action with a conflicting binding.

The catalog never exposes callbacks. A palette, menu, or surface calls the function from `useInvokeAction()` with an action id.

Invocation resolves against current registry state. It returns `completed` or a `not_invoked` reason: `not_found`, `disabled`, or `already_running`.

The registry gives each action one non-queued running slot. A duplicate invocation fails closed rather than guessing queue or cancellation semantics.

Long-running operation state belongs to the feature or backend that understands it. Actions can expose separate start, cancel, or inspect workflows.

## Keybindings

An action leaf can declare one portable default binding. The renderer sends active defaults to main for reconciliation with durable `settings.keybindings`.

A missing durable id materializes its contributed default. An existing shortcut wins, while `null` preserves an explicit unbound choice.

Main owns the complete durable map. The renderer resolves `mod` for its platform, joins confirmed bindings onto active actions, and derives conflicts.

If multiple active actions resolve to one shortcut, keyboard dispatch invokes none. Each action remains directly invokable by id.

Well-formed bindings for absent actions remain durable. They appear in a separate unresolved projection and become active if the feature returns.

Control, Command, and Alt shortcuts remain active in editable controls. Composition, AltGraph, Shift-only editable gestures, and locally handled events keep control.

## Current limits

UIX does not ship a default command-palette feature yet. The action registry and direct keybindings work without one.

The public workspace API does not yet expose whole-map binding replacement. Humans and agents can edit `settings.keybindings` in the manifest and reload.

Substrate action `uix.session.new` defaults to `mod+n`. Chat contributes actions that open its model picker in specific scopes.

See [`settings.md`](./settings.md) for durable keybindings and [`how-to/add-a-channel.md`](./how-to/add-a-channel.md) for backend action composition.
