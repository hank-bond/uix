import { describe, expect, it } from "vitest";

import { Type } from "typebox";

import {
  ChannelRegistry,
  createFeatureChannelPublisher,
  registerChannelContributions,
} from "./registry";
import {
  toChannelCanonicalId,
  type ChannelCanonicalId,
} from "#shared/channel-normalization";
import { toContributionId } from "#shared/contribution-id";

function fakeTransport() {
  const handlers = new Map<string, (req: unknown) => Promise<unknown>>();
  const disposed: string[] = [];
  const published: Array<{ canonicalId: string; payload: unknown }> = [];

  return {
    handlers,
    disposed,
    published,
    handle(
      canonicalId: ChannelCanonicalId,
      fn: (req: unknown) => Promise<unknown>,
    ) {
      handlers.set(canonicalId, fn);
      return {
        [Symbol.dispose]() {
          disposed.push(canonicalId);
          handlers.delete(canonicalId);
        },
      };
    },
    publish(canonicalId: ChannelCanonicalId, payload: unknown) {
      published.push({ canonicalId: canonicalId, payload });
    },
  };
}

describe("ChannelRegistry", () => {
  it("registers request handlers and disposes them", async () => {
    const transport = fakeTransport();
    const registry = new ChannelRegistry({
      transportHandle: (canonicalId, fn) => transport.handle(canonicalId, fn),
    });

    const registration = registry.register({
      contributionId: toContributionId("canvas", "channel", "writeback"),
      canonicalId: toChannelCanonicalId("canvas", "writeback"),
      request: Type.Object({ key: Type.Unknown() }),
      response: Type.Object({ ok: Type.Unknown() }),
      handle: (req: unknown) => ({ ok: req }),
    });

    await expect(
      transport.handlers.get("canvas.writeback")?.({ key: "main" }),
    ).resolves.toEqual({ ok: { key: "main" } });

    registration[Symbol.dispose]();

    expect(transport.handlers.has("canvas.writeback")).toBe(false);
    expect(transport.disposed).toEqual(["canvas.writeback"]);
  });

  it("rejects duplicate canonical ids until disposed", () => {
    const transport = fakeTransport();
    const registry = new ChannelRegistry({
      transportHandle: (canonicalId, fn) => transport.handle(canonicalId, fn),
    });

    const registration = registry.register({
      contributionId: toContributionId("canvas", "channel", "refresh"),
      canonicalId: toChannelCanonicalId("canvas", "refresh"),
      request: Type.Object({}),
      response: Type.Void(),
      handle: () => undefined,
    });

    expect(() =>
      registry.register({
        contributionId: toContributionId("other", "channel", "refresh"),
        canonicalId: toChannelCanonicalId("canvas", "refresh"),
        request: Type.Object({}),
        response: Type.Void(),
        handle: () => undefined,
      }),
    ).toThrow("Channel already registered: canvas.refresh");

    registration[Symbol.dispose]();

    expect(() =>
      registry.register({
        contributionId: toContributionId("canvas", "channel", "refresh"),
        canonicalId: toChannelCanonicalId("canvas", "refresh"),
        request: Type.Object({}),
        response: Type.Void(),
        handle: () => undefined,
      }),
    ).not.toThrow();
  });

  it("validates requests and responses when schemas are provided", async () => {
    const transport = fakeTransport();
    const registry = new ChannelRegistry({
      transportHandle: (canonicalId, fn) => transport.handle(canonicalId, fn),
    });

    registry.register({
      contributionId: toContributionId("canvas", "channel", "writeback"),
      canonicalId: toChannelCanonicalId("canvas", "writeback"),
      request: Type.Object({ key: Type.String() }),
      response: Type.Object({ ok: Type.Boolean() }),
      handle: (req: { key: string }) => ({ ok: req.key === "main" }),
    });

    await expect(
      transport.handlers.get("canvas.writeback")?.({ key: "main" }),
    ).resolves.toEqual({ ok: true });
    await expect(
      transport.handlers.get("canvas.writeback")?.({ key: 1 }),
    ).rejects.toThrow();
  });

  it("publishes through the configured transport", () => {
    const transport = fakeTransport();
    const registry = new ChannelRegistry({
      transportHandle: (canonicalId, fn) => transport.handle(canonicalId, fn),
      publish: (canonicalId, payload) =>
        transport.publish(canonicalId, payload),
    });

    registry.publish(toChannelCanonicalId("canvas", "changed"), {
      key: "main",
    });

    expect(transport.published).toEqual([
      { canonicalId: "canvas.changed", payload: { key: "main" } },
    ]);
  });

  it("registers contribution groups and disposes them together", () => {
    const transport = fakeTransport();
    const registry = new ChannelRegistry({
      transportHandle: (canonicalId, fn) => transport.handle(canonicalId, fn),
    });

    const registration = registerChannelContributions(registry, "canvas", [
      {
        requests: {
          refresh: {
            request: Type.Object({}),
            response: Type.Void(),
            handle: () => undefined,
          },
          writeback: {
            request: Type.Object({}),
            response: Type.Void(),
            handle: () => undefined,
          },
        },
        events: {},
      },
    ]);

    expect([...transport.handlers.keys()].sort()).toEqual([
      "canvas.refresh",
      "canvas.writeback",
    ]);

    registration[Symbol.dispose]();

    expect(transport.handlers.size).toBe(0);
    expect(transport.disposed).toEqual(["canvas.writeback", "canvas.refresh"]);
  });

  it("creates feature-scoped publishers", () => {
    const transport = fakeTransport();
    const registry = new ChannelRegistry({
      publish: (canonicalId, payload) =>
        transport.publish(canonicalId, payload),
    });
    const publisher = createFeatureChannelPublisher("canvas", registry);

    publisher.publish("changed", { key: "main" });

    expect(transport.published).toEqual([
      { canonicalId: "canvas.changed", payload: { key: "main" } },
    ]);
  });
});
