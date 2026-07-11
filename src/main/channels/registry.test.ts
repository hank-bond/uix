import { describe, expect, it } from "vitest";

import { Type } from "typebox";

import { agentChannels, type AgentStatus } from "@uix/api/agent-channels";
import {
  type ChannelEventLogOptions,
  type ChannelRequestLogOptions,
  withHandlers,
} from "@uix/api/channels";

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
  const handleLogs = new Map<
    string,
    ChannelRequestLogOptions<unknown, unknown> | undefined
  >();
  const published: Array<{ canonicalId: string; payload: unknown }> = [];
  const publishLogs: Array<ChannelEventLogOptions<unknown> | undefined> = [];

  return {
    handlers,
    disposed,
    handleLogs,
    published,
    publishLogs,
    handle(
      canonicalId: ChannelCanonicalId,
      fn: (req: unknown) => Promise<unknown>,
      logOpts?: ChannelRequestLogOptions<unknown, unknown>,
    ) {
      handlers.set(canonicalId, fn);
      handleLogs.set(canonicalId, logOpts);
      return {
        [Symbol.dispose]() {
          disposed.push(canonicalId);
          handlers.delete(canonicalId);
          handleLogs.delete(canonicalId);
        },
      };
    },
    publish(
      canonicalId: ChannelCanonicalId,
      payload: unknown,
      logOpts?: ChannelEventLogOptions<unknown>,
    ) {
      published.push({ canonicalId: canonicalId, payload });
      publishLogs.push(logOpts);
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

  it("propagates request, response, and event log descriptions", () => {
    const transport = fakeTransport();
    const registry = new ChannelRegistry({
      transportHandle: (canonicalId, fn, logOpts) =>
        transport.handle(canonicalId, fn, logOpts),
      publish: (canonicalId, payload, logOpts) =>
        transport.publish(canonicalId, payload, logOpts),
    });
    const describeRequest = () => ({ redacted: "auth request" });
    const describeResponse = () => ({ redacted: "auth response" });
    const describeEvent = () => ({ redacted: "auth event" });
    const contract = {
      feature: "agent",
      requests: {
        auth_response: {
          requestSchema: Type.Object({ code: Type.String() }),
          responseSchema: Type.Void(),
          log: { describeRequest, describeResponse },
        },
      },
      events: {
        auth_flow: {
          event: Type.Object({ authorizationUrl: Type.String() }),
          log: { describeEvent },
        },
      },
    } as const;

    registerChannelContributions(registry, "agent", [
      withHandlers(contract, {
        auth_response: { handle: () => undefined },
      }),
    ]);
    const publisher = createFeatureEventPublisherFactory(
      "agent",
      registry,
    ).createPublisher(contract);
    publisher.auth_flow({ authorizationUrl: "https://secret.example" });

    expect(transport.handleLogs.get("agent.auth_response")).toEqual({
      describeRequest,
      describeResponse,
    });
    expect(transport.publishLogs).toEqual([{ describeEvent }]);
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

  it("validates the agent model channels through the real contract", async () => {
    const transport = fakeTransport();
    const registry = new ChannelRegistry({
      transportHandle: (canonicalId, fn) => transport.handle(canonicalId, fn),
    });

    const status: AgentStatus = {
      defaultModel: { provider: "anthropic", id: "claude-sonnet-4-5" },
    };
    registerChannelContributions(registry, "agent", [
      withHandlers(agentChannels, {
        prompt: { handle: () => undefined },
        history: { handle: () => ({ items: [] }) },
        list_models: {
          handle: () => ({
            models: [
              {
                provider: "anthropic",
                id: "claude-sonnet-4-5",
                name: "Claude Sonnet 4.5",
              },
            ],
          }),
        },
        // Both fields absent — the explicit "no model chosen" status.
        agent_status: { handle: () => ({}) },
        select_model: { handle: () => status },
        list_auth_providers: { handle: () => ({ providers: [] }) },
        current_oauth_flow: { handle: () => null },
        begin_oauth_flow: { handle: () => ({ flowId: "flow-1" }) },
        answer_oauth_flow: { handle: () => undefined },
        reopen_oauth_flow: { handle: () => undefined },
        cancel_oauth_flow: { handle: () => undefined },
      }),
    ]);

    await expect(
      transport.handlers.get("agent.select_model")?.({
        provider: "anthropic",
        id: "claude-sonnet-4-5",
      }),
    ).resolves.toEqual(status);
    // The both-absent "no model chosen" status is a valid response shape.
    await expect(
      transport.handlers.get("agent.agent_status")?.(undefined),
    ).resolves.toEqual({});

    // Malformed select requests reject at the schema, before any handler.
    await expect(
      transport.handlers.get("agent.select_model")?.({ provider: "anthropic" }),
    ).rejects.toThrow();
    await expect(
      transport.handlers.get("agent.select_model")?.({
        provider: "anthropic",
        id: 42,
      }),
    ).rejects.toThrow();
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
