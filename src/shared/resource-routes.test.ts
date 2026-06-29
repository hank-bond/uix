import { Type } from "typebox";
import { describe, expect, it } from "vitest";

import {
  decodeResourceUrl,
  encodeResourceUrl,
  normalizeResourceRoute,
  type ResourceUrl,
} from "./resource-routes";

const Query = Type.Object({
  v: Type.Optional(Type.String()),
});

describe("normalizeResourceRoute", () => {
  it("normalizes static, param, and splat segments", () => {
    const route = normalizeResourceRoute({
      path: "/documents/:id/:rest*",
      origin: "workspace",
    });

    expect(route.segments).toEqual([
      { kind: "static", value: "documents" },
      { kind: "param", name: "id" },
      { kind: "splat", name: "rest" },
    ]);
    expect(route.params).toEqual([
      { kind: "param", name: "id" },
      { kind: "splat", name: "rest" },
    ]);
  });

  it("rejects invalid declarations at initialization time", () => {
    expect(() =>
      normalizeResourceRoute({ path: "documents/:id", origin: "workspace" }),
    ).toThrow("Expected leading /");
    expect(() =>
      normalizeResourceRoute({ path: "/documents//:id", origin: "workspace" }),
    ).toThrow("Empty segments are not allowed");
    expect(() =>
      normalizeResourceRoute({ path: "/:id/:id", origin: "workspace" }),
    ).toThrow("Duplicate resource route param: id");
    expect(() =>
      normalizeResourceRoute({ path: "/:rest*/tail", origin: "workspace" }),
    ).toThrow("splat param rest must be terminal");
    expect(() =>
      normalizeResourceRoute({ path: "/:bad-name", origin: "workspace" }),
    ).toThrow("Invalid resource route param");
    expect(() =>
      normalizeResourceRoute({ path: "/doc?x=1", origin: "workspace" }),
    ).toThrow("Query and hash are declared separately");
    expect(() =>
      normalizeResourceRoute({ path: "/doc", origin: "app" as "workspace" }),
    ).toThrow("Invalid resource origin");
  });
});

describe("encodeResourceUrl", () => {
  it("encodes feature-origin resource URLs with route params and query", () => {
    const route = normalizeResourceRoute({
      path: "/:key*",
      query: Query,
      origin: "feature",
    });

    const url: ResourceUrl = encodeResourceUrl(route, {
      featureId: "canvas",
      name: "doc",
      workspaceId: "blue-river",
      params: { key: ["reports", "security-review"] },
      query: { v: "1" },
    });

    expect(url).toBe(
      "uix-resource://canvas.blue-river/doc/reports/security-review?v=1",
    );
  });

  it("encodes workspace-origin resource URLs under the workspace domain", () => {
    const route = normalizeResourceRoute({
      path: "/documents/:id/preview",
      origin: "workspace",
    });

    const url = encodeResourceUrl(route, {
      featureId: "reports",
      name: "doc",
      workspaceId: "blue-river",
      params: { id: "security-review" },
    });

    expect(url).toBe(
      "uix-resource://blue-river/reports/doc/documents/security-review/preview",
    );
  });

  it("rejects malformed params before producing a URL", () => {
    const route = normalizeResourceRoute({
      path: "/:id/:rest*",
      origin: "feature",
    });

    expect(() =>
      encodeResourceUrl(route, {
        featureId: "canvas",
        name: "doc",
        workspaceId: "local",
        params: { rest: [] },
      }),
    ).toThrow("Missing resource route param: id");
    expect(() =>
      encodeResourceUrl(route, {
        featureId: "canvas",
        name: "doc",
        workspaceId: "local",
        params: { id: "main", rest: [], extra: "nope" },
      }),
    ).toThrow("Unexpected resource route param: extra");
    expect(() =>
      encodeResourceUrl(route, {
        featureId: "canvas",
        name: "doc",
        workspaceId: "local",
        params: { id: ["main"], rest: [] },
      }),
    ).toThrow("Invalid resource route param id: expected string");
    expect(() =>
      encodeResourceUrl(route, {
        featureId: "canvas",
        name: "doc",
        workspaceId: "local",
        params: { id: "main", rest: "tail" },
      }),
    ).toThrow("Invalid resource route param rest: expected string array");
    expect(() =>
      encodeResourceUrl(route, {
        featureId: "canvas",
        name: "doc",
        workspaceId: "local",
        params: { id: "reports/security-review", rest: [] },
      }),
    ).toThrow("expected non-empty path segment");
  });

  it("validates query params with TypeBox", () => {
    const route = normalizeResourceRoute({
      path: "/:key*",
      query: Query,
      origin: "feature",
    });

    expect(() =>
      encodeResourceUrl(route, {
        featureId: "canvas",
        name: "doc",
        workspaceId: "local",
        params: { key: ["main"] },
        query: { v: 1 },
      }),
    ).toThrow("Parse");
  });

  it("rejects query params when no query schema is declared", () => {
    const route = normalizeResourceRoute({
      path: "/:key*",
      origin: "feature",
    });

    expect(() =>
      encodeResourceUrl(route, {
        featureId: "canvas",
        name: "doc",
        workspaceId: "local",
        params: { key: ["main"] },
        query: { v: "1" },
      }),
    ).toThrow("does not declare query params");
  });
});

