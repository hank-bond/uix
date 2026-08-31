// Launches approved web links on the loopback server's local machine without exposing a shell.
//
// Adapted from @earendil-works/pi-coding-agent's open-browser utility.

import { spawn } from "node:child_process";

import { createLogger } from "@uix/runtime/log";

const log = createLogger("external-links");

/** Create a non-throwing launcher for the server machine's default browser. */
export function createServerExternalWebLinkLauncher(
  platform: NodeJS.Platform,
): (url: string) => void {
  return (url) => {
    if (!isExternalWebUrl(url)) return;
    const [command, args] = platformCommand(platform, url);
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: "ignore",
      });
      child.once("error", (error) => {
        log.warn({ err: error }, "open_failed");
      });
      child.unref();
    } catch (error) {
      log.warn({ err: toError(error) }, "open_failed");
    }
  };
}

function platformCommand(
  platform: NodeJS.Platform,
  url: string,
): readonly [command: string, args: readonly string[]] {
  if (platform === "darwin") return ["open", [url]];
  if (platform === "win32") {
    return ["rundll32", ["url.dll,FileProtocolHandler", url]];
  }
  return ["xdg-open", [url]];
}

function isExternalWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
