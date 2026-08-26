// Opens one workspace page's live connection and canonicalizes its accepted session location.

import { parseLiveReadyFrame } from "../live";

/** Own the concrete browser connection from shell load through accepted target. */
export function connectWorkspacePage(): Disposable {
  const status = document.getElementById("status");
  if (!status) throw new Error("#status not found");

  const liveLocation = new URL(window.location.href);
  liveLocation.protocol = liveLocation.protocol === "https:" ? "wss:" : "ws:";
  liveLocation.search = "";
  liveLocation.hash = "";

  const socket = new WebSocket(liveLocation);
  let accepted = false;
  let disposed = false;

  socket.addEventListener("open", () => {
    if (!disposed) status.textContent = "Opening workspace…";
  });
  socket.addEventListener("message", (event) => {
    if (disposed || accepted) return;
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
      accepted = true;
      window.history.replaceState(null, "", canonical);
      status.textContent = "Connected";
    } catch {
      status.textContent = "Unable to open workspace";
      socket.close(1002, "Invalid ready frame");
    }
  });
  socket.addEventListener("error", () => {
    if (!disposed && !accepted) status.textContent = "Unable to open workspace";
  });
  socket.addEventListener("close", () => {
    if (!disposed) status.textContent = "Disconnected";
  });

  return {
    [Symbol.dispose](): void {
      if (disposed) return;
      disposed = true;
      socket.close(1000, "Page closed");
    },
  };
}
