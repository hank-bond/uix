import { describe, expect, expectTypeOf, it } from "vitest";

import type { FeatureWebRootUrl } from "@uix/api/feature-web-root-url";

import { decodeViewpointUrl, encodeFeatureWebRoot } from "./viewpoint-urls";

const snapshot = {
  workspaceId: "local",
  binding: "opaque/with spaces",
};

describe("Electron viewpoint URLs", () => {
  it("round trips an opaque binding and preserves the native feature directory", () => {
    const root = encodeFeatureWebRoot({
      ...snapshot,
      featureId: "canvas",
    });
    expectTypeOf(root).toEqualTypeOf<FeatureWebRootUrl>();
    const page = new URL("view?key=reports%2Fmain", root);
    expect(decodeViewpointUrl(page, "local")).toEqual({
      binding: snapshot.binding,
      namespace: "canvas",
      pathname: "/view",
      queryString: "key=reports%2Fmain",
    });
    expect(decodeViewpointUrl(new URL(root), "local")?.pathname).toBe("/");
    expect(new URL("assets/site.css", page).href).toBe(
      `${root}assets/site.css`,
    );
    expect(new URL("api/data", page).href).toBe(`${root}api/data`);
    expect(new URL("#details", page).href).toBe(`${page.href}#details`);
    expect(new URL("?key=other", page).href).toBe(`${root}view?key=other`);
  });

  it("round trips feature ids admitted by the substrate, including underscores", () => {
    const root = encodeFeatureWebRoot({
      ...snapshot,
      featureId: "my_feature",
    });
    expect(decodeViewpointUrl(new URL("view", root), "local")?.namespace).toBe(
      "my_feature",
    );
  });

  it.each([
    "uix-resource://canvas.local/token/view",
    "uix-resource://extra.canvas.viewpoint.local/token/view",
    "uix-resource://user@canvas.viewpoint.local/token/view",
    "uix-resource://canvas.viewpoint.local:123/token/view",
    "uix-resource://canvas.viewpoint.local/token",
    "uix-resource://canvas.viewpoint.local//view",
    "uix-resource://canvas.viewpoint.local/%74oken/view",
    "uix-resource://canvas.viewpoint.local/%ZZ/view",
    "uix-resource://canvas.viewpoint.local/token/view/",
    "uix-resource://canvas.viewpoint.local/token/nested/view",
    "uix-resource://canvas.viewpoint.local/token//view",
  ])("rejects alternate or malformed physical locations: %s", (address) => {
    expect(decodeViewpointUrl(new URL(address), "local")).toBeUndefined();
  });
});
