---
summary: "Code conventions for the cockpit — lifetimes, naming, capability handles, comments, accessible UI, module exports, validation, logging, imports, and lifecycle helpers."
status: active
---

# Conventions

Short, opinionated rules. Each one buys back review effort by making a class of bugs hard to write. Most are main-process specifics (lifetimes, logging, imports); **Naming** and **Comments** apply to all UIX code — renderer, shared, and extensions included.

## Lifetime management (main process)

**Rule.** Don't call `ipcMain.handle`, `webContents.send`, `app.on`, `BrowserWindow.on`, or anything that follows the "register a listener and forget it" shape directly. IPC crossings go through `src/main/ipc.ts` — `handle()` for invoke endpoints, `send()` for pushes to a window — so every crossing lands in the wire log. Everything else uses the helpers in `src/main/lifecycle.ts`. Put what the registration helpers return into a `DisposableBag` whose lifetime matches the thing being listened for.

**Why.** Registration without un-registration is the most common leak pattern in Electron and observable-style code. The helpers return a `Disposable`; the bag enforces that you have _somewhere_ for the disposable to live. You can't register without picking a lifetime, and disposing the lifetime is one call.

**Pattern.**

```ts
import * as ipc from "./ipc";
import { DisposableBag, onApp, subscribe } from "./lifecycle";

const bag = new DisposableBag();

bag.add(ipc.handle("uix:prompt", (req) => { ... }));
bag.add(onApp("activate", () => { ... }));
bag.add(subscribe(session, (event) => { ... }));

ipc.send(win, "uix:agentEvent", event); // push, not a registration — no bag

// later, when this lifetime ends:
bag[Symbol.dispose]();
```

**Exceptions.** One-shot process-end events (`will-quit`, `window-all-closed`) can be registered raw — there is no useful moment to remove them. Comment the call to explain why.

**Disposable values.** Anything with non-trivial cleanup should implement `Disposable` (or be wrappable with `disposable(() => ...)`). A function whose return value is `Disposable` cannot be discarded silently without it leaking — make sure every call site routes it into a bag or `using`.

## State ownership and asynchronous coordination

**Rule.** Name one authority for current state and keep asynchronous work, cleanup, lookup, and caching separate from it.

**Terminology.** A **generation** is a real replaceable object/lifetime graph, such as a manifest, feature activation, or Pi runtime generation. A **version** is a monotonic scalar that orders async work and rejects stale results (`requestVersion`, `buildVersion`). An **id** or **token** correlates one operation without implying order. Do not call an ordering counter a generation.

| Mechanism | Role | Constraint |
| --- | --- | --- |
| Plain field, React state, registry, buffer, or store | Current authority at its layer | Replaced at one explicit generation boundary. |
| Promise slot | Shared in-flight operation | Cleared when the operation settles; it is not mutable current state. |
| `DisposableBag` or React effect cleanup | Deterministic lifetime | Owns teardown only, never lookup or current-state selection. |
| `WeakMap` | Metadata or memo derived from an externally owned object | Use only when the value needs no deterministic cleanup and entries need no enumeration. |
| `Map` / `Set` | Owned live index or temporary algorithmic index | If it is a registry, expose registration/disposal semantics rather than a raw collection. |
| Cache / projection | Regenerable derived data | State the invalidation or latest-generation commit rule. |
| Store / durable settings / Pi session entries | Durable authority | Runtime collections and renderer state remain rebuildable from it. |

For replaceable asynchronous state, keep the current value and shared operation distinct:

```ts
let current: Value | undefined;
let inFlightLoad: Promise<Value> | undefined;

function getValue(): Promise<Value> {
  if (current) return Promise.resolve(current);
  if (inFlightLoad) return inFlightLoad;

  const load: Promise<Value> = createValue()
    .then((value) => {
      current = value;
      return value;
    })
    .finally(() => {
      if (inFlightLoad === load) inFlightLoad = undefined;
    });
  inFlightLoad = load;
  return load;
}
```

A settled promise may own a genuinely write-once value when it is immutable for the owner's entire lifetime and every consumer is asynchronous. Once a value supports replacement, synchronous reads, reload, or generation-specific cleanup, use an explicit current value plus an in-flight operation.

Async projections need two independent protections where applicable: lifetime cancellation rejects results after their owner unmounts/disposes, while a monotonic request version rejects an older request that resolves after a newer one. A boolean `alive` flag provides only the first. Backend candidate builders likewise commit only if their build version is still current, or serialize operations when every requested transition must run.

