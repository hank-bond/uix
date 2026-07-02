import { describe, expect, it } from "vitest";

import { Type } from "typebox";

import {
  toChannelCanonicalId,
  normalizeChannelContribution,
} from "./channel-normalization";
import { toContributionId } from "./contribution-id";

describe("channelCanonicalId", () => {
  it("derives transport addresses without the facet segment", () => {
    expect(toChannelCanonicalId("canvas", "writeback") as string).toBe(
      "canvas.writeback",
    );
  });

  it("rejects tokens that cannot participate in derived ids", () => {
    expect(() => toChannelCanonicalId("Canvas", "writeback")).toThrow(
      "Invalid feature id: Canvas",
    );
    expect(() => toChannelCanonicalId("canvas", "bad-name")).toThrow(
      "Invalid channel name: bad-name",
    );
  });
});

describe("contributionId", () => {
  it("derives the uniform dotted registry id for any facet", () => {
    expect(toContributionId("canvas", "channel", "writeback") as string).toBe(
      "canvas.channel.writeback",
    );
  });
});

describe("normalizeChannelContribution", () => {
  it("derives contribution and canonical ids from feature id and names", () => {
    const channels = normalizeChannelContribution("canvas", {
      feature: "canvas",
      requests: {
        writeback: {
          requestSchema: Type.Object({ html: Type.String() }),
          responseSchema: Type.Void(),
          handle: () => undefined,
        },
      },
      events: {
        changed: {
          event: Type.Object({ key: Type.String() }),
        },
      },
    });

    expect(channels.requests.writeback).toMatchObject({
      name: "writeback",
      contributionId: "canvas.channel.writeback",
      canonicalId: "canvas.writeback",
    });
    expect(channels.events.changed).toMatchObject({
      name: "changed",
      contributionId: "canvas.channel.changed",
      canonicalId: "canvas.changed",
    });
  });

  it("rejects duplicate request/event names", () => {
    expect(() =>
      normalizeChannelContribution("canvas", {
        feature: "canvas",
        requests: {
          changed: {
            requestSchema: Type.Object({}),
            responseSchema: Type.Void(),
            handle: () => undefined,
          },
        },
        events: {
          changed: { event: Type.Object({}) },
        },
      }),
    ).toThrow("Duplicate channel name for feature canvas: changed");
  });
});
