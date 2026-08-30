import { describe, expect, it } from "vitest";

import { toWorkspaceId } from "@uix/runtime/workspace";

import {
  derivePublicOriginRejection,
  normalizePublicOrigin,
  toWorkspaceLocation,
} from "./public-origin";

describe("public origin", () => {
  it("normalizes an HTTP authority and derives an absolute workspace location", () => {
    const origin = normalizePublicOrigin("https://uix.example:8443/");

    expect(origin).toBe("https://uix.example:8443");
    expect(toWorkspaceLocation(origin, toWorkspaceId("reference"))).toBe(
      "https://uix.example:8443/workspaces/reference",
    );
  });

  it("accepts only the configured request authority and browser origin", () => {
    const publicOrigin = "https://uix.example:8443";

    expect(
      derivePublicOriginRejection(
        publicOrigin,
        "UIX.EXAMPLE:8443",
        "https://uix.example:8443",
      ),
    ).toBeUndefined();
    expect(
      derivePublicOriginRejection(
        publicOrigin,
        "private.internal:3000",
        undefined,
      ),
    ).toMatchObject({
      status: 421,
      code: "public_authority_mismatch",
    });
    expect(
      derivePublicOriginRejection(
        publicOrigin,
        "uix.example:8443",
        "https://other.example",
      ),
    ).toMatchObject({
      status: 403,
      code: "browser_origin_mismatch",
    });
    expect(
      derivePublicOriginRejection(publicOrigin, "uix.example/path", undefined),
    ).toMatchObject({ code: "public_authority_mismatch" });
  });

  it.each([
    "file:///tmp/uix",
    "https://user:secret@uix.example",
    "https://uix.example/base",
    "https://uix.example/?origin=other",
    "https://uix.example/#other",
  ])("rejects a value that is not a public origin: %s", (value) => {
    expect(() => normalizePublicOrigin(value)).toThrow();
  });
});
