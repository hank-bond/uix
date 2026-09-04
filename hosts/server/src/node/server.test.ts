import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request as requestHttp } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ResourceProtocolScheme } from "@uix/api/resource-routes";
import { parseWorkspaceCatalog } from "@uix/host/catalog";
import type {
  Attachment,
  CreatedAttachment,
  WorkspaceId,
  WorkspaceRuntime,
} from "@uix/runtime";
import { toAttachmentId, toSessionId, toWorkspaceId } from "@uix/runtime";

import type { RegisteredWorkspace } from "./registry";
import { createServerHost, type ServerWorkspaceDependencies } from "./server";
import { createServerWorkspaceRuntime } from "./workspace-runtime";
import { resolveServerResourceUrl } from "../resource-urls";
import {
  parseWebSocketReadyMessage,
  type WebSocketReadyMessage,
} from "../websocket-messages";

const temporaryDirectories: string[] = [];
const apiModuleDir = join(__dirname, "../../../../packages/api/src");

function createDeferred<T = void>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((resolvePromise) => {
      resolve = resolvePromise;
    }),
    resolve,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe("server host launcher", () => {
  it("serves a path-free catalog from the deployment public origin", async () => {
    const fixture = await createFixture();
    await using host = await createServerHost({
      registryPath: fixture.registryPath,
      publicOrigin: "https://public.example:9443",
      assetRoot: fixture.assetRoot,
      bootWorkspace: rejectWorkspaceBoot,
    });
    const privateAddress = await host.listen({ host: "127.0.0.1", port: 0 });

    const response = await requestServer(
      privateAddress,
      "/api/catalog",
      "https://public.example:9443",
    );
    const catalog = parseWorkspaceCatalog(await response.json());
    const workspacePage = await requestServer(
      privateAddress,
      "/workspaces/reference",
      "https://public.example:9443",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(catalog).toEqual({
      version: 1,
      workspaces: [
        {
          id: "reference",
          name: "Reference workspace",
          location: "https://public.example:9443/workspaces/reference",
        },
      ],
    });
    expect(JSON.stringify(catalog)).not.toContain(fixture.root);
    expect(workspacePage.headers.get("content-security-policy")).toContain(
      "connect-src 'self' wss://public.example:9443",
    );
  });

  it("rejects request authorities and browser origins outside public policy", async () => {
    const fixture = await createFixture();
    const bootWorkspace = vi.fn(rejectWorkspaceBoot);
    await using host = await createServerHost({
      registryPath: fixture.registryPath,
      publicOrigin: "https://uix.example",
      assetRoot: fixture.assetRoot,
      bootWorkspace,
    });
    const privateAddress = await host.listen({ host: "127.0.0.1", port: 0 });

    const wrongAuthority = await requestServer(
      privateAddress,
      "/api/catalog",
      "https://uix.example",
      undefined,
      "private.internal:3000",
    );
    expect(wrongAuthority.status).toBe(421);
    expect(await wrongAuthority.json()).toEqual({
      code: "public_authority_mismatch",
      message: "Request authority does not match the configured public origin",
    });

    const wrongOrigin = await requestServer(
      privateAddress,
      "/api/catalog",
      "https://uix.example",
      "https://other.example",
    );
    expect(wrongOrigin.status).toBe(403);
    expect(wrongOrigin.headers.get("cache-control")).toBe("no-store");
    expect(await wrongOrigin.json()).toEqual({
      code: "browser_origin_mismatch",
      message: "Browser origin does not match the configured public origin",
    });

    const rejectedContent = await requestServer(
      privateAddress,
      "/workspaces/reference/resources/reference/reports/document",
      "https://uix.example",
      "https://other.example",
    );
    expect(rejectedContent.status).toBe(403);
    expect(bootWorkspace).not.toHaveBeenCalled();
  });

  it("serves the shared launcher shell and its built assets", async () => {
    const fixture = await createFixture();
    const listener = await reserveLoopbackListener();
    await using host = await createServerHost({
      registryPath: fixture.registryPath,
      publicOrigin: listener.origin,
      assetRoot: fixture.assetRoot,
      bootWorkspace: rejectWorkspaceBoot,
    });
    const address = await host.listen(listener.options);

    const [
      page,
      script,
      styles,
      workspace,
      canonical,
      workspaceScript,
      workspaceStyles,
      missing,
    ] = await Promise.all([
      fetch(`${address}/`),
      fetch(`${address}/assets/launcher.js`),
      fetch(`${address}/assets/launcher.css`),
      fetch(`${address}/workspaces/reference`),
      fetch(`${address}/workspaces/reference/sessions/session-1`),
      fetch(`${address}/assets/workspace.js`),
      fetch(`${address}/assets/workspace.css`),
      fetch(`${address}/workspaces/missing`),
    ]);

    expect(await page.text()).toContain('<div id="root"></div>');
    const contentSecurityPolicy = page.headers.get("content-security-policy");
    for (const directive of [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ]) {
      expect(contentSecurityPolicy).toContain(directive);
    }
    for (const response of [
      page,
      script,
      styles,
      workspace,
      canonical,
      workspaceScript,
      workspaceStyles,
    ]) {
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
    expect(await script.text()).toBe("launcher-script");
    expect(script.headers.get("content-type")).toContain("text/javascript");
    expect(await styles.text()).toBe("launcher-styles");
    expect(styles.headers.get("content-type")).toContain("text/css");
    expect(await workspace.text()).toContain('id="status"');
    expect(await canonical.text()).toContain('id="status"');
    expect(await workspaceScript.text()).toBe("workspace-script");
    expect(await workspaceStyles.text()).toBe("workspace-styles");
    expect(workspaceStyles.headers.get("content-type")).toContain("text/css");
    const workspaceContentSecurityPolicy = workspace.headers.get(
      "content-security-policy",
    );
    expect(workspaceContentSecurityPolicy).toContain(
      `connect-src 'self' ${listener.origin.replace(/^http/, "ws")}`,
    );
    expect(workspaceContentSecurityPolicy).toContain("frame-src 'self'");
    expect(workspaceContentSecurityPolicy).toContain("font-src 'self'");
    expect(workspaceContentSecurityPolicy).toContain("img-src 'self' data:");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      code: "workspace_not_found",
      message: "Workspace not found",
    });
  });

  it("serves a feature resource over HTTP without opening a live attachment", async () => {
    const fixture = await createFixture();
    await Promise.all([
      writeFile(
        join(fixture.root, "uix.workspace.json"),
        JSON.stringify({
          name: "Reference workspace",
          features: [{ entry: "./reports.ts" }],
        }),
      ),
      writeFile(
        join(fixture.root, "reports.ts"),
        [
          'import { defineFeature } from "@uix/api/feature";',
          'import { createResourceAddressHandle } from "@uix/api/resources";',
          "const address = createResourceAddressHandle({",
          '  featureId: "reports",',
          '  name: "document",',
          '  path: "/:reportId",',
          '  origin: "workspace",',
          "});",
          "export const feature = defineFeature({",
          '  id: "reports",',
          "  workspace: () => ({",
          "    resources: [{",
          '      name: "document",',
          "      route: address.route,",
          "      handler: ({ params }) =>",
          "        new Response(`report:${String(params.reportId)}`, {",
          '          headers: { "Content-Type": "text/plain; charset=utf-8" },',
          "        }),",
          "    }],",
          "  }),",
          "});",
        ].join("\n"),
      ),
    ]);
    const bootWorkspace = vi.fn(
      (
        registered: RegisteredWorkspace,
        dependencies: ServerWorkspaceDependencies,
      ) =>
        createServerWorkspaceRuntime({
          registered,
          piAppDataDir: join(fixture.root, "server-profile", "pi"),
          apiModuleDir,
          ...dependencies,
        }),
    );
    const listener = await reserveLoopbackListener();
    await using host = await createServerHost({
      registryPath: fixture.registryPath,
      publicOrigin: listener.origin,
      assetRoot: fixture.assetRoot,
      bootWorkspace,
    });
    const address = await host.listen(listener.options);
    const logicalUrl = "uix-resource://reference/reports/document/weekly";

    const response = await fetch(
      resolveServerResourceUrl(address, "reference", logicalUrl),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("report:weekly");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(bootWorkspace).toHaveBeenCalledOnce();
  });

  it("lazily owns one fresh or named session attachment per WebSocket connection", async () => {
    const fixture = await createFixture();
    const listener = await reserveLoopbackListener();
    const bootWorkspace = vi.fn(
      (
        registered: RegisteredWorkspace,
        dependencies: ServerWorkspaceDependencies,
      ) =>
        createServerWorkspaceRuntime({
          registered,
          piAppDataDir: join(fixture.root, "server-profile", "pi"),
          apiModuleDir,
          ...dependencies,
        }),
    );
    await using host = await createServerHost({
      registryPath: fixture.registryPath,
      publicOrigin: listener.origin,
      assetRoot: fixture.assetRoot,
      bootWorkspace,
    });
    const address = await host.listen(listener.options);
    const webSocketAddress = address.replace(/^http/, "ws");

    await fetch(`${address}/workspaces/reference`);
    expect(bootWorkspace).not.toHaveBeenCalled();

    const first = await openWorkspaceWebSocket(
      `${webSocketAddress}/workspaces/reference`,
    );
    const second = await openWorkspaceWebSocket(
      `${webSocketAddress}/workspaces/reference`,
    );
    expect(first.ready.sessionId).not.toBe(second.ready.sessionId);
    expect(first.ready.canonicalPath).toBe(
      `/workspaces/reference/sessions/${first.ready.sessionId}`,
    );
    expect(second.ready.canonicalPath).toBe(
      `/workspaces/reference/sessions/${second.ready.sessionId}`,
    );
    expect(bootWorkspace).toHaveBeenCalledOnce();

    await expect(
      sendWebSocketRequest(first.socket, "request-1", "uix.surfaces"),
    ).resolves.toMatchObject({
      type: "response",
      id: "request-1",
      value: { surfaces: [] },
    });
    await expect(
      sendWebSocketRequest(first.socket, "request-2", "missing.channel", {
        secret: "not echoed",
      }),
    ).resolves.toEqual({
      type: "error",
      id: "request-2",
      code: "unknown_channel",
      message: "Unknown channel missing.channel",
      isTerminal: true,
    });

    const peer = await openWorkspaceWebSocket(
      `${webSocketAddress}/workspaces/reference/sessions/${first.ready.sessionId}`,
    );
    expect(peer.ready).toEqual(first.ready);
    expect(bootWorkspace).toHaveBeenCalledOnce();

    await closeWebSocket(first.socket);
    expect(second.socket.readyState).toBe(WebSocket.OPEN);
    expect(peer.socket.readyState).toBe(WebSocket.OPEN);
    await Promise.all([
      closeWebSocket(second.socket),
      closeWebSocket(peer.socket),
    ]);

    const reopened = await openWorkspaceWebSocket(
      `${webSocketAddress}/workspaces/reference/sessions/${first.ready.sessionId}`,
    );
    expect(reopened.ready.sessionId).toBe(first.ready.sessionId);
    expect(bootWorkspace).toHaveBeenCalledTimes(2);
    await closeWebSocket(reopened.socket);
  });

  it("notifies live connections, closes their ownership, and tears down runtimes on shutdown", async () => {
    const fixture = await createFixture();
    const listener = await reserveLoopbackListener();
    const created = createAttachmentFixture(toWorkspaceId("reference"));
    const runtimeDisposal = vi.fn(() => Promise.resolve());
    await using host = await createServerHost({
      registryPath: fixture.registryPath,
      publicOrigin: listener.origin,
      assetRoot: fixture.assetRoot,
      bootWorkspace: () =>
        Promise.resolve({
          workspaceId: toWorkspaceId("reference"),
          onEvent: () => noopDisposable(),
          createAttachment: () => Promise.resolve(created.value),
          load: () => Promise.reject(new Error("Unexpected runtime load")),
          [Symbol.asyncDispose]: runtimeDisposal,
        }),
    });
    const address = await host.listen(listener.options);
    const connection = await openWorkspaceWebSocket(
      `${address.replace(/^http/, "ws")}/workspaces/reference`,
    );
    const shutdownMessage = new Promise<unknown>((resolve) => {
      connection.socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as { type?: unknown };
        if (message.type === "shutdown") resolve(message);
      });
    });
    const connectionClosed = new Promise<void>((resolve) => {
      connection.socket.addEventListener(
        "close",
        () => {
          resolve();
        },
        { once: true },
      );
    });

    const shutdown = host[Symbol.asyncDispose]();
    await expect(shutdownMessage).resolves.toEqual({
      type: "shutdown",
      message: "Server is shutting down; reconnecting…",
    });
    await connectionClosed;
    await shutdown;

    expect(created.disposal).toHaveBeenCalledOnce();
    expect(runtimeDisposal).toHaveBeenCalledOnce();
    await expect(fetch(`${address}/api/catalog`)).rejects.toThrow();
  });

  it("keeps an in-flight content fetch alive after its originating socket disconnects", async () => {
    const fixture = await createFixture();
    const listener = await reserveLoopbackListener();
    const resourceStarted = createDeferred();
    const resourceRelease = createDeferred();
    const runtimeDisposal = vi.fn(() => Promise.resolve());
    const bootWorkspace = vi.fn(
      (
        registered: RegisteredWorkspace,
        dependencies: ServerWorkspaceDependencies,
      ): Promise<WorkspaceRuntime> => {
        const transportRegistration = dependencies.resourceTransport(
          ResourceProtocolScheme,
          async () => {
            resourceStarted.resolve();
            await resourceRelease.promise;
            return new Response("immutable report", {
              headers: {
                "Cache-Control": "public, max-age=31536000, immutable",
                "Content-Type": "text/plain; charset=utf-8",
                "Access-Control-Allow-Origin": "https://unauthorized.example",
                "Access-Control-Allow-Credentials": "true",
                Vary: "Accept-Encoding, Origin",
              },
            });
          },
        );
        return Promise.resolve({
          workspaceId: registered.id,
          onEvent: () => noopDisposable(),
          createAttachment: () =>
            Promise.resolve(createAttachmentFixture(registered.id).value),
          load: () => Promise.reject(new Error("Unexpected runtime load")),
          async [Symbol.asyncDispose]() {
            transportRegistration[Symbol.dispose]();
            await runtimeDisposal();
          },
        });
      },
    );
    await using host = await createServerHost({
      registryPath: fixture.registryPath,
      publicOrigin: listener.origin,
      assetRoot: fixture.assetRoot,
      bootWorkspace,
    });
    const address = await host.listen(listener.options);
    const socket = await openWorkspaceWebSocket(
      `${address.replace(/^http/, "ws")}/workspaces/reference`,
    );
    const logicalUrl = "uix-resource://reference/reports/document/weekly?v=abc";
    const fetchPromise = fetch(
      resolveServerResourceUrl(address, "reference", logicalUrl),
      { headers: { Origin: listener.origin } },
    );

    await resourceStarted.promise;
    await closeWebSocket(socket.socket);
    expect(runtimeDisposal).not.toHaveBeenCalled();

    resourceRelease.resolve();
    const response = await fetchPromise;
    expect(await response.text()).toBe("immutable report");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response.headers.get("access-control-allow-origin")).toBe(
      listener.origin,
    );
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("vary")).toBe("Accept-Encoding, Origin");
    await vi.waitFor(() => {
      expect(runtimeDisposal).toHaveBeenCalledOnce();
    });

    const admittedOriginResponse = await fetch(
      resolveServerResourceUrl(address, "reference", logicalUrl),
      { headers: { Origin: listener.origin } },
    );
    expect(
      admittedOriginResponse.headers.get("access-control-allow-origin"),
    ).toBe(listener.origin);
    expect(admittedOriginResponse.headers.get("vary")).toBe(
      "Accept-Encoding, Origin",
    );
  });

  it("retains workspace ownership until attachment creation settles after disconnect", async () => {
    const fixture = await createFixture();
    const listener = await reserveLoopbackListener();
    const attachmentStarted = createDeferred();
    const attachmentCreation = createDeferred<CreatedAttachment>();
    const runtimeDisposal = vi.fn(() => Promise.resolve());
    const runtime = createDeferredWorkspaceRuntime(
      toWorkspaceId("reference"),
      attachmentStarted,
      attachmentCreation,
      runtimeDisposal,
    );
    await using host = await createServerHost({
      registryPath: fixture.registryPath,
      publicOrigin: listener.origin,
      assetRoot: fixture.assetRoot,
      bootWorkspace: () => Promise.resolve(runtime),
    });
    const address = await host.listen(listener.options);
    const socket = new WebSocket(
      `${address.replace(/^http/, "ws")}/workspaces/reference`,
    );

    await attachmentStarted.promise;
    await closeWebSocket(socket);
    expect(runtimeDisposal).not.toHaveBeenCalled();

    const created = createAttachmentFixture(runtime.workspaceId);
    attachmentCreation.resolve(created.value);
    await vi.waitFor(() => {
      expect(created.disposal).toHaveBeenCalledOnce();
      expect(runtimeDisposal).toHaveBeenCalledOnce();
    });
  });
});

