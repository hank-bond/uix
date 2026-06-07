---
summary: "Extension entry files can call registerCommand only; the registration is logged and lifetime-scoped but not yet invokable through a command registry."
status: active
---

# Contributions

The current public UIX extension contribution surface has one method:

```ts
uix.registerCommand(name, {
  description: "Optional human-readable description",
  handler: async () => {
    // not currently invoked by UIX
  },
});
```

Current behavior:

- registration is accepted from a loaded UIX extension entry;
- the registration is logged by `src/main/extensions/context.ts`;
- a cleanup callback is enrolled in the extension activation's `DisposableBag`;
- reload/deactivation logs command cleanup;
- there is no command registry, command palette, keybinding path, or invocation path yet.

No other public contribution points are currently implemented for UIX extensions. In particular, UIX extensions cannot currently register panes, channels, file watchers, status items, palette entries, documentation, examples, or agent-facing tools through `@uix/api`.

See [`extensions.md`](./extensions.md), [`lifetimes.md`](./lifetimes.md).
