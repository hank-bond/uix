# Conventions

Short, opinionated rules. Each one buys back review effort by making a
class of bugs hard to write.

## Lifetime management (main process)

**Rule.** Don't call `ipcMain.handle`, `app.on`, `BrowserWindow.on`, or
anything that follows the "register a listener and forget it" shape
directly. Use the helpers in `src/main/lifecycle.ts`, and put what they
return into a `DisposableBag` whose lifetime matches the thing being
listened for.

**Why.** Registration without un-registration is the most common leak
pattern in Electron and observable-style code. The helpers return a
`Disposable`; the bag enforces that you have *somewhere* for the
disposable to live. You can't register without picking a lifetime, and
disposing the lifetime is one call.

**Pattern.**

```ts
import { DisposableBag, handle, onApp, subscribe } from "./lifecycle";

const bag = new DisposableBag();

bag.add(handle("trellis:prompt", (req) => { ... }));
bag.add(onApp("activate", () => { ... }));
bag.add(subscribe(session, (event) => { ... }));

// later, when this lifetime ends:
bag[Symbol.dispose]();
```

**Exceptions.** One-shot process-end events (`will-quit`,
`window-all-closed`) can be registered raw — there is no useful moment
to remove them. Comment the call to explain why.

**Disposable values.** Anything with non-trivial cleanup should
implement `Disposable` (or be wrappable with `disposable(() => ...)`).
A function whose return value is `Disposable` cannot be discarded
silently without it leaking — make sure every call site routes it into
a bag or `using`.

## Naming

- A `DisposableBag` that owns registrations is named after the lifetime
  it tracks: `appBag`, `windowBag`, `sessionBag`.
- Helpers that register listeners are verb-shaped: `handle`, `onApp`,
  `onWindow`, `subscribe`. They always return `Disposable`.
- Anything implementing `Disposable` is fine to add to a bag — no
  ceremony needed.

## When to add a new lifecycle helper

When you need to register something cleanup-requiring and the call site
would otherwise reach for a raw API (`addEventListener`, an emitter's
`.on`, a library's `.subscribe`, `setInterval`, etc.), add a small
helper to `src/main/lifecycle.ts` that wraps it and returns a
`Disposable`. The helper is ~5 lines; the convention is preserved.
