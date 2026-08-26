import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { CreateServerHostOptions, ServerHost } from "./server";
import { startServer } from "./start";

describe("server startup", () => {
  it("reports invalid process configuration without attempting host creation", async () => {
    const createHost = vi.fn();

    const result = await startServer({
      environment: { UIX_SERVER_PORT: "invalid" },
      cwd: "/private/server",
      assetRoot: "/private/assets",
      createHost,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { message: "Invalid UIX_SERVER_PORT: invalid" },
    });
    expect(createHost).not.toHaveBeenCalled();
  });

  it("disposes a created host when listener admission fails", async () => {
    const listenerError = new Error("address already in use");
    const dispose = vi.fn(() => Promise.resolve());
    const host = createHostFixture({
      listen: vi.fn(() => Promise.reject(listenerError)),
      dispose,
    });

    const result = await startServer({
      environment: {},
      cwd: "/private/server",
      assetRoot: "/private/assets",
      createHost: vi.fn(() => Promise.resolve(host)),
    });

    expect(result).toEqual({ ok: false, error: listenerError });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("reports a cleanup failure without hiding the startup failure", async () => {
    const listenerError = new Error("listener failed");
    const cleanupError = new Error("cleanup failed");
    const host = createHostFixture({
      listen: vi.fn(() => Promise.reject(listenerError)),
      dispose: vi.fn(() => Promise.reject(cleanupError)),
    });

    const result = await startServer({
      environment: {},
      cwd: "/private/server",
      assetRoot: "/private/assets",
      createHost: vi.fn(() => Promise.resolve(host)),
    });

    expect(result).toEqual({ ok: false, error: listenerError, cleanupError });
  });

  it("returns the admitted host with canonical startup configuration", async () => {
    const listen = vi.fn(() => Promise.resolve("http://127.0.0.1:4312"));
    const host = createHostFixture({ listen });
    const createHost = vi.fn((_options: CreateServerHostOptions) =>
      Promise.resolve(host),
    );

    const result = await startServer({
      environment: {
        UIX_SERVER_PORT: "4312",
        UIX_SERVER_REGISTRY: "config/workspaces.json",
        UIX_PUBLIC_ORIGIN: "https://uix.example",
      },
      cwd: "/private/server",
      assetRoot: "/private/assets",
      createHost,
    });

    expect(result).toEqual({
      ok: true,
      host,
      address: "http://127.0.0.1:4312",
      publicOrigin: "https://uix.example",
      registryPath: join("/private/server", "config/workspaces.json"),
      piAppDataDir: join("/private/server", ".uix-server", "pi"),
    });
    expect(createHost.mock.calls[0]?.[0]).toMatchObject({
      registryPath: join("/private/server", "config/workspaces.json"),
      publicOrigin: "https://uix.example",
      assetRoot: "/private/assets",
    });
    expect(createHost.mock.calls[0]?.[0]?.bootWorkspace).toBeTypeOf("function");
    expect(listen).toHaveBeenCalledWith({ host: "127.0.0.1", port: 4312 });
  });
});

function createHostFixture(options: {
  readonly listen: ServerHost["listen"];
  readonly dispose?: () => Promise<void>;
}): ServerHost {
  return {
    listen: options.listen,
    [Symbol.asyncDispose]: options.dispose ?? (() => Promise.resolve()),
  };
}