async function reserveLoopbackListener(): Promise<{
  readonly origin: string;
  readonly options: { readonly host: string; readonly port: number };
}> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Loopback listener did not expose a TCP port");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    options: { host: "127.0.0.1", port: address.port },
  };
}

async function requestServer(
  privateAddress: string,
  path: string,
  publicOrigin: string,
  origin?: string,
  authority?: string,
): Promise<Response> {
  const target = new URL(path, privateAddress);
  const publicUrl = new URL(publicOrigin);
  return new Promise<Response>((resolve, reject) => {
    const request = requestHttp(
      target,
      {
        headers: {
          Host: authority ?? publicUrl.host,
          ...(origin ? { Origin: origin } : {}),
        },
      },
      (response) => {
        const chunks: Uint8Array[] = [];
        response.on("data", (chunk: Uint8Array) => chunks.push(chunk));
        response.once("error", reject);
        response.once("end", () => {
          const headers = new Headers();
          for (let index = 0; index < response.rawHeaders.length; index += 2) {
            const name = response.rawHeaders[index];
            const value = response.rawHeaders[index + 1];
            if (name && value) headers.append(name, value);
          }
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode,
              statusText: response.statusMessage,
              headers,
            }),
          );
        });
      },
    );
    request.once("error", reject);
    request.end();
  });
}

