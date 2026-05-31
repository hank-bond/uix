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

## Logging

**Rule.** Use `createLogger(component)` from `src/main/log.ts`. Don't
call `console.log` / `console.warn` / `console.error` directly in
main-process code.

**Why.** Pino gives us levels, structured fields, child loggers (free
attribution), pretty-printed dev output, and JSON in prod — with one
import. Ad-hoc `console.*` calls drift in format, can't be filtered,
and make extension attribution awkward.

**Shape.**

```ts
import { createLogger } from "./log";

const log = createLogger("extensions");

log.info({ count: roots.length }, "scanning_roots");
log.warn({ dir, err: e.message }, "root_unreadable");
log.error({ extension: id, err: e.message }, "activate_failed");
```

**Conventions.**

- **Message = lowercase snake_case event identifier.** Past tense for
  completed events (`extension_activated`), present tense for
  in-progress (`scanning_roots`). Stable across reword — grep-friendly.
- **All context in the fields object.** Never interpolate state into
  the message string.
- **Component is the subsystem.** `extensions`, `main`, `agent`,
  `channels`. No `trellis.` prefix — it's implied. Don't repeat the
  component name in the event (`activated`, not `extension_activated`,
  when the component is `extensions`).
- **Per-instance child loggers** for attribution: when handling many
  things of the same kind (extensions, sessions, panes), make a child:
  `const elog = log.child({ extension: id })`. Every line from `elog`
  carries the id automatically.
- **`err` field for errors.** Pass the error message string
  (`err: e.message`) or the Error object itself (pino serializes it).
  Don't stringify into the message.
- **Levels.** `info` for lifecycle, `warn` for recoverable trouble
  worth a human's attention, `error` for failures. `debug` exists
  (enable with `TRELLIS_LOG_LEVEL=debug`) for high-volume diagnostic
  trails.

## When to add a new lifecycle helper

When you need to register something cleanup-requiring and the call site
would otherwise reach for a raw API (`addEventListener`, an emitter's
`.on`, a library's `.subscribe`, `setInterval`, etc.), add a small
helper to `src/main/lifecycle.ts` that wraps it and returns a
`Disposable`. The helper is ~5 lines; the convention is preserved.
