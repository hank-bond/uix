// Electron-side lifetime helpers.
//
// Each helper attaches behavior and returns a Disposable that removes it.
// Project policy: code that needs to register a listener uses these helpers
// instead of calling `app.on`, `win.on`, etc. directly. The IPC boundary
// (`handle`/`send`) lives in ./ipc.ts, which follows the same convention.
//
// The host-neutral helpers (DisposableBag, disposable, onAbort, subscribe,
// installProcessHandlers) live in `@uix/runtime/lifecycle` and are re-exported
// here so main-process call sites keep one import path.

import {
  disposable,
  DisposableBag,
  installProcessHandlers,
  onAbort,
  subscribe,
} from "@uix/runtime/lifecycle";

export {
  disposable,
  DisposableBag,
  installProcessHandlers,
  onAbort,
  subscribe,
};

import type { BrowserWindow } from "electron";
import {
  app,
  type Event,
  type WebContents,
  type WebContentsWillNavigateEventParams,
} from "electron";

// ─── Electron-side lifetime helpers ──────────────────────────────────

/**
 * Listen for an `app` event. Typed against the small union of events
 * we actually use. Extend `AppEvent` as we adopt more.
 *
 * The cast on `app.on`/`app.off` is intentional. Electron types each
 * event with a specific listener signature (e.g. `activate` expects
 * `(event, hasVisibleWindows) => void`), so passing our uniform
 * `() => void` listener fails strict overload resolution even though
 * it's runtime-safe. Node's EventEmitter ignores extra args. The
 * cast widens to a single shape we can satisfy without forcing every
 * caller to spell the event-specific listener signature.
 */
type AppEvent = "activate" | "will-quit" | "window-all-closed";
type OnApp = (event: AppEvent, listener: () => void) => Electron.App;

export function onApp(event: AppEvent, listener: () => void): Disposable {
  (app.on as OnApp)(event, listener);
  return disposable(() => {
    (app.off as OnApp)(event, listener);
  });
}

/**
 * Listen for a `BrowserWindow` event. Same idea as `onApp`. We only
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

export function onWillNavigate(
  webContents: WebContents,
  listener: (event: Event<WebContentsWillNavigateEventParams>) => void,
): Disposable {
  webContents.on("will-navigate", listener);
  return disposable(() => {
    if (!webContents.isDestroyed()) {
      webContents.off("will-navigate", listener);
    }
  });
}

export function setWindowOpenHandler(
  webContents: WebContents,
  handler: Parameters<WebContents["setWindowOpenHandler"]>[0],
): Disposable {
  webContents.setWindowOpenHandler(handler);
  return disposable(() => {
    if (!webContents.isDestroyed()) {
      webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    }
  });
}
