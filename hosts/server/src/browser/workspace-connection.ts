// Opens one workspace page's live connection and canonicalizes its accepted session location.

import { parseLiveReadyFrame } from "../live";

/** Own the concrete browser connection from shell load through accepted target. */
export function openWorkspaceConnection(): Disposable {
  const status = document.getElementById("status");
  if (!status) throw new Error("#status not found");

  const liveLocation = new URL(window.location.href);
  liveLocation.protocol = liveLocation.protocol === "https:" ? "wss:" : "ws:";
  liveLocation.search = "";
  liveLocation.hash = "";

  const socket = new WebSocket(liveLocation);
  let isAccepted = false;
  let isDisposed = false;
  let hasFailed = false;

  socket.addEventListener("open", () => {
    if (!isDisposed) status.textContent = "Opening workspace…";
  });
  socket.addEventListener("message", (event) => {
    if (isDisposed || isAccepted) return;
    try {
      if (typeof event.data !== "string") {
        throw new Error("Live ready frame must be text");
      }
      const ready = parseLiveReadyFrame(JSON.parse(event.data) as unknown);
      const canonical = new URL(ready.canonicalPath, window.location.origin);
      if (
        canonical.origin !== window.location.origin ||
        `${canonical.pathname}${canonical.search}${canonical.hash}` !==
          ready.canonicalPath
      ) {
        throw new Error("Invalid canonical workspace path");
      }
      try {
        window.history.replaceState(null, "", canonical);
      } catch {
        hasFailed = true;
        status.textContent = "Unable to open workspace";
        socket.close(1011, "Unable to canonicalize workspace");
        return;
      }
      isAccepted = true;
      status.textContent = "Connected";
    } catch {
      hasFailed = true;
      status.textContent = "Unable to open workspace";
      socket.close(1002, "Invalid ready frame");
    }
  });
  socket.addEventListener("error", () => {
    if (!isDisposed && !isAccepted) {
      hasFailed = true;
      status.textContent = "Unable to open workspace";
    }
  });
  socket.addEventListener("close", () => {
    if (!isDisposed && !hasFailed) status.textContent = "Disconnected";
  });

  return {
    [Symbol.dispose](): void {
      if (isDisposed) return;
      isDisposed = true;
      socket.close(1000, "Page closed");
    },
  };
}
