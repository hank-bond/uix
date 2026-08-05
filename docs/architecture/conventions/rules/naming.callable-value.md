---
summary: "Name a callable participant with a noun role and an object operation with a verb."
kind: reference
---

# Name a callable by its semantic role

**Rule: must.** Name a callable participant with a noun role. Name an object operation with a verb.

**Approved example:** Use a noun when another operation receives, stores, or registers the callable as a participant:

```ts
registerChannel(requestHandler);
subscribe(statusListener);
```

Use a verb when invoking the member performs an operation of the object:

```ts
action.run();
surface.render(client);
cell.restore(state);
```

**Nonconforming example:** Do not choose the name from TypeScript method-versus-property syntax. The semantic role controls the name.
