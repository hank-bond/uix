import { describe, expect, it } from "vitest";

import { Type } from "typebox";

import {
  ChannelRegistry,
  createFeatureEventPublisherFactory,
  registerChannelContributions,
} from "./registry";
import {
  toChannelCanonicalId,
  type ChannelCanonicalId,
} from "@uix/api/channel-normalization";
import { toContributionId } from "@uix/api/contribution-id";

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
      requestSchema: Type.Object({ key: Type.Unknown() }),
      responseSchema: Type.Object({ ok: Type.Unknown() }),
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
      requestSchema: Type.Object({}),
      responseSchema: Type.Void(),
      handle: () => undefined,
    });

    expect(() =>
      registry.register({
        contributionId: toContributionId("other", "channel", "refresh"),
        canonicalId: toChannelCanonicalId("canvas", "refresh"),
        requestSchema: Type.Object({}),
        responseSchema: Type.Void(),
        handle: () => undefined,
      }),
    ).toThrow("Channel already registered: canvas.refresh");

    registration[Symbol.dispose]();

    expect(() =>
      registry.register({
        contributionId: toContributionId("canvas", "channel", "refresh"),
        canonicalId: toChannelCanonicalId("canvas", "refresh"),
        requestSchema: Type.Object({}),
        responseSchema: Type.Void(),
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
      requestSchema: Type.Object({ key: Type.String() }),
      responseSchema: Type.Object({ ok: Type.Boolean() }),
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
        feature: "canvas",
        requests: {
          refresh: {
            requestSchema: Type.Object({}),
            responseSchema: Type.Void(),
            handle: () => undefined,
          },
          writeback: {
            requestSchema: Type.Object({}),
            responseSchema: Type.Void(),
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

  it("creates typed event publishers from a contract", () => {
    const transport = fakeTransport();

    const channels = createFeatureEventPublisherFactory("canvas", {
      publish: (canonicalId, payload) =>
        transport.publish(canonicalId, payload),
    });

    const typed = channels.createPublisher({
      feature: "canvas",
      requests: {},
      events: {
        changed: { event: Type.Object({ key: Type.String() }) },
        refreshed: { event: Type.Void() },
      },
    } as const);

    typed.changed({ key: "main" });
    typed.refreshed();

    expect(transport.published).toEqual([
      { canonicalId: "canvas.changed", payload: { key: "main" } },
      { canonicalId: "canvas.refreshed", payload: undefined },
    ]);
  });

  it("rejects registering channels under another contract's owner", () => {
    const transport = fakeTransport();
    const registry = new ChannelRegistry({
      transportHandle: (canonicalId, fn) => transport.handle(canonicalId, fn),
    });

    expect(() =>
      registerChannelContributions(registry, "impostor", [
        {
          feature: "canvas",
          requests: {},
          events: {},
        },
      ]),
    ).toThrow("Feature impostor cannot register channels owned by canvas");
  });

  it("rejects minting a publisher for another contract's owner", () => {
    const transport = fakeTransport();
    const channels = createFeatureEventPublisherFactory("impostor", {
      publish: (canonicalId, payload) =>
        transport.publish(canonicalId, payload),
    });

    expect(() =>
      channels.createPublisher({
        feature: "canvas",
        requests: {},
        events: {},
      } as const),
    ).toThrow(
      "Feature impostor cannot publish events on channels owned by canvas",
    );
  });
});
