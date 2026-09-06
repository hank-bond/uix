import { Type } from "typebox";
import { describe, expect, it } from "vitest";

import {
  decodeRouteUrlParts,
  encodeRouteUrlParts,
  matchRoutePath,
  normalizeRoutePattern,
} from "./path-pattern";

const Query = Type.Object({
  v: Type.Optional(Type.String()),
});

describe("normalizeRoutePattern", () => {
  it("normalizes static, param, and terminal splat segments", () => {
    const pattern = normalizeRoutePattern({
      path: "/documents/:id/:rest*",
    });

    expect(pattern.segments).toEqual([
      { kind: "static", value: "documents" },
      { kind: "param", name: "id" },
      { kind: "splat", name: "rest" },
    ]);
  });

  it("rejects malformed declarations", () => {
    expect(() => normalizeRoutePattern({ path: "documents/:id" })).toThrow(
      "Expected leading /",
    );
    expect(() => normalizeRoutePattern({ path: "/documents//:id" })).toThrow(
      "Empty segments are not allowed",
    );
    expect(() => normalizeRoutePattern({ path: "/:id/:id" })).toThrow(
      "Duplicate route pattern param: id",
    );
    expect(() => normalizeRoutePattern({ path: "/:rest*/tail" })).toThrow(
      "splat param rest must be terminal",
    );
    expect(() => normalizeRoutePattern({ path: "/:bad-name" })).toThrow(
      "Invalid route pattern param",
    );
    expect(() => normalizeRoutePattern({ path: "/doc?x=1" })).toThrow(
      "Query and hash are declared separately",
    );
  });
});

describe("encodeRouteUrlParts", () => {
  it("encodes a feature-relative path and validated query", () => {
    const pattern = normalizeRoutePattern({
      path: "/documents/:id/:rest*",
      query: Query,
    });

    expect(
      encodeRouteUrlParts(pattern, {
        params: { id: "security review", rest: ["src", "index.ts"] },
        query: { v: "one two" },
      }),
    ).toEqual({
      pathname: "/documents/security%20review/src/index.ts",
      search: "?v=one+two",
    });
  });

  it("rejects malformed params and undeclared query", () => {
    const pattern = normalizeRoutePattern({ path: "/documents/:id" });

    expect(() => encodeRouteUrlParts(pattern, { params: {} })).toThrow(
      "Missing route pattern param: id",
    );
    expect(() =>
      encodeRouteUrlParts(pattern, {
        params: { id: "main", extra: "nope" },
      }),
    ).toThrow("Unexpected route pattern param: extra");
    expect(() =>
      encodeRouteUrlParts(pattern, {
        params: { id: "reports/security-review" },
      }),
    ).toThrow("expected non-empty path segment");
    expect(() =>
      encodeRouteUrlParts(pattern, {
        params: { id: "main" },
        query: { v: "1" },
      }),
    ).toThrow("does not declare query params");
  });
});

describe("matchRoutePath", () => {
  it("matches a pathname without validating query values", () => {
    const pattern = normalizeRoutePattern({
      path: "/documents/:id",
      query: Query,
    });

    expect(matchRoutePath(pattern, "/documents/main")).toEqual({ ok: true });
    expect(matchRoutePath(pattern, "/reports/main")).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(matchRoutePath(pattern, "/documents/%E0%A4%A")).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe("decodeRouteUrlParts", () => {
  it("decodes static, param, splat, and query values", () => {
    const pattern = normalizeRoutePattern({
      path: "/documents/:id/:rest*",
      query: Query,
    });

    expect(
      decodeRouteUrlParts(pattern, {
        pathname: "/documents/security%20review/src/index.ts",
        searchParams: new URLSearchParams("v=one+two"),
      }),
    ).toEqual({
      ok: true,
      value: {
        params: { id: "security review", rest: ["src", "index.ts"] },
        query: { v: "one two" },
      },
    });
  });

  it.each([undefined, Type.Object({}, { additionalProperties: false })])(
    "rejects undeclared prototype-named query keys with schema %j",
    (query) => {
      const pattern = normalizeRoutePattern({ path: "/view", query });
      for (const search of [
        "__proto__=1",
        "%5F%5Fproto%5F%5F=1",
        "constructor=1",
        "toString=1",
      ]) {
        expect(
          decodeRouteUrlParts(pattern, {
            pathname: "/view",
            searchParams: new URLSearchParams(search),
          }),
        ).toMatchObject({ ok: false, status: 400 });
      }
    },
  );

  it("rejects duplicate prototype-named query keys before schema validation", () => {
    const pattern = normalizeRoutePattern({ path: "/view" });
    expect(
      decodeRouteUrlParts(pattern, {
        pathname: "/view",
        searchParams: new URLSearchParams("__proto__=1&%5F%5Fproto%5F%5F=2"),
      }),
    ).toEqual({
      ok: false,
      status: 400,
      reason: "Duplicate query param: __proto__.",
    });
  });

  it("distinguishes route mismatch from malformed input", () => {
    const pattern = normalizeRoutePattern({
      path: "/documents/:id",
      query: Query,
    });

    expect(
      decodeRouteUrlParts(pattern, {
        pathname: "/reports/main",
        searchParams: new URLSearchParams(),
      }),
    ).toMatchObject({ ok: false, status: 404 });
    expect(
      decodeRouteUrlParts(pattern, {
        pathname: "/documents/%E0%A4%A",
        searchParams: new URLSearchParams(),
      }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      decodeRouteUrlParts(pattern, {
        pathname: "/documents/main",
        searchParams: new URLSearchParams("v=1&v=2"),
      }),
    ).toEqual({ ok: false, status: 400, reason: "Duplicate query param: v." });
  });
});
