# Extensions

UIX extensions are trusted local TypeScript/JavaScript modules loaded by the
cockpit main process. They follow the same shape as pi extensions: a default
exported factory receives an injected API object and registers contributions
through that object.

```ts
import type { ExtensionAPI } from "@uix/api";

export default function (uix: ExtensionAPI) {
  uix.registerCommand("hello.say-hi", {
    description: "Say hi from hello",
    handler: () => {
      console.log("hi");
    },
  });
}
```

`@uix/api` is type-only today. Use `import type`; do not import runtime values
from it until UIX grows a real published API package.

## Package shape

A UIX-loadable package is a directory with a `package.json` that declares a
`uix` field:

```json
{
  "name": "hello",
  "version": "0.0.0",
  "private": true,
  "uix": {
    "extensions": ["./uix.ts"]
  }
}
```

A package may also declare pi resources beside UIX resources:

```json
{
  "name": "my-package",
  "pi": {
    "extensions": ["./pi/index.ts"]
  },
  "uix": {
    "extensions": ["./uix/index.ts"]
  }
}
```

The package directory is the discovered unit. Each entry file listed in
`uix.extensions` is an activation unit with its own lifetime bag.

## Discovery locations

UIX currently discovers extension packages from:

| Location              | Scope                                            |
| --------------------- | ------------------------------------------------ |
| `.uix/extensions/*`   | Project-local, rooted at the cockpit process cwd |
| `~/.uix/extensions/*` | User/global                                      |

Configured package paths will be added later, following pi's package/settings
model.

## Runtime loading

Extension entries are loaded with [`jiti`](https://github.com/unjs/jiti) in the
main process. That means entries can be `.ts` or `.js` files on disk and do not
require rebuilding the Electron app.

UIX configures jiti with `moduleCache: false`, matching pi's hot-reload posture:
reloading evaluates the current source for the same path instead of returning a
stale Node module instance.

jiti is not a sandbox. Extensions are trusted local code and run with the
permissions of the Electron main process.

## Lifetime and reload

Everything an extension registers through the injected API is owned by that
extension activation's `DisposableBag`. All extension activation bags live under
one `extensionsBag` child of `appBag`.

Cockpit reload calls the same load path used at startup:

1. discover extension packages from disk;
2. if discovery succeeds, clear `extensionsBag`;
3. activate all discovered UIX entries into the same reusable bag.

Discovery is side-effect-free and runs before clearing, so a discovery-only
substrate failure leaves the current extension tree active. Once activation
starts, old contributions are gone; per-entry import/factory failures are
reported in the activation result and sibling entries continue loading.

Concurrent load/reload calls share one in-flight Promise so clear/activate never
overlaps itself.

The renderer bridge exposes cockpit reload as:

```ts
await window.uix.reload();
```

Today this reloads UIX extensions and, if a pi session already exists, delegates
to pi's native `session.reload()` path. Future command palette/menu and chat
`/reload` affordances should call the same bridge/cockpit operation.

## Current API surface

The current UIX extension API is intentionally small:

- `registerCommand(name, options)` — logs/registers a command-shaped
  contribution with lifetime cleanup. The real command registry/invocation path
  lands in a later milestone.

Upcoming extension APIs will add panes, channels, file watchers, declarative
contributions, and agent-facing tools. See [`panes.md`](./panes.md),
[`channels.md`](./channels.md), [`contributions.md`](./contributions.md), and
[`lifetimes.md`](./lifetimes.md).
