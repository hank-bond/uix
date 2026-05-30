# Lifetimes

> **Stub.** Will mirror the relevant parts of
> [`/docs/conventions.md`](../../docs/conventions.md) once the extension
> lifetime API stabilizes.

Will cover:

- `DisposableBag` for extension authors.
- Named lifetime scopes (`appBag`, `extensionBag`, `windowBag`,
  `sessionBag`) and which ones extensions can reach.
- Registration patterns: every listener / watcher / subscription goes into
  a bag.
- Hot reload as the test: dispose the bag, re-activate, no leaks.

See [`extensions.md`](./extensions.md).
