import { describe, expect, expectTypeOf, it } from "vitest";

import type { FeatureWebRootUrl } from "@uix/api/feature-web-root-url";

import { decodeViewpointUrl, encodeFeatureWebRoot } from "./viewpoint-urls";

const address = {
  publicOrigin: "https://public.example:9443",
  workspaceId: "reference",
  binding: "opaque/token",
  featureId: "my_feature",
};

describe("viewpoint URLs", () => {
  it("round-trips opaque bindings and preserves native page addressing", () => {
    const root = encodeFeatureWebRoot(address);
    expectTypeOf(root).toEqualTypeOf<FeatureWebRootUrl>();
    expect(root).toBe(
      "https://public.example:9443/workspaces/reference/viewpoints/opaque%2Ftoken/my_feature/",
    );
    const page = new URL("view?key=reports%2Fmain", root);
    expect(decodeViewpointUrl(page, "reference")).toEqual({
      binding: "opaque/token",
      namespace: "my_feature",
      pathname: "/view",
      queryString: "key=reports%2Fmain",
    });
    expect(decodeViewpointUrl(new URL(root), "reference")?.pathname).toBe("/");
    for (const path of ["assets/site.css", "api/data"]) {
      expect(new URL(path, page).href).toBe(`${root}${path}`);
    }
    expect(new URL("#details", page).href).toBe(`${page.href}#details`);
    expect(new URL("?key=other", page).href).toBe(`${root}view?key=other`);
  });

  it.each(["view/", "nested/view", "view//", "%2Fview", "../view"])(
    "rejects alternate page locations: %s",
    (path) => {
      const url = new URL(path, encodeFeatureWebRoot(address));
      // Encoded slashes stay encoded for semantic route matching and cannot match /view.
      if (path === "%2Fview")
        expect(decodeViewpointUrl(url, "reference")?.pathname).toBe("/%2Fview");
      else expect(decodeViewpointUrl(url, "reference")).toBeUndefined();
    },
  );

  it.each([
    "/workspaces/other/viewpoints/token/canvas/view",
    "/workspaces/reference/viewpoints/token/canvas",
    "/workspaces/reference/viewpoints/token/Canvas/view",
    "/workspaces/reference/viewpoints/token/canvas.bad/view",
    "/workspaces/reference/viewpoints/%/canvas/view",
    "/workspaces/reference/viewpoints/%74oken/canvas/view",
    "/workspaces/reference/viewpoints/token/%63anvas/view",
    "/workspaces/reference/viewpoints//canvas/view",
  ])("rejects malformed and noncanonical roots: %s", (path) => {
    expect(
      decodeViewpointUrl(new URL(path, address.publicOrigin), "reference"),
    ).toBeUndefined();
  });

  it.each([
    { workspaceId: "../other" },
    { workspaceId: "" },
    { featureId: "" },
    { featureId: "invalid.id" },
    { binding: "" },
    { binding: "." },
    { binding: ".." },
    { publicOrigin: "file:///tmp" },
  ])("rejects invalid root inputs: %j", (input) => {
    expect(() => encodeFeatureWebRoot({ ...address, ...input })).toThrow();
  });
});
