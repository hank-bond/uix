---
summary: "Trusted local TS/JS packages default-export a factory that receives the injected type-only @uix/api; entries are discovered from .uix/extensions and ~/.uix/extensions, loaded with jiti, and lifetime-scoped across reloads."
status: active
---

# Extensions

UIX extensions are trusted local TypeScript/JavaScript modules loaded by the cockpit main process. A UIX extension entry default-exports a factory function that receives the injected `uix` API object.

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

`@uix/api` is type-only in this repo. Use `import type`; do not import runtime values from it.

## Package shape

A UIX-loadable package is a directory with a `package.json` that declares a `uix` field:

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

A package may also contain a `pi` field, but the UIX extension loader only activates entries listed in `uix.extensions`.

The package directory is the discovered unit. Each entry file listed in `uix.extensions` is an activation unit with its own lifetime bag.

## Discovery locations

UIX currently discovers extension packages from:

| Location              | Scope                                            |
| --------------------- | ------------------------------------------------ |
| `.uix/extensions/*`   | Project-local, rooted at the cockpit process cwd |
| `~/.uix/extensions/*` | User/global                                      |

No other UIX extension discovery locations are read by the current code.

## Runtime loading

Extension entries are loaded with [`jiti`](https://github.com/unjs/jiti) in the main process. Entries can be `.ts` or `.js` files on disk and do not require rebuilding the Electron app.

UIX configures jiti with `moduleCache: false`: reloading evaluates the current source for the same path instead of returning a stale Node module instance.

jiti is not a sandbox. Extensions are trusted local code and run with the permissions of the Electron main process.

## Lifetime and reload

Everything an extension registers through the injected API is owned by that extension activation's `DisposableBag`. All extension activation bags live under one `extensionsBag` child of `appBag`.

Cockpit reload calls the same load path used at startup:

1. discover extension packages from disk;
2. clear `extensionsBag`;
3. activate all discovered UIX entries into the same reusable bag.

Discovery is side-effect-free and runs before clearing, so a discovery-only substrate failure leaves the current extension tree active. Once activation starts, old contributions are gone; per-entry import/factory failures are reported in the activation result and sibling entries continue loading.

Concurrent load/reload calls share one in-flight Promise so clear/activate never overlaps itself.

The renderer bridge exposes cockpit reload as:

```ts
await window.uix.reload();
```

Today this reloads UIX extensions and, if a pi session already exists, delegates to pi's native `session.reload()` path.

## Current API surface

The current UIX extension API has one method:

- `registerCommand(name, options)` — logs/registers a command-shaped contribution with lifetime cleanup. The registered command is not currently invokable through UIX.

See [`contributions.md`](./contributions.md), [`lifetimes.md`](./lifetimes.md).
