import type { WebContents } from "electron";

import {
  DisposableBag,
  onWillNavigate,
  setWindowOpenHandler,
} from "./lifecycle";
import { createLogger } from "./log";

const log = createLogger("external-links");

export function isExternalWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function bindExternalWebLinks(
  webContents: WebContents,
  openExternal: (url: string) => void | Promise<void>,
): Disposable {
  const bag = new DisposableBag();

  bag.add(
    setWindowOpenHandler(webContents, ({ url }) => {
      if (isExternalWebUrl(url)) {
        try {
          void Promise.resolve(openExternal(url)).catch((thrown: unknown) => {
            logOpenFailure(thrown);
          });
        } catch (thrown) {
          logOpenFailure(thrown);
        }
      }
      return { action: "deny" };
    }),
  );

  bag.add(
    onWillNavigate(webContents, (event) => {
      if (event.url !== webContents.getURL()) {
        event.preventDefault();
      }
    }),
  );

  return bag;
}

function logOpenFailure(thrown: unknown): void {
  const error = thrown instanceof Error ? thrown : new Error(String(thrown));
  log.warn({ err: error.message }, "open_failed");
}