Layer-specific cleanup stays idiomatic: main-process registrations go into lifetime-named bags; renderer subscriptions and requests use React effect cleanup plus latest-request guards. Do not introduce a generic lazy-cell abstraction until multiple consumers need identical mechanics—the explicit fields make ownership and replacement visible.

## Naming

- A `DisposableBag` that owns registrations is named after the lifetime it tracks: `appBag`, `windowBag`, `sessionBag`.
- Helpers that register listeners are verb-shaped: `handle`, `onApp`, `onWindow`, `subscribe`. They always return `Disposable`.
- Function names describe the observable contract from the caller's perspective. Include every distinction needed to predict the result; omit implementation details that do not change what callers receive or observe.
- Apply the ambiguity test: if two materially different operations could reasonably share the name, it is underspecified. Add the distinguishing domain, result, or resolution axis — `enumerateUniqueModifierSequences`, not `permutations`; `resolveShortcutForPlatform`, not `resolveShortcut`.
- Domain vocabulary is noun-shaped; operations pair those nouns with the established verbs below. A domain noun keeps one grammatical role across types, values, and function results.
- Parameters name each participant's domain role (`transport`, `contract`, `scope`, `owner`, `session`, `lifetime`, `bag`). Access restrictions live in scoped capability types and handles.
- A domain catalog is `XCatalog`; one public item is `XCatalogEntry`. Reserve these names for the catalog concept defined in [concepts](./concepts.md), not arbitrary lists or snapshots; avoid the generic `Descriptor` suffix when the value's actual role is a catalog entry.
- Private helper functions should generally be operation-shaped so the call site says what operation is happening. Prefer:
  - `parseX` for unknown/external input that validates into `X`; invalid input throws;
  - `asX` / `tryParseX` for non-throwing refinement/parsing helpers that return `X | undefined`;
  - `extractX` for pulling data out of a larger value;
  - `enumerateX` for eagerly deriving every member of a finite possibility set; `listX` retrieves existing items instead of generating possibilities;
  - `getX` for cheap property lookup with no I/O;
  - `requireX` for retrieving an expected value and throwing when absent;
  - `toX` for a deterministic, side-effect-free representation of the same underlying thing; the result has value semantics, no independent identity, and is safe to discard and recompute;
  - `deriveX` for a new immutable value computed through filtering, joining, folding, reduction, or domain policy; the result has value semantics and remains rebuildable from authoritative inputs;
  - `encodeX` / `decodeX` for reversible representation transforms;
  - `isX` / `hasX` for predicates and type guards;
  - `readX` only for real reads from disk, stores, streams, or similarly I/O-shaped sources.
