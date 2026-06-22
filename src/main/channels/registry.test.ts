import { describe, expect, it } from "vitest";

import {
  createChannelRegistry,
  registerChannelContributions,
} from "./registry";

function fakeTransport() {
  const handlers = new Map<string, (req: unknown) => Promise<unknown>>();
  const disposed: string[] = [];

  return {
    handlers,
    disposed,
    handle(channel: string, fn: (req: unknown) => Promise<unknown>) {
      handlers.set(channel, fn);
      return {
        [Symbol.dispose]() {
          disposed.push(channel);
          handlers.delete(channel);
        },
      };
    },
  };
}

describe("ChannelRegistry", () => {
  it("registers request handlers and disposes them", async () => {
    const transport = fakeTransport();
    const registry = createChannelRegistry((channel, fn) =>
      transport.handle(channel, fn),
    );

    const registration = registry.register({
      id: "canvas.channel.writeback",
      channel: "uix:canvas-writeback",
      handle: (req: unknown) => ({ ok: req }),
    });

    await expect(
      transport.handlers.get("uix:canvas-writeback")?.({ key: "main" }),
    ).resolves.toEqual({ ok: { key: "main" } });

    registration[Symbol.dispose]();

    expect(transport.handlers.has("uix:canvas-writeback")).toBe(false);
    expect(transport.disposed).toEqual(["uix:canvas-writeback"]);
  });

  it("rejects duplicate ids and channels until disposed", () => {
    const transport = fakeTransport();
    const registry = createChannelRegistry((channel, fn) =>
      transport.handle(channel, fn),
    );

    const registration = registry.register({
      id: "canvas.channel.refresh",
      channel: "uix:canvas-refresh",
      handle: () => undefined,
    });

    expect(() =>
      registry.register({
        id: "canvas.channel.refresh",
        channel: "uix:other",
        handle: () => undefined,
      }),
    ).toThrow(
      "Channel contribution already registered: canvas.channel.refresh",
    );
    expect(() =>
      registry.register({
        id: "other.channel.refresh",
        channel: "uix:canvas-refresh",
        handle: () => undefined,
      }),
    ).toThrow("Channel already registered: uix:canvas-refresh");

    registration[Symbol.dispose]();

    expect(() =>
      registry.register({
        id: "canvas.channel.refresh",
        channel: "uix:canvas-refresh",
        handle: () => undefined,
      }),
    ).not.toThrow();
  });

  it("registers contribution groups and disposes them together", () => {
    const transport = fakeTransport();
    const registry = createChannelRegistry((channel, fn) =>
      transport.handle(channel, fn),
    );

    const registration = registerChannelContributions(registry, [
      {
        id: "canvas.channel.refresh",
        channel: "uix:canvas-refresh",
        handle: () => undefined,
      },
      {
        id: "canvas.channel.writeback",
        channel: "uix:canvas-writeback",
        handle: () => undefined,
      },
    ]);

    expect([...transport.handlers.keys()].sort()).toEqual([
      "uix:canvas-refresh",
      "uix:canvas-writeback",
    ]);

    registration[Symbol.dispose]();

    expect(transport.handlers.size).toBe(0);
    expect(transport.disposed).toEqual([
      "uix:canvas-writeback",
      "uix:canvas-refresh",
    ]);
  });
});
