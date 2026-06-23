import { describe, expect, it } from "vitest";

import {
  createResourceRegistry,
  registerResourceContributions,
  registerResourceSchemeContributions,
} from "./registry";

function fakeTransport() {
  const handlers = new Map<
    string,
    (request: Request) => Response | Promise<Response>
  >();
  const disposed: string[] = [];

  return {
    handlers,
    disposed,
    handle(
      scheme: string,
      fn: (request: Request) => Response | Promise<Response>,
    ) {
      handlers.set(scheme, fn);
    },
    unhandle(scheme: string) {
      disposed.push(scheme);
      handlers.delete(scheme);
    },
  };
}

describe("registerResourceSchemeContributions", () => {
  it("registers Electron scheme privileges in one batch", () => {
    const registered: Electron.CustomScheme[][] = [];

    registerResourceSchemeContributions(
      [
        {
          id: "canvas.resource.scheme",
          scheme: "uix-canvas",
          privileges: { standard: true, secure: true },
        },
      ],
      (schemes) => registered.push(schemes),
    );

    expect(registered).toEqual([
      [
        {
          scheme: "uix-canvas",
          privileges: { standard: true, secure: true },
        },
      ],
    ]);
  });

  it("rejects duplicate scheme ids and names", () => {
    expect(() =>
      registerResourceSchemeContributions(
        [
          {
            id: "canvas.resource.scheme",
            scheme: "uix-canvas",
            privileges: {},
          },
          {
            id: "canvas.resource.scheme",
            scheme: "uix-other",
            privileges: {},
          },
        ],
        () => undefined,
      ),
    ).toThrow(
      "Resource scheme contribution already registered: canvas.resource.scheme",
    );

    expect(() =>
      registerResourceSchemeContributions(
        [
          {
            id: "canvas.resource.scheme",
            scheme: "uix-canvas",
            privileges: {},
          },
          {
            id: "other.resource.scheme",
            scheme: "uix-canvas",
            privileges: {},
          },
        ],
        () => undefined,
      ),
    ).toThrow("Resource scheme already registered: uix-canvas");
  });
});

describe("ResourceRegistry", () => {
  it("registers resource handlers and disposes them", async () => {
    const transport = fakeTransport();
    const registry = createResourceRegistry({
      handle: (scheme, fn) => transport.handle(scheme, fn),
      unhandle: (scheme) => transport.unhandle(scheme),
    });

    const registration = registry.register({
      id: "canvas.resource.html",
      scheme: "uix-canvas",
      handle: () => new Response("hello", { status: 200 }),
    });

    const response = await transport.handlers.get("uix-canvas")?.(
      new Request("uix-canvas://main/"),
    );

    expect(await response?.text()).toBe("hello");

    registration[Symbol.dispose]();

    expect(transport.handlers.has("uix-canvas")).toBe(false);
    expect(transport.disposed).toEqual(["uix-canvas"]);
  });

  it("rejects duplicate resource ids and schemes until disposed", () => {
    const transport = fakeTransport();
    const registry = createResourceRegistry({
      handle: (scheme, fn) => transport.handle(scheme, fn),
      unhandle: (scheme) => transport.unhandle(scheme),
    });

    const registration = registry.register({
      id: "canvas.resource.html",
      scheme: "uix-canvas",
      handle: () => new Response(""),
    });

    expect(() =>
      registry.register({
        id: "canvas.resource.html",
        scheme: "uix-other",
        handle: () => new Response(""),
      }),
    ).toThrow("Resource contribution already registered: canvas.resource.html");
    expect(() =>
      registry.register({
        id: "other.resource.html",
        scheme: "uix-canvas",
        handle: () => new Response(""),
      }),
    ).toThrow("Resource scheme already handled: uix-canvas");

    registration[Symbol.dispose]();

    expect(() =>
      registry.register({
        id: "canvas.resource.html",
        scheme: "uix-canvas",
        handle: () => new Response(""),
      }),
    ).not.toThrow();
  });

  it("registers contribution groups and disposes them together", () => {
    const transport = fakeTransport();
    const registry = createResourceRegistry({
      handle: (scheme, fn) => transport.handle(scheme, fn),
      unhandle: (scheme) => transport.unhandle(scheme),
    });

    const registration = registerResourceContributions(registry, [
      {
        id: "canvas.resource.html",
        scheme: "uix-canvas",
        handle: () => new Response(""),
      },
      {
        id: "assets.resource.files",
        scheme: "uix-asset",
        handle: () => new Response(""),
      },
    ]);

    expect([...transport.handlers.keys()].sort()).toEqual([
      "uix-asset",
      "uix-canvas",
    ]);

    registration[Symbol.dispose]();

    expect(transport.handlers.size).toBe(0);
    expect(transport.disposed).toEqual(["uix-asset", "uix-canvas"]);
  });
});
