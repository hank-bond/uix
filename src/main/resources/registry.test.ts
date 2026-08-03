// Verifies protocol privileges, route dispatch, validation status, collision rollback, grouped lifetimes, and transport disposal.

import { Type } from "typebox";
import { describe, expect, it } from "vitest";

import {
  normalizeResourceRoute,
  ResourceProtocolScheme,
} from "@uix/api/resource-routes";

import {
  registerResourceContributions,
  registerResourceProtocol,
  ResourceRegistry,
} from "./registry";

function fakeTransport(): {
  handlers: Map<string, (request: Request) => Response | Promise<Response>>;
  disposed: string[];
  register(
    scheme: string,
    handler: (request: Request) => Response | Promise<Response>,
  ): { [Symbol.dispose](): void };
} {
  const handlers = new Map<
    string,
    (request: Request) => Response | Promise<Response>
  >();
  const disposed: string[] = [];

  return {
    handlers,
    disposed,
    register(
      scheme: string,
      handler: (request: Request) => Response | Promise<Response>,
    ) {
      handlers.set(scheme, handler);
      return {
        [Symbol.dispose]() {
          disposed.push(scheme);
          handlers.delete(scheme);
        },
      };
    },
  };
}

function createTestRegistry(transport = fakeTransport()): {
  registry: ResourceRegistry;
  transport: ReturnType<typeof fakeTransport>;
} {
  const registry = new ResourceRegistry({
    workspaceId: "blue-river",
    transportRegistrar: (scheme, handler) =>
      transport.register(scheme, handler),
  });
  return { registry, transport };
}

describe("registerResourceProtocol", () => {
  it("registers the substrate resource protocol", () => {
    const registered: Electron.CustomScheme[][] = [];

    registerResourceProtocol((schemes) => registered.push(schemes));

    expect(registered).toEqual([
      [
        {
          scheme: ResourceProtocolScheme,
          privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
          },
        },
      ],
    ]);
  });
});