async function openWorkspaceWebSocket(location: string): Promise<{
  readonly socket: WebSocket;
  readonly ready: WebSocketReadyMessage;
}> {
  const socket = new WebSocket(location);
  const readyMessage = await new Promise<WebSocketReadyMessage>(
    (resolve, reject) => {
      socket.addEventListener(
        "message",
        (event) => {
          try {
            resolve(
              parseWebSocketReadyMessage(
                JSON.parse(String(event.data)) as unknown,
              ),
            );
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          reject(new Error(`WebSocket connection failed: ${location}`));
        },
        { once: true },
      );
      socket.addEventListener(
        "close",
        (event) => {
          reject(
            new Error(
              `WebSocket connection closed before ready: ${String(event.code)} ${event.reason}`,
            ),
          );
        },
        { once: true },
      );
    },
  );
  return { socket, ready: readyMessage };
}

async function sendWebSocketRequest(
  socket: WebSocket,
  requestId: string,
  channel: string,
  payload?: unknown,
): Promise<unknown> {
  const responseMessage = new Promise<unknown>((resolve) => {
    const onMessage = (event: MessageEvent): void => {
      const message = JSON.parse(String(event.data)) as {
        readonly type?: unknown;
        readonly id?: unknown;
      };
      if (
        message.id !== requestId ||
        (message.type !== "response" && message.type !== "error")
      ) {
        return;
      }
      socket.removeEventListener("message", onMessage);
      resolve(message);
    };
    socket.addEventListener("message", onMessage);
  });
  socket.send(
    JSON.stringify({
      type: "request",
      id: requestId,
      channel,
      ...(payload === undefined ? {} : { payload }),
    }),
  );
  return responseMessage;
}

async function closeWebSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return;
  const closePromise = new Promise<void>((resolve) => {
    socket.addEventListener(
      "close",
      () => {
        resolve();
      },
      { once: true },
    );
  });
  socket.close(1000, "Test complete");
  await closePromise;
}