describe("decodeResourceUrl", () => {
  it("decodes feature-origin resource URLs with route params and query", () => {
    const route = normalizeResourceRoute({
      path: "/:key*",
      query: Query,
      origin: "feature",
    });

    const result = decodeResourceUrl(route, {
      featureId: "canvas",
      name: "doc",
      workspaceId: "blue-river",
      url: "uix-resource://canvas.blue-river/doc/reports/security-review?v=1",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        featureId: "canvas",
        name: "doc",
        workspaceId: "blue-river",
        params: { key: ["reports", "security-review"] },
        query: { v: "1" },
      },
    });
  });

  it("decodes workspace-origin resource URLs", () => {
    const route = normalizeResourceRoute({
      path: "/documents/:id/preview",
      origin: "workspace",
    });

    const result = decodeResourceUrl(route, {
      featureId: "reports",
      name: "doc",
      workspaceId: "blue-river",
      url: "uix-resource://blue-river/reports/doc/documents/security-review/preview",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        featureId: "reports",
        name: "doc",
        workspaceId: "blue-river",
        params: { id: "security-review" },
        query: {},
      },
    });
  });

  it("reports 404 for origin, resource, and route mismatches", () => {
    const route = normalizeResourceRoute({
      path: "/doc/:id",
      origin: "feature",
    });

    expect(
      decodeResourceUrl(route, {
        featureId: "canvas",
        name: "doc",
        workspaceId: "local",
        url: "uix-resource://local/canvas/doc/doc/main",
      }),
    ).toMatchObject({ ok: false, status: 404 });
    expect(
      decodeResourceUrl(route, {
        featureId: "canvas",
        name: "doc",
        workspaceId: "local",
        url: "uix-resource://canvas.local/asset/doc/main",
      }),
    ).toMatchObject({ ok: false, status: 404 });
    expect(
      decodeResourceUrl(route, {
        featureId: "canvas",
        name: "doc",
        workspaceId: "local",
        url: "uix-resource://canvas.local/doc/missing/main",
      }),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("reports 400 for malformed paths and invalid query", () => {
    const route = normalizeResourceRoute({
      path: "/:key*",
      query: Query,
      origin: "feature",
    });

    expect(
      decodeResourceUrl(route, {
        featureId: "canvas",
        name: "doc",
        workspaceId: "local",
        url: "uix-resource://canvas.local/doc/%E0%A4%A?v=1",
      }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      decodeResourceUrl(route, {
        featureId: "canvas",
        name: "doc",
        workspaceId: "local",
        url: "uix-resource://canvas.local/doc/main?v=1&v=2",
      }),
    ).toEqual({ ok: false, status: 400, reason: "Duplicate query param: v." });
  });
});
