import { describe, expect, it } from "vitest";

import {
  parseLogicalResourceUrl,
  parseServerResourceRequestUrl,
  resolveServerResourceUrl,
} from "../resource-urls";

describe("server resource URLs", () => {
  it("maps workspace and feature logical references to hierarchical HTTP paths", () => {
    expect(
      resolveServerResourceUrl(
        "https://uix.example:9443",
        "reference",
        "uix-resource://reference/reports/document/weekly?v=abc",
      ),
    ).toBe(
      "https://uix.example:9443/workspaces/reference/resources/reference/reports/document/weekly?v=abc",
    );
    expect(
      resolveServerResourceUrl(
        "https://uix.example:9443",
        "reference",
        "uix-resource://canvas.reference/frame/main",
      ),
    ).toBe(
      "https://uix.example:9443/workspaces/reference/resources/canvas.reference/frame/main",
    );
  });

  it("preserves logical path hierarchy for relative surface references", () => {
    const moduleUrl = resolveServerResourceUrl(
      "https://uix.example:9443",
      "reference",
      "uix-resource://uix.reference/surface/reports/0.js?v=module",
    );
    const expectedStyleUrl = resolveServerResourceUrl(
      "https://uix.example:9443",
      "reference",
      "uix-resource://uix.reference/surface-files/reports/styles.css?v=style",
    );

    expect(
      new URL("../../surface-files/reports/styles.css?v=style", moduleUrl).href,
    ).toBe(expectedStyleUrl);
  });

  it("restores the logical URL from its HTTP content path", () => {
    expect(
      parseServerResourceRequestUrl(
        "/workspaces/reference/resources/uix.reference/surface-files/reports/styles.css?v=abc",
        "reference",
      ).href,
    ).toBe(
      "uix-resource://uix.reference/surface-files/reports/styles.css?v=abc",
    );
  });

  it("maps a logical origin to the deployment origin for browser checks", () => {
    expect(
      resolveServerResourceUrl(
        "https://uix.example:9443",
        "reference",
        "uix-resource://canvas.reference",
      ),
    ).toBe("https://uix.example:9443");
  });

  it("rejects another workspace, scheme, or credentialed authority", () => {
    expect(() =>
      parseLogicalResourceUrl(
        "uix-resource://canvas.other/frame/main",
        "reference",
      ),
    ).toThrow("does not belong");
    expect(() =>
      parseLogicalResourceUrl("https://reference/frame/main", "reference"),
    ).toThrow("logical UIX resource scheme");
    expect(() =>
      parseLogicalResourceUrl(
        "uix-resource://user@reference/frame/main",
        "reference",
      ),
    ).toThrow("unsupported address");
    expect(() =>
      parseLogicalResourceUrl(
        "uix-resource://reference/frame/main#fragment",
        "reference",
      ),
    ).toThrow("unsupported address");
  });
});
