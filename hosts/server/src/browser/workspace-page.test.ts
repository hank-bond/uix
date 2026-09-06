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
import type {
  AttachmentWebRootsObservable,
  SessionLocationAdapter,
} from "@uix/client/workspace";

import { openWorkspacePage } from "./workspace-page";

const initialBinding = { webBinding: "initial-binding" };

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

interface WorkspacePageFixture {
  readonly socket: FakeWebSocket;
  readonly status: { hidden: boolean; textContent: string };
  readonly replaceState: Mock<ReplaceState>;
  readonly pushState: Mock<ReplaceState>;
  readonly navigateHistory: (pathname: string) => void;
  readonly workspacePage: Disposable;
}

let testLifetime: DisposableStack;

beforeEach(() => {
  testLifetime = new DisposableStack();
  FakeWebSocket.instances.length = 0;
});

afterEach(() => {
  testLifetime.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function createWorkspacePageFixture(
  pathname: string,
  options: Parameters<typeof openWorkspacePage>[0] = {},
): WorkspacePageFixture {
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

  const workspacePage = testLifetime.use(openWorkspacePage(options));
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
    workspacePage,
  };
}

describe("workspace page", () => {
  // Binding roots and ownership

  it("continues page cleanup when the mounted workspace fails to dispose", async () => {
    vi.useFakeTimers();
    let client: WorkspaceClient | undefined;
    let roots: AttachmentWebRootsObservable | undefined;
    const fixture = createWorkspacePageFixture("/workspaces/reference", {
      readyHandler: (ready) => {
        client = ready.client;
        roots = ready.attachmentWebRootsObservable;
        return {
          [Symbol.dispose]: () => {
            throw new Error("Unmount failed");
          },
        };
      },
    });
    fixture.socket.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
        ...initialBinding,
      }),
    );
    if (!client || !roots) throw new Error("Workspace was not accepted");
    const rejected = expect(
      client.request("feature.read", undefined),
    ).rejects.toMatchObject({ code: "connection_closed" });
    expect(() => {
      fixture.workspacePage[Symbol.dispose]();
    }).toThrow("Unmount failed");
    await rejected;
    const observable = roots;
    expect(() => observable.subscribe(() => {})).toThrow("disposed");
    expect(fixture.socket.close).toHaveBeenCalledWith(1000, "Page closed");
    fixture.workspacePage[Symbol.dispose]();
    fixture.socket.emit("close");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("replaces roots before notifying channel and recovery consumers without remounting", async () => {
    vi.useFakeTimers();
    let roots: AttachmentWebRootsObservable | undefined;
    let client: WorkspaceClient | undefined;
    const mountHandler = vi.fn<
      NonNullable<
        NonNullable<Parameters<typeof openWorkspacePage>[0]>["readyHandler"]
      >
    >(({ attachmentWebRootsObservable, client: acceptedClient }) => {
      roots = attachmentWebRootsObservable;
      client = acceptedClient;
      return { [Symbol.dispose]: vi.fn() };
    });
    const fixture = createWorkspacePageFixture("/workspaces/reference", {
      readyHandler: mountHandler,
    });
    const ready = {
      type: "ready",
      sessionId: "session-1",
      canonicalPath: "/workspaces/reference/sessions/session-1",
      webBinding: "first",
    };
    fixture.socket.emitMessage(JSON.stringify(ready));
    if (!roots || !client) throw new Error("Workspace was not accepted");
    const observable = roots;
    const first = observable.getSnapshot();
    const firstUrl = first.toFeatureRootUrl("canvas");
    const changed = vi.fn();
    observable.subscribe(changed);
    const eventRoots: string[] = [];
    client.subscribe("feature.changed", () => {
      eventRoots.push(observable.getSnapshot().toFeatureRootUrl("canvas"));
    });
    fixture.socket.emitMessage(
      JSON.stringify({ type: "web_binding", binding: "next" }),
    );
    fixture.socket.emitMessage(
      JSON.stringify({ type: "event", id: "e1", channel: "feature.changed" }),
    );
    expect(eventRoots).toEqual([
      "https://uix.example/workspaces/reference/viewpoints/next/canvas/",
    ]);
    expect(first.toFeatureRootUrl("canvas")).toBe(firstUrl);
    expect(client.connectionVersionObservable?.getSnapshot()).toBe(1);
    expect(FakeWebSocket.instances).toHaveLength(1);

    const recoveryRoots: string[] = [];
    client.connectionVersionObservable?.subscribe(() => {
      recoveryRoots.push(observable.getSnapshot().toFeatureRootUrl("canvas"));
    });
    fixture.socket.emit("close");
    await vi.advanceTimersByTimeAsync(250);
    const replacement = FakeWebSocket.instances.at(-1);
    if (!replacement || replacement === fixture.socket) {
      throw new Error("Replacement WebSocket was not constructed");
    }
    replacement.emitMessage(
      JSON.stringify({ ...ready, webBinding: "reconnected" }),
    );
    expect(recoveryRoots).toEqual([
      "https://uix.example/workspaces/reference/viewpoints/reconnected/canvas/",
    ]);
    fixture.socket.emitMessage(
      JSON.stringify({ type: "web_binding", binding: "stale" }),
    );
    expect(changed).toHaveBeenCalledTimes(2);
    expect(mountHandler).toHaveBeenCalledOnce();
    fixture.workspacePage[Symbol.dispose]();
    replacement.emitMessage(
      JSON.stringify({ type: "web_binding", binding: "disposed" }),
    );
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, "", 123, {}])(
    "rejects invalid initial bindings: %j",
    (webBinding) => {
      const readyHandler = vi.fn();
      const fixture = createWorkspacePageFixture("/workspaces/reference", {
        readyHandler,
      });
      fixture.socket.emitMessage(
        JSON.stringify({
          type: "ready",
          sessionId: "session-1",
          canonicalPath: "/workspaces/reference/sessions/session-1",
          webBinding,
        }),
      );
      expect(readyHandler).not.toHaveBeenCalled();
      expect(fixture.socket.close).toHaveBeenCalledWith(
        1002,
        "Invalid WebSocket ready message",
      );
      fixture.workspacePage[Symbol.dispose]();
    },
  );

  it("rejects binding updates before acceptance and malformed updates after acceptance", () => {
    const early = createWorkspacePageFixture("/workspaces/reference");
    early.socket.emitMessage(
      JSON.stringify({ type: "web_binding", binding: "early" }),
    );
    expect(early.socket.close).toHaveBeenCalledWith(
      1002,
      "Invalid WebSocket ready message",
    );
    early.workspacePage[Symbol.dispose]();
    const fixture = createWorkspacePageFixture("/workspaces/reference");
    fixture.socket.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
        ...initialBinding,
      }),
    );
    fixture.socket.emitMessage(
      JSON.stringify({ type: "web_binding", binding: "" }),
    );
    expect(fixture.socket.close).toHaveBeenCalledWith(
      1002,
      "Invalid WebSocket message",
    );
    fixture.workspacePage[Symbol.dispose]();
  });

  // Session locations

  it("canonicalizes a workspace-only location after the server accepts a new session", () => {
    const { socket, status, replaceState, workspacePage } =
      createWorkspacePageFixture("/workspaces/reference");

    socket.emit("open");
    expect(status.textContent).toBe("Opening workspace…");
    socket.emitMessage(
      JSON.stringify({
        ...initialBinding,
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

    workspacePage[Symbol.dispose]();
    workspacePage[Symbol.dispose]();
    expect(socket.close).toHaveBeenCalledOnce();
    expect(socket.close).toHaveBeenCalledWith(1000, "Page closed");
  });

  it("uses the server's canonical route for an accepted named session", () => {
    const { socket, status, replaceState } = createWorkspacePageFixture(
      "/workspaces/reference/sessions/session-1",
    );

    socket.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
        ...initialBinding,
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
    const fixture = createWorkspacePageFixture(
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
        ...initialBinding,
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
    const fixture = createWorkspacePageFixture(
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
        ...initialBinding,
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
    const crossOrigin = createWorkspacePageFixture(
      "/workspaces/reference/sessions/session-1",
    );
    crossOrigin.socket.emitMessage(
      JSON.stringify({
        ...initialBinding,
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

    const malformed = createWorkspacePageFixture("/workspaces/reference");
    malformed.socket.emitMessage("{}");
    expect(malformed.replaceState).not.toHaveBeenCalled();
    expect(malformed.socket.close).toHaveBeenCalledWith(
      1002,
      "Invalid WebSocket ready message",
    );
  });

  // Recovery and protocol failures

  it("reconnects to the canonical session, rejects pending work, and retains the mounted client", async () => {
    vi.useFakeTimers();
    let acceptedClient: WorkspaceClient | undefined;
    const readyHandler = vi.fn(
      (ready: { readonly client: WorkspaceClient }) => {
        acceptedClient = ready.client;
        return { [Symbol.dispose]: vi.fn() };
      },
    );
    const fixture = createWorkspacePageFixture("/workspaces/reference", {
      readyHandler,
    });
    fixture.socket.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
        ...initialBinding,
      }),
    );
    const accepted = acceptedClient;
    if (!accepted) throw new Error("Workspace client was not accepted");
    const versionChanged = vi.fn();
    accepted.connectionVersionObservable?.subscribe(versionChanged);
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
        webBinding: "replacement-binding",
      }),
    );

    expect(readyHandler).toHaveBeenCalledOnce();
    expect(versionChanged).toHaveBeenCalledOnce();
    expect(accepted.connectionVersionObservable?.getSnapshot()).toBe(2);
    expect(replacement.send).not.toHaveBeenCalled();
    expect(fixture.status.textContent).toBe("Connected");
    expect(fixture.status.hidden).toBe(true);
  });

  it("presents server shutdown and reconnects to the accepted session after close", async () => {
    vi.useFakeTimers();
    const fixture = createWorkspacePageFixture("/workspaces/reference");
    fixture.socket.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
        ...initialBinding,
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
    const fixture = createWorkspacePageFixture("/workspaces/reference");
    const readyMessage = JSON.stringify({
      ...initialBinding,
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
    const fixture = createWorkspacePageFixture("/workspaces/reference");
    fixture.socket.emitMessage(
      JSON.stringify({
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
        ...initialBinding,
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
        webBinding: "replacement-binding",
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
    const fixture = createWorkspacePageFixture(
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
        ...initialBinding,
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
    const { socket, status, replaceState } = createWorkspacePageFixture(
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
        ...initialBinding,
      }),
    );

    expect(status.textContent).toBe("Unable to open workspace");
    expect(socket.close).toHaveBeenCalledWith(
      1011,
      "Unable to canonicalize workspace",
    );
  });
});
