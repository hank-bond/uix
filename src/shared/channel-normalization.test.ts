import { describe, expect, it } from "vitest";

import { Type } from "typebox";

import { normalizeChannelContribution } from "./channel-normalization";

describe("normalizeChannelContribution", () => {
  it("derives contribution and canonical ids from feature id and names", () => {
    const channels = normalizeChannelContribution("canvas", {
      requests: {
        writeback: {
          request: Type.Object({ html: Type.String() }),
          response: Type.Void(),
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
      canonicalId: "canvas.channel.writeback",
    });
    expect(channels.events.changed).toMatchObject({
      name: "changed",
      contributionId: "canvas.channel.changed",
      canonicalId: "canvas.channel.changed",
    });
  });

  it("rejects duplicate request/event names", () => {
    expect(() =>
      normalizeChannelContribution("canvas", {
        requests: {
          changed: { request: Type.Object({}), response: Type.Void() },
        },
        events: {
          changed: { event: Type.Object({}) },
        },
      }),
    ).toThrow("Duplicate channel name for feature canvas: changed");
  });
});
