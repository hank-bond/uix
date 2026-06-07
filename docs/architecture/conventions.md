---
summary: "Code conventions for the cockpit: lifetimes, naming, comments, module exports, validation, logging, imports, and lifecycle helpers. Most are main-process; naming and comments apply to all UIX code. Read when writing or reviewing UIX code."
status: active
---

# Conventions

Short, opinionated rules. Each one buys back review effort by making a class of bugs hard to write. Most are main-process specifics (lifetimes, logging, imports); **Naming** and **Comments** apply to all UIX code — renderer, shared, and extensions included.

## Lifetime management (main process)

**Rule.** Don't call `ipcMain.handle`, `app.on`, `BrowserWindow.on`, or anything that follows the "register a listener and forget it" shape directly. Use the helpers in `src/main/lifecycle.ts`, and put what they return into a `DisposableBag` whose lifetime matches the thing being listened for.

**Why.** Registration without un-registration is the most common leak pattern in Electron and observable-style code. The helpers return a `Disposable`; the bag enforces that you have _somewhere_ for the disposable to live. You can't register without picking a lifetime, and disposing the lifetime is one call.

**Pattern.**

```ts
import { DisposableBag, handle, onApp, subscribe } from "./lifecycle";

const bag = new DisposableBag();

bag.add(handle("uix:prompt", (req) => { ... }));
bag.add(onApp("activate", () => { ... }));
bag.add(subscribe(session, (event) => { ... }));

// later, when this lifetime ends:
bag[Symbol.dispose]();
```

**Exceptions.** One-shot process-end events (`will-quit`, `window-all-closed`) can be registered raw — there is no useful moment to remove them. Comment the call to explain why.

**Disposable values.** Anything with non-trivial cleanup should implement `Disposable` (or be wrappable with `disposable(() => ...)`). A function whose return value is `Disposable` cannot be discarded silently without it leaking — make sure every call site routes it into a bag or `using`.

## Naming

- A `DisposableBag` that owns registrations is named after the lifetime it tracks: `appBag`, `windowBag`, `sessionBag`.
- Helpers that register listeners are verb-shaped: `handle`, `onApp`, `onWindow`, `subscribe`. They always return `Disposable`.
- Anything implementing `Disposable` is fine to add to a bag — no ceremony needed.

## Comments

**Rule.** A comment explains _why_ this code is here, not _what_ it does. If a comment is needed to follow what the code does, that is a naming problem — rename until the code reads on its own, then delete the comment.

**No planning artifacts.** Plan phases (`C3`), stage numbers, ticket ids, `v0` — none belong in code. They are a parallel vocabulary that means nothing to a later reader and goes stale the moment the plan moves on. The same applies to links to dated decision/design/plan docs: the rationale they hold churns independently of the code, so a citation becomes a re-validation cost (open the doc, check it still applies) rather than a help. A pointer to a living style doc (this file) is the exception — it tracks a stable convention, not a point-in-time decision.

**Only stable placement context.** Keep a comment only when its context is both (a) necessary to place the code in the system and (b) unlikely to change across revisions. If a reader could rediscover the context ad-hoc — who calls this, how it is wired — leave it out; rediscovery is cheaper than keeping a comment honest. Comments that narrate _future_ intentions ("a `diff` method joins here when versioning lands") are the most expensive kind: unverifiable, and they rot silently.

**What earns a comment.** A warning or an explanation the code cannot carry itself: "this must not move or the session file is orphaned," "read defensively because pi may add block kinds," "order is load-bearing — pi has no priority field." Each saves a reader from a wrong assumption.

## Module API surface

**Rule.** Don't export a symbol until another module needs to import that symbol by name.

**Why.** Every export is a small API commitment. Keeping internal helper types and constants private until they have a real consumer makes refactors cheaper and makes ownership clearer.

**Pattern.** An exported function may use a private parameter interface:

```ts
interface CreateThingOptions {
  onChange: () => void;
}

export function createThing(opts: CreateThingOptions) {
  opts.onChange();
}
```

Callers still get type checking and autocomplete when passing object literals:

```ts
createThing({ onChange: notify });
```

Export `CreateThingOptions` later, in the same change that introduces a real caller that needs to name/import it.

**Exception.** Public API modules (for example `@uix/api` types) intentionally export stable shapes for extension authors. Those are designed API surfaces, not internal implementation details.

## Validation

**Rule.** Use boolean guards only when the caller has a real branch to make. If failure always means "stop here," expose an assertion helper instead.

**Shape.**

