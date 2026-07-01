import { describe, expect, it } from "vitest";

import {
  parseCanvasKeyFromDocumentResourceId,
  parseCanvasDocumentResourceId,
  parseCanvasKey,
  toCanvasDocumentResourceId,
} from "./addressing";

describe("canvas addressing", () => {
  it("round-trips a canvas key through a document resource id", () => {
    const key = parseCanvasKey("reports/security-review");
    const resourceId = toCanvasDocumentResourceId(key);

    expect(resourceId).toBe("doc://canvas/reports/security-review");
    expect(parseCanvasKeyFromDocumentResourceId(resourceId)).toBe(key);
  });

  it("rejects invalid document resource ids", () => {
    expect(() => parseCanvasDocumentResourceId("doc://other/main")).toThrow();
    expect(() => parseCanvasDocumentResourceId("doc://canvas/Bad")).toThrow();
  });
});
