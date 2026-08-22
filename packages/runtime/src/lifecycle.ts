// Provides synchronous and asynchronous lifetime bags plus disposable helpers.
//
// The concrete exclusive lifetime scopes include host process bindings,
// windows, feature compositions, workspace settings, and subscriptions. Child
// feature bags clear on reload and dispose on shutdown. Independently held
// shared objects such as workspaces and agent instances use supervisor-issued
// guards instead of bags or caller-managed reference counts.
//
// The rule: every attached callback produces a Disposable, and that
// Disposable goes into a bag that's disposed together. This makes
// "register" and "cleanup" structurally inseparable, so you can't
// register something and forget to clean it up.
//
// What the disposal protocols mean here:
//   - `Disposable` provides `{ [Symbol.dispose](): void }` for synchronous
//     cleanup, while `AsyncDisposable` provides an awaited counterpart.
//   - `using` and `await using` handle lexical ownership automatically.
//   - The TypeScript protocol types come from `ESNext.Disposable`.
//
// Why bags still exist:
//   - Lexical cleanup ends with the enclosing block.
//   - Subscriptions and workspace ownerships outlive their creating function.
//     Their longer-lived owner stores them in the matching synchronous or
//     asynchronous bag and disposes that bag when the owner ends.
//
// The Electron-specific lifetime helpers (window listeners, app events)
// stay in the Electron host under src/main/lifecycle.ts.

import process from "node:process";

import type { Logger } from "./log";

/**
 * A collection of Disposables that are disposed together, in LIFO
 * order, when the bag itself is disposed. Roughly equivalent to
 * VSCode's `DisposableStore` or .NET's `CompositeDisposable`.
 *
 * Usage:
 *   const bag = new DisposableBag();
 *   bag.add(handle(...))   // register an IPC channel
 *   bag.add(onApp(...))    // listen to an app event
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
    // LIFO: dispose in reverse acquisition order so dependents
    // go first. (You added the listener after creating the thing it
    // listens to, so dispose the listener first.)
    while (this.#items.length > 0) {
      const item = this.#items.pop();
      if (!item) break;
      try {
        item[Symbol.dispose]();
      } catch {
        // Continue disposing siblings even if one throws.
      }
    }
  }
}

/** A LIFO owner for mixed synchronous and asynchronous lifetimes. */
export class AsyncDisposableBag implements AsyncDisposable {
  #items: Array<Disposable | AsyncDisposable> = [];
  #tail: Promise<void> = Promise.resolve();
  #disposal: Promise<void> | undefined;
  #disposed = false;

  add<D extends Disposable | AsyncDisposable>(item: D): D {
    if (this.#disposed) {
      throw new Error("Async disposable bag is disposed");
    }
    this.#items.push(item);
    return item;
  }

  /** Dispose current items in order and keep the bag available for replacement. */
  clear(): Promise<void> {
    if (this.#disposed) {
      return Promise.reject(new Error("Async disposable bag is disposed"));
    }
    const clearing = this.#tail.then(() => this.#drain());
    this.#tail = clearing.catch(() => undefined);
    return clearing;
  }

  [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposal) return this.#disposal;
    this.#disposed = true;
    this.#disposal = this.#tail.then(() => this.#drain());
    return this.#disposal;
  }

  async #drain(): Promise<void> {
    const errors: unknown[] = [];
    while (this.#items.length > 0) {
      const item = this.#items.pop();
      if (!item) break;
      try {
        if (Symbol.asyncDispose in item) {
          await item[Symbol.asyncDispose]();
        } else {
          item[Symbol.dispose]();
        }
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Async disposable bag disposal failed");
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
 * the bag lives for the whole host, so the unregister path mostly
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
