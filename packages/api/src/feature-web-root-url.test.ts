import { describe, expect, expectTypeOf, it } from "vitest";

import {
  type FeatureWebRootUrl,
  parseFeatureWebRootUrl,
} from "./feature-web-root-url";
import type { ResourceUrl } from "./resource-routes";

describe("feature web root URLs", () => {
  it.each([
    "https://host.example/workspaces/w/viewpoints/binding/canvas/",
    "http://127.0.0.1:8080/workspaces/w/viewpoints/binding/canvas/",
    "uix-resource://canvas.viewpoint.local/binding/",
    "uix-resource://my_feature.viewpoint.local/opaque%2Fbinding/",
  ])("validates a host-neutral physical directory: %s", (value) => {
    const root = parseFeatureWebRootUrl(value);
    expectTypeOf(root).toEqualTypeOf<FeatureWebRootUrl>();
    expect(root).toBe(value);
    expect(new URL(".", root).href).toBe(root);
    expect(new URL("view", root).href).toBe(`${value}view`);
  });

  it("returns the browser's normalized directory representation", () => {
    expect(
      parseFeatureWebRootUrl(
        "HTTPS://HOST.EXAMPLE:443/viewpoints/old/../current/canvas/",
      ),
    ).toBe("https://host.example/viewpoints/current/canvas/");
  });

  it.each([
    "https://host.example/canvas",
    "https://host.example/canvas/?key=main",
    "https://host.example/canvas/#details",
    "https://host.example/canvas/?",
    "https://host.example/canvas/#",
    "/canvas/",
    "canvas/",
    "",
    "not a URL",
    "data:text/html,hello",
    "about:blank",
    null,
    undefined,
    42,
    {},
    new URL("https://host.example/canvas/"),
  ])(
    "rejects input that is not an absolute directory URL string: %j",
    (value) => {
      expect(() => parseFeatureWebRootUrl(value)).toThrow();
    },
  );

  it("distinguishes roots from arbitrary strings and other URL brands", () => {
    const assertRejectedTypes = (raw: string, resource: ResourceUrl): void => {
      // @ts-expect-error raw input has not passed root validation
      const rawRoot: FeatureWebRootUrl = raw;
      // @ts-expect-error a resource URL is not a validated directory root
      const resourceRoot: FeatureWebRootUrl = resource;
      void rawRoot;
      void resourceRoot;
    };
    expect(assertRejectedTypes).toBeTypeOf("function");
  });
});
