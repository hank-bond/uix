// Trellis cockpit — lifecycle helpers (main process).
//
// The rule: every callback registration produces a Disposable, and that
// Disposable goes into a bag that's torn down together. This makes
// "register" and "cleanup" structurally inseparable, so you can't
// register something and forget to clean it up.
//
// What "Disposable" means here:
//   - It's a TC39 standard interface: `{ [Symbol.dispose](): void }`.
//   - Anything implementing that shape can be cleaned up by calling the
//     method, or by using `using x = ...` (lexical-scope auto-dispose).
//   - The TypeScript `Disposable` type comes from the `ESNext.Disposable`
//     lib (added to both tsconfigs in this commit).
//
// Why a "Bag" (and not just `using` everywhere):
//   - `using` cleans up at the end of the enclosing block. Great when a
//     resource's lifetime is exactly that block.
//   - Our subscriptions outlive the function that creates them — they
//     live for the driver's lifetime, or the app's. For those, we need
//     a container we explicitly dispose later. That's the Bag.

import { app, BrowserWindow, ipcMain } from "electron";

/**
 * A collection of Disposables that are torn down together, in LIFO
 * order, when the bag itself is disposed. Roughly equivalent to
 * VSCode's `DisposableStore` or .NET's `CompositeDisposable`.
 *
 * Usage:
 *   const bag = new DisposableBag();
 *   bag.add(handle(...));   // register an IPC channel
 *   bag.add(onApp(...));    // listen to an app event
 *   // ...later, when this lifetime ends:
 *   bag[Symbol.dispose]();
 */
export class DisposableBag implements Disposable {
  #items: Disposable[] = [];
  #disposed = false;

  /**
   * Register a Disposable with this bag. Returns the same Disposable so
   * you can chain (`const sub = bag.add(subscribe(...))`).
   *
   * If the bag is already disposed, the item is disposed immediately —
   * this prevents "added after teardown" leaks if something races.
   */
  add<D extends Disposable>(item: D): D {
    if (this.#disposed) {
      try {
        item[Symbol.dispose]();
      } catch {
        // Swallow: we're past cleanup; nothing useful to do here.
      }
      return item;
    }
    this.#items.push(item);
    return item;
  }

  [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    // LIFO: tear down in reverse order of registration so dependents
    // go first. (You added the listener after creating the thing it
    // listens to, so dispose the listener first.)
    while (this.#items.length > 0) {
      const item = this.#items.pop()!;
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

// ─── Electron-side registration helpers ──────────────────────────────
//
// Each helper performs the registration and returns a Disposable that
// undoes it. Project policy (enforced by convention for now, eslint
// later): code that needs to register a listener uses these helpers
// instead of calling `ipcMain.handle`, `app.on`, etc. directly.

/**
 * Register an `ipcMain.handle` invoke endpoint. Returns a Disposable
 * that removes the handler when disposed.
 */
export function handle<Req, Res>(
  channel: string,
  fn: (req: Req) => Res | Promise<Res>,
): Disposable {
  ipcMain.handle(channel, (_event, req: Req) => fn(req));
  return disposable(() => ipcMain.removeHandler(channel));
}

/**
 * Listen for an `app` event. Typed against the small union of events we
 * actually use — extend `AppEvent` as we adopt more.
 */
type AppEvent = "activate" | "will-quit" | "window-all-closed";

export function onApp(event: AppEvent, listener: () => void): Disposable {
  app.on(event, listener);
  return disposable(() => {
    app.off(event, listener);
  });
}

/**
 * Listen for a `BrowserWindow` event. Same idea as `onApp`; we only
 * need `closed` today.
 */
type WindowEvent = "closed";

export function onWindow(
  win: BrowserWindow,
  event: WindowEvent,
  listener: () => void,
): Disposable {
  win.on(event, listener);
  return disposable(() => {
    win.off(event, listener);
  });
}

/**
 * Subscribe to anything that follows the "subscribe returns an
 * unsubscribe function" pattern (e.g. pi's `AgentSession.subscribe`,
 * many other observable libraries).
 */
export function subscribe<E>(
  target: { subscribe(listener: (event: E) => void): () => void },
  listener: (event: E) => void,
): Disposable {
  const unsubscribe = target.subscribe(listener);
  return disposable(unsubscribe);
}
