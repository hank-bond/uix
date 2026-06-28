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
          featureId: "canvas",
          contributions: [
            {
              name: "doc",
              privileges: { standard: true, secure: true },
            },
          ],
        },
      ],
      (schemes) => registered.push(schemes),
    );

    expect(registered).toEqual([
      [
        {
          scheme: "canvas-doc",
          privileges: { standard: true, secure: true },
        },
      ],
    ]);
  });

  it("rejects duplicate scheme contribution ids and names", () => {
    expect(() =>
      registerResourceSchemeContributions(
        [
          {
            featureId: "canvas",
            contributions: [
              { name: "doc", privileges: {} },
              { name: "doc", privileges: {} },
            ],
          },
        ],
        () => undefined,
      ),
    ).toThrow(
      "Resource scheme contribution already registered: canvas.resource.doc",
    );

    expect(() =>
      registerResourceSchemeContributions(
        [
          {
            featureId: "canvas",
            contributions: [{ name: "doc-html", privileges: {} }],
          },
          {
            featureId: "canvas-doc",
            contributions: [{ name: "html", privileges: {} }],
          },
        ],
        () => undefined,
      ),
    ).toThrow("Resource scheme already registered: canvas-doc-html");
  });
});

describe("ResourceRegistry", () => {
  it("registers resource handlers and disposes them", async () => {
    const transport = fakeTransport();
    const registry = createResourceRegistry({
      handle: (scheme, fn) => transport.handle(scheme, fn),
      unhandle: (scheme) => transport.unhandle(scheme),
    });

    const registration = registerResourceContributions(registry, "canvas", [
      {
        name: "doc",
        handle: () => new Response("hello", { status: 200 }),
      },
    ]);

    const response = await transport.handlers.get("canvas-doc")?.(
      new Request("canvas-doc://main/"),
    );

    expect(await response?.text()).toBe("hello");

    registration[Symbol.dispose]();

    expect(transport.handlers.has("canvas-doc")).toBe(false);
    expect(transport.disposed).toEqual(["canvas-doc"]);
  });

  it("rejects duplicate resource ids and schemes until disposed", () => {
    const transport = fakeTransport();
    const registry = createResourceRegistry({
      handle: (scheme, fn) => transport.handle(scheme, fn),
      unhandle: (scheme) => transport.unhandle(scheme),
    });

    const registration = registerResourceContributions(registry, "canvas", [
      {
        name: "doc",
        handle: () => new Response(""),
      },
    ]);

    expect(() =>
      registerResourceContributions(registry, "canvas", [
        {
          name: "doc",
          handle: () => new Response(""),
        },
      ]),
    ).toThrow("Resource contribution already registered: canvas.resource.doc");
    const collisionTransport = fakeTransport();
    const collisionRegistry = createResourceRegistry({
      handle: (scheme, fn) => collisionTransport.handle(scheme, fn),
      unhandle: (scheme) => collisionTransport.unhandle(scheme),
    });
    registerResourceContributions(collisionRegistry, "canvas", [
      {
        name: "doc-html",
        handle: () => new Response(""),
      },
    ]);
    expect(() =>
      registerResourceContributions(collisionRegistry, "canvas-doc", [
        {
          name: "html",
          handle: () => new Response(""),
        },
      ]),
    ).toThrow("Resource scheme already handled: canvas-doc-html");

    registration[Symbol.dispose]();

    expect(() =>
      registerResourceContributions(registry, "canvas", [
        {
          name: "doc",
          handle: () => new Response(""),
        },
      ]),
    ).not.toThrow();
  });

  it("registers contribution groups and disposes them together", () => {
    const transport = fakeTransport();
    const registry = createResourceRegistry({
      handle: (scheme, fn) => transport.handle(scheme, fn),
      unhandle: (scheme) => transport.unhandle(scheme),
    });

    const registration = registerResourceContributions(registry, "canvas", [
      {
        name: "doc",
        handle: () => new Response(""),
      },
      {
        name: "asset",
        handle: () => new Response(""),
      },
    ]);

    expect([...transport.handlers.keys()].sort()).toEqual([
      "canvas-asset",
      "canvas-doc",
    ]);

    registration[Symbol.dispose]();

    expect(transport.handlers.size).toBe(0);
    expect(transport.disposed).toEqual(["canvas-asset", "canvas-doc"]);
  });
});