function createDeferredWorkspaceRuntime(
  workspaceId: WorkspaceId,
  started: { resolve(): void },
  creation: { readonly promise: Promise<CreatedAttachment> },
  disposal: () => Promise<void>,
): WorkspaceRuntime {
  return {
    workspaceId,
    onEvent: () => noopDisposable(),
    createAttachment: () => {
      started.resolve();
      return creation.promise;
    },
    load: () => Promise.reject(new Error("Unexpected runtime load")),
    [Symbol.asyncDispose]: disposal,
  };
}

function createAttachmentFixture(workspaceId: WorkspaceId): {
  readonly value: CreatedAttachment;
  readonly disposal: ReturnType<typeof vi.fn>;
} {
  let isDisposed = false;
  let closeListener: (() => void) | undefined;
  const disposal = vi.fn(() => {
    if (isDisposed) return;
    isDisposed = true;
    closeListener?.();
  });
  const attachment: Attachment = {
    attachmentId: toAttachmentId("attachment-1"),
    workspaceId,
    target: { sessionId: toSessionId("session-1") },
    webBinding: "fixture-binding" as Attachment["webBinding"],
    prepareDispatch: () => {
      throw new Error("Unexpected dispatch preparation");
    },
    retarget: () => Promise.reject(new Error("Unexpected retarget")),
    onWebBindingChange: () => noopDisposable(),
    onEvent: () => noopDisposable(),
    onClose: (listener) => {
      closeListener = listener;
      return {
        [Symbol.dispose](): void {
          if (closeListener === listener) closeListener = undefined;
        },
      };
    },
    [Symbol.dispose]: disposal,
  };
  return {
    value: { attachment, deliver: () => undefined },
    disposal,
  };
}

