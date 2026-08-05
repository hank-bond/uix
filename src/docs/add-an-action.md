---
summary: "Add an action to a feature: register a nested action tree with useActionContribution and invoke it from a surface."
kind: how-to
read_when: "Read when adding an action to a feature, or when asked to add an action."
---

# Add an action to a feature

An **action** is a human-invokable renderer workflow. Surfaces register action trees, and the workspace owns identity, discovery, invocation, and keybinding projection. An action that needs backend work calls a typed channel request rather than registering a second backend action system.

Files involved:

- [`src/api/actions.ts`](../../src/api/actions.ts), contribution and catalog contracts
- [`src/api/workspace.ts`](../../src/api/workspace.ts), `useActionContribution`, `useActionCatalog`, `useInvokeAction`

The reference for a real action set is [`src/features/chat/workspace/model-actions.ts`](../../src/features/chat/workspace/model-actions.ts).

## Contribute an action tree

Surface components call `useActionContribution()` with a nested keyed object:

```tsx
// features/notes/workspace/actions.tsx
import { useActionContribution } from "@uix/api/workspace";

function NotesActions() {
  useActionContribution({
    open: {
      title: "Open all notes",
      defaultBinding: "mod+n",
      run: openAllNotes,
    },
  });
  return null;
}
```

Object keys are local identity segments. The substrate binds the owning feature id and derives the canonical id (`notes.open` for the example above). Authors do not provide canonical ids.

Group keys organize presentation paths. A group carries `title` and `children`, and a leaf carries `title`, optional `description`, `defaultBinding`, and `enabled`, plus a synchronous or asynchronous `run`.

Registration follows the component lifetime. Updating the contribution replaces its resolved leaves, while unmounting removes them.

## Invoke an action

`useActionCatalog()` returns a flat serializable catalog, and `useInvokeAction()` returns a function that runs an action by id:

```tsx
const invoke = useInvokeAction();
invoke("notes.open");
```

The catalog never exposes callbacks. A palette, menu, or surface calls the invoke function with an action id.

Invocation resolves against current registry state and returns `completed` or a `not_invoked` reason: `not_found`, `disabled`, or `already_running`. Each action has one non-queued running slot, so a duplicate invocation fails closed.

## Keybindings

A leaf can declare one portable `defaultBinding`. The renderer sends active defaults to main for reconciliation with durable `settings.keybindings`. A missing durable id materializes its contributed default, an existing shortcut wins, and `null` preserves an explicit unbound choice.

If multiple active actions resolve to one shortcut, keyboard dispatch invokes none. Each action remains directly invokable by id.

## Verify

Reload the workspace. The action appears in the catalog with its derived id, invoking it runs the callback, and a registered default binding works in non-editable contexts.
