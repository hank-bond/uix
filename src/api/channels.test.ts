import { describe, expect, it } from "vitest";

import { featureChannelId } from "./channels";

describe("featureChannelId", () => {
  it("derives channel ids from feature ids and names", () => {
    expect(featureChannelId("canvas", "writeback")).toBe(
      "canvas.channel.writeback",
    );
  });

  it("rejects tokens that cannot participate in derived ids", () => {
    expect(() => featureChannelId("Canvas", "writeback")).toThrow(
      "Invalid feature id: Canvas",
    );
    expect(() => featureChannelId("canvas", "bad-name")).toThrow(
      "Invalid channel name: bad-name",
    );
  });
});