describe("ResourceRegistry", () => {
  it("dispatches resource requests through parsed route context", async () => {
    const { registry, transport } = createTestRegistry();

    const resourcesDisposable = registerResourceContributions(
      registry,
      "canvas",
      [
        {
          name: "doc",
          route: normalizeResourceRoute({ path: "/:key*", origin: "feature" }),
          handler: ({ params }) =>
            new Response(`hello ${JSON.stringify(params["key"])}`, {
              status: 200,
            }),
        },
      ],
    );

    const response = await transport.handlers.get(ResourceProtocolScheme)?.(
      new Request("uix-resource://canvas.blue-river/doc/reports/security"),
    );

    expect(await response?.text()).toBe('hello ["reports","security"]');

    resourcesDisposable[Symbol.dispose]();

    const afterDispose = await transport.handlers.get(ResourceProtocolScheme)?.(
      new Request("uix-resource://canvas.blue-river/doc/reports/security"),
    );
    expect(afterDispose?.status).toBe(404);
  });

  it("dispatches workspace-origin resources with feature in the path", async () => {
    const { registry, transport } = createTestRegistry();

    registerResourceContributions(registry, "reports", [
      {
        name: "doc",
        route: normalizeResourceRoute({ path: "/:id", origin: "workspace" }),
        handler: ({ params }) => new Response(String(params["id"])),
      },
    ]);

    const response = await transport.handlers.get(ResourceProtocolScheme)?.(
      new Request("uix-resource://blue-river/reports/doc/security-review"),
    );

    expect(await response?.text()).toBe("security-review");
  });

  it("validates query before calling the contribution handler", async () => {
    const { registry, transport } = createTestRegistry();
    let called = false;

    registerResourceContributions(registry, "canvas", [
      {
        name: "doc",
        route: normalizeResourceRoute({
          path: "/:key*",
          query: Type.Object({ v: Type.Optional(Type.String()) }),
          origin: "feature",
        }),
        handler: () => {
          called = true;
          return new Response("ok");
        },
      },
    ]);

    const response = await transport.handlers.get(ResourceProtocolScheme)?.(
      new Request("uix-resource://canvas.blue-river/doc/main?v=1&v=2"),
    );

    expect(response?.status).toBe(400);
    expect(called).toBe(false);
  });

  it("rejects duplicate resource ids and resource types until disposed", () => {
    const { registry } = createTestRegistry();

    const resourcesDisposable = registerResourceContributions(
      registry,
      "canvas",
      [
        {
          name: "doc",
          route: normalizeResourceRoute({ path: "/:key*", origin: "feature" }),
          handler: () => new Response(""),
        },
      ],
    );

    expect(() =>
      registerResourceContributions(registry, "canvas", [
        {
          name: "doc",
          route: normalizeResourceRoute({ path: "/:key*", origin: "feature" }),
          handler: () => new Response(""),
        },
      ]),
    ).toThrow("Resource already registered: canvas-doc");

    const collision = createTestRegistry();
    registerResourceContributions(collision.registry, "canvas", [
      {
        name: "doc-html",
        route: normalizeResourceRoute({ path: "/:key*", origin: "feature" }),
        handler: () => new Response(""),
      },
    ]);
    expect(() =>
      registerResourceContributions(collision.registry, "canvas-doc", [
        {
          name: "html",
          route: normalizeResourceRoute({ path: "/:key*", origin: "feature" }),
          handler: () => new Response(""),
        },
      ]),
    ).toThrow("Resource already registered: canvas-doc-html");

    resourcesDisposable[Symbol.dispose]();

    expect(() =>
      registerResourceContributions(registry, "canvas", [
        {
          name: "doc",
          route: normalizeResourceRoute({ path: "/:key*", origin: "feature" }),
          handler: () => new Response(""),
        },
      ]),
    ).not.toThrow();
  });

  it("rolls back earlier resources when the bulk register operation fails", () => {
    const { registry } = createTestRegistry();
    const doc = {
      name: "doc",
      route: normalizeResourceRoute({ path: "/:key*", origin: "feature" }),
      handler: () => new Response("doc"),
    } as const;

    expect(() =>
      registerResourceContributions(registry, "canvas", [doc, doc]),
    ).toThrow("Resource already registered: canvas-doc");

    expect(() =>
      registerResourceContributions(registry, "canvas", [doc]),
    ).not.toThrow();
  });

  it("registers contribution groups and disposes them together", async () => {
    const { registry, transport } = createTestRegistry();

    const resourcesDisposable = registerResourceContributions(
      registry,
      "canvas",
      [
        {
          name: "doc",
          route: normalizeResourceRoute({ path: "/:key*", origin: "feature" }),
          handler: () => new Response("doc"),
        },
        {
          name: "asset",
          route: normalizeResourceRoute({ path: "/:key*", origin: "feature" }),
          handler: () => new Response("asset"),
        },
      ],
    );

    const doc = await transport.handlers.get(ResourceProtocolScheme)?.(
      new Request("uix-resource://canvas.blue-river/doc/main"),
    );
    const asset = await transport.handlers.get(ResourceProtocolScheme)?.(
      new Request("uix-resource://canvas.blue-river/asset/main"),
    );
    expect(await doc?.text()).toBe("doc");
    expect(await asset?.text()).toBe("asset");

    resourcesDisposable[Symbol.dispose]();

    const missing = await transport.handlers.get(ResourceProtocolScheme)?.(
      new Request("uix-resource://canvas.blue-river/doc/main"),
    );
    expect(missing?.status).toBe(404);
  });

  it("disposes the transport handler when the registry is disposed", () => {
    const { registry, transport } = createTestRegistry();

    registry[Symbol.dispose]();

    expect(transport.handlers.has(ResourceProtocolScheme)).toBe(false);
    expect(transport.disposed).toEqual([ResourceProtocolScheme]);
  });
});
