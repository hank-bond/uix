import { Type } from "typebox";
import { describe, expect, it } from "vitest";

import { normalizeResourceRoute } from "@uix/api/resource-routes";

import {
  registerResourceContributions,
  ResourceRegistry,
} from "./resource-registry";

function createTestRegistry(): ResourceRegistry {
  return new ResourceRegistry({ workspaceId: "blue-river" });
}

describe("ResourceRegistry", () => {
  it("dispatches resource requests through parsed route context", async () => {
    using registry = createTestRegistry();
    using resources = registerResourceContributions(registry, "canvas", [
      {
        name: "doc",
        route: normalizeResourceRoute({ path: "/:key*", origin: "feature" }),
        handler: ({ params }) =>
          new Response(`hello ${JSON.stringify(params["key"])}`, {
            status: 200,
          }),
      },
    ]);

    const response = await registry.dispatch(
      new Request("uix-resource://canvas.blue-river/doc/reports/security"),
    );
    expect(await response.text()).toBe('hello ["reports","security"]');

    resources[Symbol.dispose]();
    const afterDispose = await registry.dispatch(
      new Request("uix-resource://canvas.blue-river/doc/reports/security"),
    );
    expect(afterDispose.status).toBe(404);
  });

  it("dispatches workspace-origin resources with feature in the path", async () => {
    using registry = createTestRegistry();
    using _resources = registerResourceContributions(registry, "reports", [
      {
        name: "doc",
        route: normalizeResourceRoute({ path: "/:id", origin: "workspace" }),
        handler: ({ params }) => new Response(String(params["id"])),
      },
    ]);

    const response = await registry.dispatch(
      new Request("uix-resource://blue-river/reports/doc/security-review"),
    );
    expect(await response.text()).toBe("security-review");
  });

  it("validates query before calling the contribution handler", async () => {
    using registry = createTestRegistry();
    let hasHandlerRun = false;
    using _resources = registerResourceContributions(registry, "canvas", [
      {
        name: "doc",
        route: normalizeResourceRoute({
          path: "/:key*",
          query: Type.Object({ v: Type.Optional(Type.String()) }),
          origin: "feature",
        }),
        handler: () => {
          hasHandlerRun = true;
          return new Response("ok");
        },
      },
    ]);

    const response = await registry.dispatch(
      new Request("uix-resource://canvas.blue-river/doc/main?v=1&v=2"),
    );
    expect(response.status).toBe(400);
    expect(hasHandlerRun).toBe(false);
  });

  it("rejects duplicate resource ids and resource types until disposed", () => {
    using registry = createTestRegistry();
    const doc = {
      name: "doc",
      route: normalizeResourceRoute({ path: "/:key*", origin: "feature" }),
      handler: () => new Response(""),
    };
    using resources = registerResourceContributions(registry, "canvas", [doc]);
    expect(() => {
      using _duplicate = registerResourceContributions(registry, "canvas", [
        doc,
      ]);
    }).toThrow("Resource already registered: canvas-doc");

    using collisionRegistry = createTestRegistry();
    using _collisionResources = registerResourceContributions(
      collisionRegistry,
      "canvas",
      [{ ...doc, name: "doc-html" }],
    );
    expect(() => {
      using _duplicate = registerResourceContributions(
        collisionRegistry,
        "canvas-doc",
        [{ ...doc, name: "html" }],
      );
    }).toThrow("Resource already registered: canvas-doc-html");

    resources[Symbol.dispose]();
    expect(() => {
      using _replacement = registerResourceContributions(registry, "canvas", [
        doc,
      ]);
    }).not.toThrow();
  });

  it("rolls back earlier resources when the bulk register operation fails", () => {
    using registry = createTestRegistry();
    const doc = {
      name: "doc",
      route: normalizeResourceRoute({ path: "/:key*", origin: "feature" }),
      handler: () => new Response("doc"),
    } as const;

    expect(() => {
      using _duplicates = registerResourceContributions(registry, "canvas", [
        doc,
        doc,
      ]);
    }).toThrow("Resource already registered: canvas-doc");
    expect(() => {
      using _resources = registerResourceContributions(registry, "canvas", [
        doc,
      ]);
    }).not.toThrow();
  });

  it("registers contribution groups and disposes them together", async () => {
    using registry = createTestRegistry();
    using resources = registerResourceContributions(registry, "canvas", [
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
    ]);

    const doc = await registry.dispatch(
      new Request("uix-resource://canvas.blue-river/doc/main"),
    );
    const asset = await registry.dispatch(
      new Request("uix-resource://canvas.blue-river/asset/main"),
    );
    expect(await doc.text()).toBe("doc");
    expect(await asset.text()).toBe("asset");

    resources[Symbol.dispose]();
    const missing = await registry.dispatch(
      new Request("uix-resource://canvas.blue-river/doc/main"),
    );
    expect(missing.status).toBe(404);
  });

  it("removes all routes and rejects registration after disposal", async () => {
    using registry = createTestRegistry();
    const doc = {
      name: "doc",
      route: normalizeResourceRoute({ path: "/:key*", origin: "feature" }),
      handler: () => new Response("doc"),
    };
    using _resources = registerResourceContributions(registry, "canvas", [doc]);
    registry[Symbol.dispose]();
    expect(
      await registry.dispatch(
        new Request("uix-resource://canvas.blue-river/doc/main"),
      ),
    ).toMatchObject({ status: 404 });
    expect(() => {
      using _rejected = registerResourceContributions(registry, "canvas", [
        doc,
      ]);
    }).toThrow("Resource registry is disposed");
  });
});
