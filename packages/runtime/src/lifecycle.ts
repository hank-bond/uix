// Provides disposable helpers that clean up app, window, and component resources with their owners.
//
// The concrete lifetime scopes: the runtime bag owns the feature composition,
// workspace settings, the agent driver, and the facet registries. A child
// features bag clears on feature reload and disposes on shutdown. Each feature
// activation gets its own provisional bag that joins the features bag only
// after successful activation. The agent driver keeps an internal bag for Pi
// event subscriptions and live session cleanup.
//
// The rule: every attached callback produces a Disposable, and that
// Disposable goes into a bag that's torn down together. This makes
// "register" and "cleanup" structurally inseparable, so you can't
// register something and forget to clean it up.
//
// What "Disposable" means here:
//   - It's a TC39 standard interface: `{ [Symbol.dispose](): void }`.
//   - A caller cleans up anything implementing that shape via the
//     method, or by using `using x = ...` (lexical-scope auto-dispose).
//   - The TypeScript `Disposable` type comes from the `ESNext.Disposable`
//     lib (added to both tsconfigs in this commit).
//
// Why a "Bag" (and not just `using` everywhere):
//   - `using` cleans up at the end of the enclosing block. Great when a
//     resource's lifetime is exactly that block.
//   - Our subscriptions outlive the function that creates them. They
//     live for the driver's lifetime, or the runtime's. For those, we need
//     a container we explicitly dispose later. That's the Bag.

import process from "node:process";

import type { Logger } from "./log";

/**
 * A collection of Disposables that are torn down together, in LIFO
 * order, when the bag itself is disposed. Roughly equivalent to
 * VSCode's `DisposableStore` or .NET's `CompositeDisposable`.
 *
 * Usage:
 *   const bag = new DisposableBag();
 *   bag.add(handle(...))   // register a channel endpoint
 *   bag.add(subscribe(...)) // listen to a live session
 *   // ...later, when this lifetime ends:
 *   bag[Symbol.dispose]();
 */
export class DisposableBag implements Disposable {
  #items: Disposable[] = [];
  #disposed = false;

  /**
   * Add a Disposable to this bag. Returns the same Disposable so
   * you can chain (`const sub = bag.add(subscribe(...))`).
   *
   * If the bag is already disposed, the item is disposed immediately;
   * this prevents "added after teardown" leaks if something races.
   */
  add<D extends Disposable>(item: D): D {
    if (this.#disposed) {
      try {
        item[Symbol.dispose]();
      } catch {
        // Swallow: we're past cleanup. Nothing useful to do here.
      }
      return item;
    }
    this.#items.push(item);
    return item;
  }

  /** Dispose all current items (LIFO) but keep the bag reusable. */
  clear(): void {
    this.#drain();
  }

  [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#drain();
  }

  #drain(): void {
    // LIFO: tear down in reverse acquisition order so dependents
    // go first. (You added the listener after creating the thing it
    // listens to, so dispose the listener first.)
    while (this.#items.length > 0) {
      const item = this.#items.pop();
      if (!item) break;
      try {
        item[Symbol.dispose]();
      } catch {
        // Continue tearing down siblings even if one throws.
      }
    }
  }
}

/** Wrap an arbitrary cleanup callback as a Disposable. */
export function disposable(cleanup: () => void): Disposable {
  return { [Symbol.dispose]: cleanup };
}

/** Listen once for cancellation and make removal explicit. */
export function onAbort(signal: AbortSignal, listener: () => void): Disposable {
  if (signal.aborted) {
    listener();
    return disposable(() => {});
  }
  signal.addEventListener("abort", listener, { once: true });
  return disposable(() => {
    signal.removeEventListener("abort", listener);
  });
}

/**
 * Subscribe to anything that follows the "subscribe returns an
 * unsubscribe function" pattern (e.g. Pi's `AgentSession.subscribe`,
 * many other observable libraries).
 */
export function subscribe<E>(
  target: { subscribe(listener: (event: E) => void): () => void },
  listener: (event: E) => void,
): Disposable {
  const unsubscribe = target.subscribe(listener);
  return disposable(unsubscribe);
}

/**
 * Install global process-level error handlers.
 *
 * `uncaughtException` and `unhandledRejection` cover errors that
 * escape the synchronous and asynchronous call stacks respectively.
 * Without these handlers, an unhandled rejection inside an
 * extension's timer (or a stray async/await anywhere in the main
 * process) would either silently kill the process or print to
 * stderr with no structured attribution.
 *
 * We don't try to attribute errors to a specific extension here;
 * that would require parsing stack traces for entry-file URLs,
 * which is fragile (paths get transformed, third-party frames
 * dominate the top of the stack). Logs go out as
 * `unhandled_exception` / `unhandled_rejection` from the logger
 * you pass in. If we ever need real attribution, we'll layer it
 * on top of these handlers, not redesign them.
 *
 * Returns a Disposable that unregisters the handlers. In practice
 * the bag lives for the whole app, so the unregister path mostly
 * matters for tests.
 */
export function installProcessHandlers(log: Logger): Disposable {
  const normalize = (thrown: unknown): Error =>
    thrown instanceof Error ? thrown : new Error(String(thrown));

  const onException = (err: unknown): void => {
    const e = normalize(err);
    log.error({ err: e.message, stack: e.stack }, "unhandled_exception");
  };
  const onRejection = (reason: unknown): void => {
    const e = normalize(reason);
    log.error({ err: e.message, stack: e.stack }, "unhandled_rejection");
  };

  process.on("uncaughtException", onException);
  process.on("unhandledRejection", onRejection);
  return disposable(() => {
    process.off("uncaughtException", onException);
    process.off("unhandledRejection", onRejection);
  });
}
