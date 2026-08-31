import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

import type { WorkspaceClient } from "@uix/api/workspace";
import type { SessionLocationAdapter } from "@uix/client/workspace";

import { openWorkspaceWebSocket } from "./workspace-websocket";

class FakeWebSocket extends EventTarget {
  static readonly OPEN = 1;
  static readonly instances: FakeWebSocket[] = [];

  readonly location: string;
  readonly close = vi.fn<(code?: number, reason?: string) => void>();
  readonly send = vi.fn<(data: string) => void>();
  readyState = FakeWebSocket.OPEN;

  constructor(location: string | URL) {
    super();
    this.location = String(location);
    FakeWebSocket.instances.push(this);
  }

  emit(type: "open" | "close" | "error"): void {
    this.dispatchEvent(new Event(type));
  }

  emitMessage(data: unknown): void {
    const event = new Event("message");
    Object.defineProperty(event, "data", { value: data });
    this.dispatchEvent(event);
  }
}

type ReplaceState = (
  data: unknown,
  unused: string,
  url?: string | URL | null,
) => void;

interface WorkspaceWebSocketFixture {
  readonly socket: FakeWebSocket;
  readonly status: { hidden: boolean; textContent: string };
  readonly replaceState: Mock<ReplaceState>;
  readonly pushState: Mock<ReplaceState>;
  readonly navigateHistory: (pathname: string) => void;
  readonly workspaceWebSocket: Disposable;
}

