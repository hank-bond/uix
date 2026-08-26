import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { parseWorkspaceCatalog } from "@uix/host/catalog";
import type {
  Attachment,
  CreatedAttachment,
  WorkspaceId,
  WorkspaceRuntime,
} from "@uix/runtime";
import { toAttachmentId, toSessionId, toWorkspaceId } from "@uix/runtime";

import type { RegisteredWorkspace } from "./registry";
import { createServerHost } from "./server";
import { createServerWorkspaceRuntime } from "./workspace-runtime";
import { type LiveReadyFrame, parseLiveReadyFrame } from "../live";

const temporaryDirectories: string[] = [];

function deferred<T = void>(): {
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

    const response = await fetch(`${privateAddress}/api/catalog`);
    const catalog = parseWorkspaceCatalog(await response.json());

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
  });

  it("serves the shared launcher shell and its built assets", async () => {
    const fixture = await createFixture();
    await using host = await createServerHost({
      registryPath: fixture.registryPath,
      publicOrigin: "http://127.0.0.1:3000",
      assetRoot: fixture.assetRoot,
      bootWorkspace: rejectWorkspaceBoot,
    });
    const address = await host.listen({ host: "127.0.0.1", port: 0 });

    const [
      page,
      script,
      styles,
      workspace,
      canonical,
      workspaceScript,
      missing,
    ] = await Promise.all([
      fetch(`${address}/`),
      fetch(`${address}/assets/launcher.js`),
      fetch(`${address}/assets/launcher.css`),
      fetch(`${address}/workspaces/reference`),
      fetch(`${address}/workspaces/reference/sessions/session-1`),
      fetch(`${address}/assets/workspace.js`),
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
    expect(workspace.headers.get("content-security-policy")).toContain(
      "connect-src 'self' ws://127.0.0.1:3000",
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      code: "workspace_not_found",
      message: "Workspace not found",
    });
  });

  it("lazily owns one fresh or named session attachment per live connection", async () => {
    const fixture = await createFixture();
    const bootWorkspace = vi.fn((registered: RegisteredWorkspace) =>
      createServerWorkspaceRuntime({
        registered,
        piAppDataDir: join(fixture.root, "server-profile", "pi"),
      }),
    );
    await using host = await createServerHost({
      registryPath: fixture.registryPath,
      publicOrigin: "http://127.0.0.1:3000",
      assetRoot: fixture.assetRoot,
      bootWorkspace,
    });
    const address = await host.listen({ host: "127.0.0.1", port: 0 });
    const liveAddress = address.replace(/^http/, "ws");

    await fetch(`${address}/workspaces/reference`);
    expect(bootWorkspace).not.toHaveBeenCalled();

    const first = await openLiveConnection(
      `${liveAddress}/workspaces/reference`,
    );
    const second = await openLiveConnection(
      `${liveAddress}/workspaces/reference`,
    );
    expect(first.ready.sessionId).not.toBe(second.ready.sessionId);
    expect(first.ready.canonicalPath).toBe(
      `/workspaces/reference/sessions/${first.ready.sessionId}`,
    );
    expect(second.ready.canonicalPath).toBe(
      `/workspaces/reference/sessions/${second.ready.sessionId}`,
    );
    expect(bootWorkspace).toHaveBeenCalledOnce();

    const peer = await openLiveConnection(
      `${liveAddress}/workspaces/reference/sessions/${first.ready.sessionId}`,
    );
    expect(peer.ready).toEqual(first.ready);
    expect(bootWorkspace).toHaveBeenCalledOnce();

    await closeLiveConnection(first.socket);
    expect(second.socket.readyState).toBe(WebSocket.OPEN);
    expect(peer.socket.readyState).toBe(WebSocket.OPEN);
    await Promise.all([
      closeLiveConnection(second.socket),
      closeLiveConnection(peer.socket),
    ]);

    const reopened = await openLiveConnection(
      `${liveAddress}/workspaces/reference/sessions/${first.ready.sessionId}`,
    );
    expect(reopened.ready.sessionId).toBe(first.ready.sessionId);
    expect(bootWorkspace).toHaveBeenCalledTimes(2);
    await closeLiveConnection(reopened.socket);
  });

  it("retains workspace ownership until attachment creation settles after disconnect", async () => {
    const fixture = await createFixture();
    const attachmentStarted = deferred();
    const attachmentCreation = deferred<CreatedAttachment>();
    const runtimeDisposal = vi.fn(() => Promise.resolve());
    const runtime = createDeferredWorkspaceRuntime(
      toWorkspaceId("reference"),
      attachmentStarted,
      attachmentCreation,
      runtimeDisposal,
    );
    await using host = await createServerHost({
      registryPath: fixture.registryPath,
      publicOrigin: "http://127.0.0.1:3000",
      assetRoot: fixture.assetRoot,
      bootWorkspace: () => Promise.resolve(runtime),
    });
    const address = await host.listen({ host: "127.0.0.1", port: 0 });
    const socket = new WebSocket(
      `${address.replace(/^http/, "ws")}/workspaces/reference`,
    );

    await attachmentStarted.promise;
    await closeLiveConnection(socket);
    expect(runtimeDisposal).not.toHaveBeenCalled();

    const created = createAttachmentFixture(runtime.workspaceId);
    attachmentCreation.resolve(created.value);
    await vi.waitFor(() => {
      expect(created.disposal).toHaveBeenCalledOnce();
      expect(runtimeDisposal).toHaveBeenCalledOnce();
    });
  });
});

async function openLiveConnection(location: string): Promise<{
  readonly socket: WebSocket;
  readonly ready: LiveReadyFrame;
}> {
  const socket = new WebSocket(location);
  const ready = await new Promise<LiveReadyFrame>((resolve, reject) => {
    socket.addEventListener(
      "message",
      (event) => {
        try {
          resolve(
            parseLiveReadyFrame(JSON.parse(String(event.data)) as unknown),
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
        reject(new Error(`Live connection failed: ${location}`));
      },
      { once: true },
    );
    socket.addEventListener(
      "close",
      (event) => {
        reject(
          new Error(
            `Live connection closed before ready: ${String(event.code)} ${event.reason}`,
          ),
        );
      },
      { once: true },
    );
  });
  return { socket, ready };
}

async function closeLiveConnection(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return;
  const closed = new Promise<void>((resolve) => {
    socket.addEventListener(
      "close",
      () => {
        resolve();
      },
      { once: true },
    );
  });
  socket.close(1000, "Test complete");
  await closed;
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
    reload: () => Promise.reject(new Error("Unexpected runtime reload")),
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
    prepareDispatch: () => {
      throw new Error("Unexpected dispatch preparation");
    },
    retarget: () => Promise.reject(new Error("Unexpected retarget")),
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
  ]);
  return {
    root,
    registryPath: join(root, "server.workspaces.json"),
    assetRoot,
  };
}
