import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

import { openWorkspaceWebSocket } from "./workspace-websocket";

class FakeWebSocket extends EventTarget {
  static readonly instances: FakeWebSocket[] = [];

  readonly location: string;
  readonly close = vi.fn<(code?: number, reason?: string) => void>();

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
  readonly status: { textContent: string };
  readonly replaceState: Mock<ReplaceState>;
  readonly workspaceWebSocket: Disposable;
}

beforeEach(() => {
  FakeWebSocket.instances.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function createWorkspaceWebSocketFixture(
  pathname: string,
): WorkspaceWebSocketFixture {
  const status = { textContent: "Connecting…" };
  const replaceState = vi.fn<ReplaceState>();
  vi.stubGlobal("document", {
    getElementById: vi.fn((id: string) => (id === "status" ? status : null)),
  });
  vi.stubGlobal("window", {
    location: {
      href: `https://uix.example${pathname}?ignored=yes#fragment`,
      origin: "https://uix.example",
      pathname,
    },
    history: { replaceState },
  });
  vi.stubGlobal("WebSocket", FakeWebSocket);

  const workspaceWebSocket = openWorkspaceWebSocket();
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error("WebSocket was not constructed");
  expect(socket.location).toBe(`wss://uix.example${pathname}`);
  return { socket, status, replaceState, workspaceWebSocket };
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

  it("rejects a cross-origin canonical path or malformed ready frame", () => {
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
      "Invalid WebSocket ready frame",
    );
    crossOrigin.socket.emit("close");
    expect(crossOrigin.status.textContent).toBe("Unable to open workspace");

    const malformed = createWorkspaceWebSocketFixture("/workspaces/reference");
    malformed.socket.emitMessage("{}");
    expect(malformed.replaceState).not.toHaveBeenCalled();
    expect(malformed.socket.close).toHaveBeenCalledWith(
      1002,
      "Invalid WebSocket ready frame",
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
