// Provides Electron-host disposable helpers that bind app, window, and webContents listeners to their owners.
//
// The host half of the lifetime vocabulary. The neutral primitives
// (DisposableBag, disposable, onAbort, subscribe, installProcessHandlers)
// live in `@uix/runtime`. This file keeps only the helpers that touch
// Electron objects. Host code uses these instead of calling `app.on`,
// `win.on`, etc. directly.

import type { BrowserWindow } from "electron";
import {
  app,
  type Event,
  type WebContents,
  type WebContentsWillNavigateEventParams,
} from "electron";

import { disposable } from "@uix/runtime";

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