function noopDisposable(): Disposable {
  return { [Symbol.dispose]: () => undefined };
}

function rejectWorkspaceBoot(): Promise<WorkspaceRuntime> {
  return Promise.reject(
    new Error("Workspace runtime should not boot for this request"),
  );
}

async function createFixture(): Promise<{
  readonly root: string;
  readonly registryPath: string;
  readonly assetRoot: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "server-host-test-"));
  temporaryDirectories.push(root);
  const assetRoot = join(root, "public");
  await mkdir(join(assetRoot, "assets"), { recursive: true });
  await Promise.all([
    writeFile(
      join(root, "uix.workspace.json"),
      JSON.stringify({ name: "Reference workspace", features: [] }),
    ),
    writeFile(
      join(root, "server.workspaces.json"),
      JSON.stringify({
        version: 1,
        workspaces: [{ id: "reference", manifest: "./uix.workspace.json" }],
      }),
    ),
    writeFile(
      join(assetRoot, "index.html"),
      '<!doctype html><div id="root"></div>',
    ),
    writeFile(join(assetRoot, "assets/launcher.js"), "launcher-script"),
    writeFile(join(assetRoot, "assets/launcher.css"), "launcher-styles"),
    writeFile(
      join(assetRoot, "workspace.html"),
      '<!doctype html><main id="status"></main>',
    ),
    writeFile(join(assetRoot, "assets/workspace.js"), "workspace-script"),
    writeFile(join(assetRoot, "assets/workspace.css"), "workspace-styles"),
  ]);
  return {
    root,
    registryPath: join(root, "server.workspaces.json"),
    assetRoot,
  };
}