beforeEach(() => {
  FakeWebSocket.instances.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function createWorkspaceWebSocketFixture(
  pathname: string,
  options: Parameters<typeof openWorkspaceWebSocket>[0] = {},
): WorkspaceWebSocketFixture {
  const status = { hidden: false, textContent: "Connecting…" };
  const location = {
    href: `https://uix.example${pathname}?ignored=yes#fragment`,
    origin: "https://uix.example",
    pathname,
  };
  const applyHistoryLocation: ReplaceState = (_data, _unused, url) => {
    if (url === undefined || url === null) return;
    const next = new URL(url, location.origin);
    location.href = next.href;
    location.pathname = next.pathname;
  };
  const replaceState = vi.fn<ReplaceState>(applyHistoryLocation);
  const pushState = vi.fn<ReplaceState>(applyHistoryLocation);
  const documentEvents = new EventTarget();
  const windowEvents = new EventTarget();
  vi.stubGlobal("document", {
    visibilityState: "visible",
    getElementById: vi.fn((id: string) => (id === "status" ? status : null)),
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener:
      documentEvents.removeEventListener.bind(documentEvents),
  });
  vi.stubGlobal("window", {
    location,
    history: { replaceState, pushState },
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
  });
  vi.stubGlobal("WebSocket", FakeWebSocket);

  const workspaceWebSocket = openWorkspaceWebSocket(options);
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error("WebSocket was not constructed");
  expect(socket.location).toBe(`wss://uix.example${pathname}`);
  return {
    socket,
    status,
    replaceState,
    pushState,
    navigateHistory(nextPathname): void {
      location.pathname = nextPathname;
      windowEvents.dispatchEvent(new Event("popstate"));
    },
    workspaceWebSocket,
  };
}

describe("browser workspace WebSocket", () => {
  it("canonicalizes a workspace-only location after the server accepts a new session", () => {
    const { socket, status, replaceState, workspaceWebSocket } =
      createWorkspaceWebSocketFixture("/workspaces/reference");

    socket.emit("open");
    expect(status.textContent).toBe("Opening workspace…");
    socket.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      }),
    );

    expect(status.textContent).toBe("Connected");
    expect(replaceState).toHaveBeenCalledOnce();
    const canonical = replaceState.mock.calls[0]?.[2];
    expect(String(canonical)).toBe(
      "https://uix.example/workspaces/reference/sessions/session-1",
    );

    workspaceWebSocket[Symbol.dispose]();
    workspaceWebSocket[Symbol.dispose]();
    expect(socket.close).toHaveBeenCalledOnce();
    expect(socket.close).toHaveBeenCalledWith(1000, "Page closed");
  });

  it("uses the server's canonical route for an accepted named session", () => {
    const { socket, status, replaceState } = createWorkspaceWebSocketFixture(
      "/workspaces/reference/sessions/session-1",
    );

    socket.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      }),
    );

    expect(String(replaceState.mock.calls[0]?.[2])).toBe(
      "https://uix.example/workspaces/reference/sessions/session-1",
    );
    expect(status.textContent).toBe("Connected");
  });

  it("retargets browser back and forward before accepting their locations", async () => {
    let sessionLocation: SessionLocationAdapter | undefined;
    const navigate = vi.fn((sessionId: string) => {
      sessionLocation?.synchronize(sessionId);
      return Promise.resolve();
    });
    const fixture = createWorkspaceWebSocketFixture(
      "/workspaces/reference/sessions/session-1",
      {
        readyHandler: ({ sessionLocationAdapter }) => {
          sessionLocation = sessionLocationAdapter;
          const unsubscribe = sessionLocationAdapter.subscribe(navigate);
          return { [Symbol.dispose]: unsubscribe };
        },
      },
    );
    fixture.socket.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      }),
    );
    if (!sessionLocation) throw new Error("Session location was not accepted");

    sessionLocation.synchronize("session-2");
    expect(fixture.pushState).toHaveBeenCalledWith(
      null,
      "",
      "/workspaces/reference/sessions/session-2",
    );

    fixture.navigateHistory("/workspaces/reference/sessions/session-1");
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenLastCalledWith("session-1");
    });
    fixture.navigateHistory("/workspaces/reference/sessions/session-2");
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenLastCalledWith("session-2");
    });

    expect(navigate).toHaveBeenCalledTimes(2);
    expect(fixture.pushState).toHaveBeenCalledOnce();
  });

  it("restores the accepted location when history retargeting fails", async () => {
    let sessionLocation: SessionLocationAdapter | undefined;
    const navigate = vi.fn(() => Promise.reject(new Error("Unknown session")));
    const fixture = createWorkspaceWebSocketFixture(
      "/workspaces/reference/sessions/session-1",
      {
        readyHandler: ({ sessionLocationAdapter }) => {
          sessionLocation = sessionLocationAdapter;
          const unsubscribe = sessionLocationAdapter.subscribe(navigate);
          return { [Symbol.dispose]: unsubscribe };
        },
      },
    );
    fixture.socket.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      }),
    );
    if (!sessionLocation) throw new Error("Session location was not accepted");
    sessionLocation.synchronize("session-2");

    fixture.navigateHistory("/workspaces/reference/sessions/session-1");
    await vi.waitFor(() => {
      expect(fixture.replaceState).toHaveBeenLastCalledWith(
        null,
        "",
        "/workspaces/reference/sessions/session-2",
      );
    });

    expect(navigate).toHaveBeenCalledWith("session-1");
    expect(fixture.status.textContent).toBe("Connected");
  });

  it("rejects a cross-origin canonical path or malformed ready message", () => {
    const crossOrigin = createWorkspaceWebSocketFixture(
      "/workspaces/reference/sessions/session-1",
    );
    crossOrigin.socket.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-1",
        canonicalPath:
          "//other.example/workspaces/reference/sessions/session-1",
      }),
    );
    expect(crossOrigin.replaceState).not.toHaveBeenCalled();
    expect(crossOrigin.status.textContent).toBe("Unable to open workspace");
    expect(crossOrigin.socket.close).toHaveBeenCalledWith(
      1002,
      "Invalid WebSocket ready message",
    );
    crossOrigin.socket.emit("close");
    expect(crossOrigin.status.textContent).toBe("Unable to open workspace");

    const malformed = createWorkspaceWebSocketFixture("/workspaces/reference");
    malformed.socket.emitMessage("{}");
    expect(malformed.replaceState).not.toHaveBeenCalled();
    expect(malformed.socket.close).toHaveBeenCalledWith(
      1002,
      "Invalid WebSocket ready message",
    );
  });

  it("reconnects to the canonical session, rejects pending work, and retains the mounted client", async () => {
    vi.useFakeTimers();
    let acceptedClient: WorkspaceClient | undefined;
    const readyHandler = vi.fn(
      (ready: { readonly client: WorkspaceClient }) => {
        acceptedClient = ready.client;
        return { [Symbol.dispose]: vi.fn() };
      },
    );
    const fixture = createWorkspaceWebSocketFixture("/workspaces/reference", {
      readyHandler,
    });
    fixture.socket.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      }),
    );
    const accepted = acceptedClient;
    if (!accepted) throw new Error("Workspace client was not accepted");
    const versionChanged = vi.fn();
    accepted.connectionVersion?.subscribe(versionChanged);
    const pending = accepted.request("feature.mutate", { value: 1 });

    fixture.socket.emit("close");
    await expect(pending).rejects.toMatchObject({
      code: "connection_closed",
    });
    expect(fixture.status.textContent).toBe("Disconnected; reconnecting…");

    await vi.advanceTimersByTimeAsync(250);
    const replacement = FakeWebSocket.instances.at(-1);
    if (!replacement || replacement === fixture.socket) {
      throw new Error("Replacement WebSocket was not constructed");
    }
    expect(replacement.location).toBe(
      "wss://uix.example/workspaces/reference/sessions/session-1",
    );
    replacement.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      }),
    );

    expect(readyHandler).toHaveBeenCalledOnce();
    expect(versionChanged).toHaveBeenCalledOnce();
    expect(accepted.connectionVersion?.getSnapshot()).toBe(2);
    expect(replacement.send).not.toHaveBeenCalled();
    expect(fixture.status.textContent).toBe("Connected");
    expect(fixture.status.hidden).toBe(true);
  });

  it("presents server shutdown and reconnects to the accepted session after close", async () => {
    vi.useFakeTimers();
    const fixture = createWorkspaceWebSocketFixture("/workspaces/reference");
    fixture.socket.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      }),
    );

    fixture.socket.emitMessage(
      JSON.stringify({
        type: "shutdown",
        message: "Server is shutting down; reconnecting…",
      }),
    );
    expect(fixture.status.hidden).toBe(false);
    expect(fixture.status.textContent).toBe(
      "Server is shutting down; reconnecting…",
    );

    fixture.socket.emit("close");
    await vi.advanceTimersByTimeAsync(250);
    const replacement = FakeWebSocket.instances.at(-1);
    if (!replacement || replacement === fixture.socket) {
      throw new Error("Replacement WebSocket was not constructed");
    }
    expect(replacement.location).toBe(
      "wss://uix.example/workspaces/reference/sessions/session-1",
    );
  });

  it("rejects a second ready message on one accepted connection", () => {
    const fixture = createWorkspaceWebSocketFixture("/workspaces/reference");
    const readyMessage = JSON.stringify({
      type: "ready",
      sessionId: "session-1",
      canonicalPath: "/workspaces/reference/sessions/session-1",
    });
    fixture.socket.emitMessage(readyMessage);

    fixture.socket.emitMessage(readyMessage);

    expect(fixture.status.textContent).toBe("Unable to open workspace");
    expect(fixture.socket.close).toHaveBeenCalledWith(
      1002,
      "Invalid WebSocket message",
    );
  });

  it("rejects a replacement connection that changes the canonical session", async () => {
    vi.useFakeTimers();
    const fixture = createWorkspaceWebSocketFixture("/workspaces/reference");
    fixture.socket.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      }),
    );
    fixture.socket.emit("close");

    await vi.advanceTimersByTimeAsync(250);
    const replacement = FakeWebSocket.instances.at(-1);
    if (!replacement || replacement === fixture.socket) {
      throw new Error("Replacement WebSocket was not constructed");
    }
    replacement.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-2",
        canonicalPath: "/workspaces/reference/sessions/session-2",
      }),
    );

    expect(fixture.status.textContent).toBe("Unable to open workspace");
    expect(replacement.close).toHaveBeenCalledWith(
      1002,
      "Invalid WebSocket ready message",
    );
  });

  it("closes the connection when an accepted session cannot enter history", () => {
    let sessionLocation: SessionLocationAdapter | undefined;
    const fixture = createWorkspaceWebSocketFixture(
      "/workspaces/reference/sessions/session-1",
      {
        readyHandler: ({ sessionLocationAdapter }) => {
          sessionLocation = sessionLocationAdapter;
          return undefined;
        },
      },
    );
    fixture.socket.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      }),
    );
    const acceptedLocation = sessionLocation;
    if (!acceptedLocation) {
      throw new Error("Session location was not accepted");
    }
    fixture.pushState.mockImplementation(() => {
      throw new Error("History is unavailable");
    });

    expect(() => {
      acceptedLocation.synchronize("session-2");
    }).toThrow("History is unavailable");
    expect(fixture.status.textContent).toBe(
      "Unable to synchronize session location",
    );
    expect(fixture.socket.close).toHaveBeenCalledWith(
      1011,
      "Unable to synchronize session location",
    );
  });

  it("does not accept a target when canonical history replacement fails", () => {
    const { socket, status, replaceState } = createWorkspaceWebSocketFixture(
      "/workspaces/reference",
    );
    replaceState.mockImplementation(() => {
      throw new Error("History is unavailable");
    });

    socket.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      }),
    );

    expect(status.textContent).toBe("Unable to open workspace");
    expect(socket.close).toHaveBeenCalledWith(
      1011,
      "Unable to canonicalize workspace",
    );
  });
});