- Module-level and lifecycle verbs. Each verb earns its slot by meaning something the others don't; don't introduce a synonym when an existing verb fits:
  - `createX` for constructing a domain instance or independently identified artifact from known inputs. The result has instance semantics: its identity or evolving state matters, it is used over time, and an owner receives responsibility for it.
  - `buildX` is **reserved for compilation/bundling pipelines** (the surface module pipeline's esbuild passes). Plain object assembly is `createX`, not `buildX`.
  - `readX` (disk → parsed data, no runtime side effects) vs `loadX` (persisted or external content → its **live, registered runtime form**; side effects expected — `loadFeatures`, `loadScope`). A load typically contains a read.
  - `hydrateX` for the pure schema pass between the two: fill defaults into persisted values and validate, no storage or registration (`hydrateSettings`).
  - `openX` for starting a long-lived stateful thing whose lifetime someone must own (`openWorkspace`, `openSession`).
  - `registerX` for putting an item into a registry; registries' own mutation methods use the same verb (`register`, `registerScope`).
  - `resolveX` for mapping a reference to the concrete thing it denotes (`resolveWorkspace`); include a result-determining axis when the unqualified name permits materially different resolutions (`resolveShortcutForPlatform`).
  - `bindX` for establishing a removable or replaceable relationship among independently existing participants (`bindSettingsHandle`, `bindActionKeyboardDispatcher`). The relationship is enrolled in an explicit lifetime while the participants retain their own lifetimes; construction and binding are separate operations when the instance and relationship have independent lifetimes.
  - `commitX` for accepting validated candidate state into an authority at an explicit boundary (`registration.commit()`, `commitTurnStateBeforeSubmit`).
  - `restoreX` for replacing live state from previously committed state or referenced snapshots.
  - `defineX` for public-API identity/type-checking helpers around plain data (`defineSettings`, `defineSurface`).
  - `forX(id)` for minting a capability handle scoped to one owner (`forScope`); see the handle convention below.
- State-shape nouns carry these meanings:
  - A **snapshot** is an immutable point-in-time value or independently identified artifact. `toSnapshot()` converts one live value to its snapshot representation; `createDocumentSnapshot()` creates a store-owned artifact; `getCatalogSnapshot()` retrieves an existing current snapshot.
  - A **projection** is a purpose-specific, read-only, lower-information view of authoritative state. It is rebuildable and never independently authoritative; a physically persisted projection has cache semantics. Use `deriveXProjection()` for a one-shot derivation.
  - A **baseline** is the reference value used for comparison by a later operation; it remains derived unless its owning domain commits it.
- React components are the exception: keep PascalCase noun names such as `Conversation` or `ChoiceButton`.
- Anything implementing `Disposable` is fine to add to a bag — no ceremony needed.
- Use `Store` for durable source-of-truth APIs/implementations. A store may expose a change feed when the change semantics are generic at that layer; otherwise domain-specific buffers/features publish higher-level invalidation events.
- Use `Buffer` for live, feature-specific working projections over a store. Buffers may cache regenerable state, normalize writes, and reconcile feature/editor semantics, but durable authority stays in the backing store.
- Use `Registry` for central in-memory maps of contributed things plus their routing (`ChannelRegistry`, `SettingsRegistry`); registries don't persist.

### Projection naming

Describe a projection along the axes that determine materially different results. Not every projection uses every axis, and a symbol need not repeat facts intrinsic to its domain, but its names, parameters, and result fields together must let a caller predict the view.

| Axis | Question | Naming pattern |
| --- | --- | --- |
| **Sources** | Which authoritative inputs are viewed? | Name the domain sources in the projection or its parameters. |
| **Viewpoint** | From which contextual coordinate are the sources interpreted? | `AsOfX` for a position in ordered history; `ForX` for an observer or environment. |
| **Selection** | Which source facts participate? | Use domain qualifiers such as `active`, `visible`, `offered`, or `unresolved`. |
| **Correlation** | How are facts from different sources or positions joined? | `ByX` names a lookup or join key (`bindingByActionId`, `resultByToolCallId`). |
| **Partition** | Which groups are reduced independently? | `PerX` names the partition (`latestValuePerCell`, `claimantsPerShortcut`). |
| **Reduction** | How does each partition become a result? | Name the policy before the partition: `latestValuePerCell`, `countPerStatus`, `averageLatencyPerWindow`. |
| **Result shape** | What consumer-facing view is produced? | Use the domain noun: `TranscriptSnapshot`, `ActionBindingProjection`, `ProviderAuthCatalog`. |

A **projector** is the stateful derivation component used when cross-entry correlation or one shared source traversal requires incremental state. Name its factory `createXProjector`; `projectX(...)` incorporates one source fact into private derivation state; a receiver-qualified `deriveX()` returns the immutable result. For example:

```ts
const transcriptProjector = createTranscriptProjector();
const turnStateProjector = createTurnStateProjector(registry);

for (const entry of branch) {
  transcriptProjector.projectEntry(entry);
  turnStateProjector.projectEntry(entry);
}

return {
  transcript: transcriptProjector.deriveSnapshot(),
  turnStateAsOfLeaf: turnStateProjector.deriveAsOfLeaf(),
};
```

Current projections apply the axes as follows:

| Projection | Viewpoint | Selection / correlation | Partition / reduction | Result |
| --- | --- | --- | --- | --- |
| Selected branch | `asOfLeaf` | Displayable messages; registered turn-state cells; tool results joined by tool-call id | Ordered transcript; latest value per cell | `SelectedBranchProjection` with `transcript` and `turnStateAsOfLeaf.latestValuePerCell` |
| Action bindings | `forPlatform` | Active actions joined to confirmed bindings by action id; inactive bindings split out as unresolved | Conflict claimants collected per resolved shortcut | `ActionBindingProjection` |
| Provider authentication | `forEnvironment` | Offered model/OAuth providers joined with auth state and setup recipes | Methods composed per presentation provider and ranked for display | `ProviderAuthCatalog` |
| Canvas anchors | `asOfDocumentVersion` or current working content | Addressable text joined to retained anchor identity | Anchor continuity reconciled per document and line | `AnchoredDocument` working projection |

## Central ownership, capability handles

**Rule.** State lives in one central owner (a store or registry); consumers never get the owner itself. They get a **handle**: a small object of functions closed over exactly the slice they may touch, minted by the owner (`forX(id)`, an accessor returning a location, an owner-scoped factory). A handle's method signatures carry no addressing parameter — the closure already chose the target.

**Why.** Hiding by construction, not enforcement. Code that only holds `get(key)` cannot _accidentally_ couple to another owner's slice; a module's entire reach is legible from the handles its context receives; and because nothing crosses the boundary except what the handle carries, moving consumers to another process later is a mechanical transport swap, not a redesign. This is a trust-model convention, not a sandbox — in-process code can always escape a closure if it tries; containment for untrusted code is the iframe transport's job.

**Pattern.** The same shape at every layer:

```ts
// registry mints a scope-bound settings handle: get(key), not get(scopeId, key)
const settings = registry.forScope(featureId);

// store mints a location: two methods over one tree position, path pre-bound
const location = manifest.settingsNamespace("agent");

// FeatureContext is a bag of these: settings handle, publisher factory
// scoped to the feature id, id-scoped logger, per-feature DisposableBag
```

Two corollaries:

- **The owner's own API may be open** (`registry.get(scopeId, key)`) for trusted composition-root code and channel handlers; the narrowing happens at the point where a handle is doled out, and each consumer gets the narrowest handle that serves it.
- **Handles resolve lazily by id, not by captured object reference**, wherever the owner's contents can be replaced underneath (reload). A handle minted before a reload keeps working after it; an unknown target fails on first _use_, not at mint time.

## Comments

**Rule.** A comment explains _why_ this code is here, not _what_ it does. If a comment is needed to follow what the code does, that is a naming problem — rename until the code reads on its own, then delete the comment.

**No planning artifacts.** Plan phases (`C3`), stage numbers, ticket ids, `v0` — none belong in code. They are a parallel vocabulary that means nothing to a later reader and goes stale the moment the plan moves on. The same applies to links to dated decision/design/plan docs: the rationale they hold churns independently of the code, so a citation becomes a re-validation cost (open the doc, check it still applies) rather than a help. A pointer to a living style doc (this file) is the exception — it tracks a stable convention, not a point-in-time decision.

**Only stable placement context.** Keep a comment only when its context is both (a) necessary to place the code in the system and (b) unlikely to change across revisions. If a reader could rediscover the context ad-hoc — who calls this, how it is wired — leave it out; rediscovery is cheaper than keeping a comment honest. Comments that narrate _future_ intentions ("a `diff` method joins here when versioning lands") are the most expensive kind: unverifiable, and they rot silently.

**What earns a comment.** A warning or an explanation the code cannot carry itself: "this must not move or the session file is orphaned," "read defensively because pi may add block kinds," "order is load-bearing — pi has no priority field." Each saves a reader from a wrong assumption.

## Accessible UI

**Rule.** Preserve equivalent meaning and operation across visual, keyboard, and accessibility-tree presentations. Prefer browser standards and semantic HTML; use ARIA only to fill a semantic gap.

Apply these rules in order:

1. **Use the native element.** Prefer `button`, `dialog`, `label`, `fieldset`/`legend`, headings, lists, and native state such as `disabled`. Use the browser's interaction behavior instead of rebuilding its keyboard, focus, or modal semantics.
2. **Give every control an accessible name.** Visible text is the first choice. When a visual treatment conveys extra meaning, add visually hidden DOM text. Reserve `aria-label` for controls without an adequate textual name; when it is necessary, include any visible label text in the accessible name.
3. **Use ARIA for the exact missing semantic.** Examples: `aria-expanded` for disclosure state, `aria-labelledby` for a relationship to visible text, and `aria-describedby` for supplemental instructions. Do not duplicate native semantics or use an unrelated ARIA state because it sounds close.
4. **Choose hiding deliberately.** `display: none` removes content from visual and accessibility presentation; visually hidden content remains available non-visually; `aria-hidden="true"` excludes otherwise rendered content from the accessibility tree and is only for redundant/decorative presentation.
5. **Do not rely on color alone.** Pair color with text, shape, border weight, iconography, or another perceptible cue, and expose the same meaning semantically.
6. **Preserve keyboard and focus behavior.** Every action is keyboard-operable, focus remains visibly indicated, transient UI chooses a useful initial focus, and closing it restores focus to a durable invoking control.
7. **Label and group forms natively.** Every input has an associated `label`; placeholders are hints, not labels. Related choices use `fieldset` and `legend`. Associate field help or validation details with `aria-describedby` when needed.
8. **Announce meaningful asynchronous changes.** Use `role="status"` for polite progress and completion updates. Use `role="alert"` sparingly for failures requiring immediate attention; ordinary instructions and validation hints remain normal or described text.
9. **Respect presentation preferences.** Nonessential motion honors `prefers-reduced-motion`, and text, controls, focus indicators, and state cues maintain sufficient contrast.

A visually hidden helper must clip content rather than use `display: none` or `visibility: hidden`, because those remove it from the accessibility tree. Keep the helper local until a second consumer justifies a shared renderer utility.

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
