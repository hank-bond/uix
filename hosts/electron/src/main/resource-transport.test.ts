// Tests the Electron host adapter for the substrate resource protocol.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResourceProtocolScheme } from "@uix/api/resource-routes";
import { toWorkspaceId } from "@uix/runtime";
import type { ContentRequest } from "@uix/runtime/content-transport";

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  registerSchemesAsPrivileged: vi.fn(),
  unhandle: vi.fn(),
}));

vi.mock("electron", () => ({ protocol: electronMock }));

import {
  bindResourceProtocol,
  ElectronResourceTransport,
  registerResourceProtocol,
} from "./resource-transport";

beforeEach(() => {
  electronMock.handle.mockClear();
  electronMock.registerSchemesAsPrivileged.mockClear();
  electronMock.unhandle.mockClear();
});

describe("Electron resource transport", () => {
  it("registers the substrate resource protocol", () => {
    registerResourceProtocol();

    expect(electronMock.registerSchemesAsPrivileged).toHaveBeenCalledWith([
      {
        scheme: ResourceProtocolScheme,
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          corsEnabled: true,
        },
      },
    ]);
  });

  it("routes workspace and feature origins through the qualified runtime", async () => {
    const transport = new ElectronResourceTransport();
    const handler = vi.fn((content: ContentRequest) => {
      if (content.kind !== "resource")
        throw new Error("Unexpected viewpoint request");
      return Promise.resolve(
        new Response(content.request.url, { status: 200 }),
      );
    });
    const releaseGuard = vi.fn();
    const acquireWorkspaceGuard = vi.fn(() =>
      Promise.resolve({ [Symbol.dispose]: releaseGuard }),
    );
    const workspaceId = toWorkspaceId("local");
    using _workspaceLifetime = transport.registerWorkspace(
      workspaceId,
      acquireWorkspaceGuard,
    );
    using handlerLifetime = transport.createRegistrar(workspaceId)(handler);

    const workspaceRequest = new Request(
      "uix-resource://local/canvas/surface/index.js",
    );
    const featureRequest = new Request(
      "uix-resource://canvas.local/surface/index.js",
    );
    await expect(transport.handle(workspaceRequest)).resolves.toMatchObject({
      status: 200,
    });
    await expect(transport.handle(featureRequest)).resolves.toMatchObject({
      status: 200,
    });
    expect(handler).toHaveBeenNthCalledWith(1, {
      kind: "resource",
      request: workspaceRequest,
    });
    expect(handler).toHaveBeenNthCalledWith(2, {
      kind: "resource",
      request: featureRequest,
    });
    expect(acquireWorkspaceGuard).toHaveBeenNthCalledWith(
      1,
      "electron-resource",
    );
    expect(acquireWorkspaceGuard).toHaveBeenNthCalledWith(
      2,
      "electron-resource",
    );
    expect(releaseGuard).toHaveBeenCalledTimes(2);

    handlerLifetime[Symbol.dispose]();
    await expect(transport.handle(workspaceRequest)).resolves.toMatchObject({
      status: 503,
    });
    expect(releaseGuard).toHaveBeenCalledTimes(3);
  });

  it("resolves the current handler after guarded workspace acquisition", async () => {
    const transport = new ElectronResourceTransport();
    const workspaceId = toWorkspaceId("local");
    const oldHandler = vi.fn(() => Promise.resolve(new Response("old")));
    const currentHandler = vi.fn(() =>
      Promise.resolve(new Response("current")),
    );
    using lifetime = new DisposableStack();
    const oldHandlerLifetime = lifetime.use(
      transport.createRegistrar(workspaceId)(oldHandler),
    );
    lifetime.use(
      transport.registerWorkspace(workspaceId, () => {
        oldHandlerLifetime[Symbol.dispose]();
        lifetime.use(transport.createRegistrar(workspaceId)(currentHandler));
        return Promise.resolve({ [Symbol.dispose]: vi.fn() });
      }),
    );

    const response = await transport.handle(
      new Request("uix-resource://local/canvas/surface/index.js"),
    );

    await expect(response.text()).resolves.toBe("current");
    expect(oldHandler).not.toHaveBeenCalled();
    expect(currentHandler).toHaveBeenCalledOnce();
  });

  it("binds Electron's protocol once for the transport lifetime", () => {
    const transport = new ElectronResourceTransport();
    using lifetime = bindResourceProtocol(transport);

    expect(electronMock.handle).toHaveBeenCalledOnce();
    expect(electronMock.handle.mock.calls[0]?.[0]).toBe(ResourceProtocolScheme);
    lifetime[Symbol.dispose]();
    expect(electronMock.unhandle).toHaveBeenCalledWith(ResourceProtocolScheme);
  });
});