```ts
export function isCanvasKey(key: string): boolean {
  return canvasKeyPattern.test(key);
}

export function assertCanvasKey(key: string): void {
  if (!isCanvasKey(key)) {
    throw new Error(invalidCanvasKeyMessage(key));
  }
}
```

Call sites that cannot recover should say what they mean:

```ts
assertCanvasKey(key);
```

instead of repeating:

```ts
if (!isCanvasKey(key)) {
  throw new Error(...);
}
```

**Custom errors.** Start with plain `Error` and a clear message. Add a custom `Error` subclass only when a caller needs to branch on the failure type (e.g. `err instanceof InvalidCanvasKeyError`). Until then, assertion helpers keep the call sites stable if the thrown error type changes later.

## Logging

**Rule.** Use `createLogger(component)` from `src/main/log.ts`. Don't call `console.log` / `console.warn` / `console.error` directly in main-process code.

**Why.** Pino gives us levels, structured fields, child loggers (free attribution), pretty-printed dev output, and JSON in prod — with one import. Ad-hoc `console.*` calls drift in format, can't be filtered, and make extension attribution awkward.

**Shape.**

```ts
import { createLogger } from "./log";

const log = createLogger("extensions");

log.info({ count: roots.length }, "scanning_roots");
log.warn({ dir, err: e.message }, "root_unreadable");
log.error({ extension: id, err: e.message }, "activate_failed");
```

**Conventions.**

- **Message = lowercase snake_case event identifier.** Past tense for completed events (`extension_activated`), present tense for in-progress (`scanning_roots`). Stable across reword — grep-friendly.
- **All context in the fields object.** Never interpolate state into the message string.
- **Component is the subsystem.** `extensions`, `main`, `agent`, `channels`. No `uix.` prefix — it's implied. Don't repeat the component name in the event (`activated`, not `extension_activated`, when the component is `extensions`).
- **Per-instance child loggers** for attribution: when handling many things of the same kind (extensions, sessions, panes), make a child: `const elog = log.child({ extension: id })`. Every line from `elog` carries the id automatically.
- **Don't use bare `name` as a field.** Pino-pretty interprets `name` as the logger's display name and pulls it into the rendered header, causing confusing output like `INFO (hello): (extensions) package` when you meant `name: "hello"` as a regular field. More generally, prefer specific descriptive field names — `displayName` for human-readable labels, `packageName` / `commandName` / `toolName` for kind-specific ids, `extension` (key) + the id (value) for child-logger attribution (`{ extension: "hello" }`). Bare `name` is also ambiguous (whose name?) and worse for grepping than a specific term.
- **`err` field for errors.** Pass the error message string (`err: e.message`) or the Error object itself (pino serializes it). Don't stringify into the message.
- **Levels.** `info` for lifecycle, `warn` for recoverable trouble worth a human's attention, `error` for failures. `debug` exists (enable with `UIX_LOG_LEVEL=debug`) for high-volume diagnostic trails.

## Imports

**Rule.** Import Node built-ins explicitly with the `node:` prefix, even the ones that are technically available as globals (`process`, `Buffer`).

(`__dirname` and `__filename` are _not_ covered — they're CJS module-level bindings, not importable values. Use them as-is in the main-process bundle, which electron-vite emits as CJS.)

```ts
import process from "node:process"; // not: just use the global
import path from "node:path";
import fs from "node:fs";
```

**Why.**

- **Visibility.** The import list is where a reader scans to see what a module touches. A module that reads `process.env` or `process.cwd()` has a real dependency on the runtime environment; surfacing it at the top of the file makes that legible.
- **Consistency.** We already import `path`, `fs`, `os` etc. as modules. Treating `process` the same way removes a special case.
- **Future lint enforcement.** This makes it easy to add a `no-restricted-globals` rule later — the rule has zero cleanup cost because we're already importing everywhere.

**Scope.** In practice, very few modules should need direct `process` access at all. Things that read env / cwd / platform should either be in the main module (`src/main/index.ts`) or be utilities that the main module wires together (`log.ts`, `lifecycle.ts`, `extensions/roots.ts`). Extension code never imports `process` directly — anything it needs about the runtime environment comes through the injected API surface.

## When to add a new lifecycle helper

When you need to register something cleanup-requiring and the call site would otherwise reach for a raw API (`addEventListener`, an emitter's `.on`, a library's `.subscribe`, `setInterval`, etc.), add a small helper to `src/main/lifecycle.ts` that wraps it and returns a `Disposable`. The helper is ~5 lines; the convention is preserved.
