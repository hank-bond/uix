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
} from "@uix/api/channel-resolution";
import { toContributionId } from "@uix/api/contribution-id";

function fakeTransport(): {
  handlers: Map<string, (req: unknown) => Promise<unknown>>;
  disposed: string[];
  handleLogs: Map<
    string,
    ChannelRequestLogOptions<unknown, unknown> | undefined
  >;
  published: Array<{ canonicalId: string; payload: unknown }>;
  publishLogs: Array<ChannelEventLogOptions<unknown> | undefined>;
  handle(
    canonicalId: ChannelCanonicalId,
    handler: (req: unknown) => Promise<unknown>,
    logOpts?: ChannelRequestLogOptions<unknown, unknown>,
  ): { [Symbol.dispose](): void };
  publish(
    canonicalId: ChannelCanonicalId,
    payload: unknown,
    logOpts?: ChannelEventLogOptions<unknown>,
  ): void;
} {
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
      handler: (req: unknown) => Promise<unknown>,
      logOpts?: ChannelRequestLogOptions<unknown, unknown>,
    ) {
      handlers.set(canonicalId, handler);
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
      transportRegistrar: (canonicalId, handler) =>
        transport.handle(canonicalId, handler),
    });

    const channelDisposable = registry.register({
      contributionId: toContributionId("canvas", "channel", "writeback"),
      canonicalId: toChannelCanonicalId("canvas", "writeback"),
      requestSchema: Type.Object({ key: Type.Unknown() }),
      responseSchema: Type.Object({ ok: Type.Unknown() }),
      handler: (req: unknown) => ({ ok: req }),
    });

    await expect(
      transport.handlers.get("canvas.writeback")?.({ key: "main" }),
    ).resolves.toEqual({ ok: { key: "main" } });

    channelDisposable[Symbol.dispose]();

    expect(transport.handlers.has("canvas.writeback")).toBe(false);
    expect(transport.disposed).toEqual(["canvas.writeback"]);
  });

  it("rejects duplicate canonical ids until disposed", () => {
    const transport = fakeTransport();
    const registry = new ChannelRegistry({
      transportRegistrar: (canonicalId, handler) =>
        transport.handle(canonicalId, handler),
    });

    const channelDisposable = registry.register({
      contributionId: toContributionId("canvas", "channel", "refresh"),
      canonicalId: toChannelCanonicalId("canvas", "refresh"),
      requestSchema: Type.Object({}),
      responseSchema: Type.Void(),
      handler: () => undefined,
    });

    expect(() =>
      registry.register({
        contributionId: toContributionId("other", "channel", "refresh"),
        canonicalId: toChannelCanonicalId("canvas", "refresh"),
        requestSchema: Type.Object({}),
        responseSchema: Type.Void(),
        handler: () => undefined,
      }),
    ).toThrow("Channel already registered: canvas.refresh");

    channelDisposable[Symbol.dispose]();

    expect(() =>
      registry.register({
        contributionId: toContributionId("canvas", "channel", "refresh"),
        canonicalId: toChannelCanonicalId("canvas", "refresh"),
        requestSchema: Type.Object({}),
        responseSchema: Type.Void(),
        handler: () => undefined,
      }),
    ).not.toThrow();
  });

  it("releases a reserved id when transport acquisition throws", () => {
    const canonicalId = toChannelCanonicalId("canvas", "refresh");
    let shouldThrow = true;
    const registry = new ChannelRegistry({
      transportRegistrar: () => {
        if (shouldThrow) throw new Error("transport failed");
        return { [Symbol.dispose]() {} };
      },
    });
    const resolvedContribution = {
      contributionId: toContributionId("canvas", "channel", "refresh"),
      canonicalId,
      requestSchema: Type.Object({}),
      responseSchema: Type.Void(),
      handler: () => undefined,
    };

    expect(() => registry.register(resolvedContribution)).toThrow(
      "transport failed",
    );
    shouldThrow = false;
    expect(() => registry.register(resolvedContribution)).not.toThrow();
  });

  it("releases its id even when transport disposal throws", () => {
    const canonicalId = toChannelCanonicalId("canvas", "refresh");
    let disposalThrows = true;
    const registry = new ChannelRegistry({
      transportRegistrar: () => ({
        [Symbol.dispose]() {
          if (disposalThrows) throw new Error("transport disposal failed");
        },
      }),
    });
    const resolvedContribution = {
      contributionId: toContributionId("canvas", "channel", "refresh"),
      canonicalId,
      requestSchema: Type.Object({}),
      responseSchema: Type.Void(),
      handler: () => undefined,
    };

    const channelDisposable = registry.register(resolvedContribution);
    expect(() => {
      channelDisposable[Symbol.dispose]();
    }).toThrow(
      "transport disposal failed",
    );
    disposalThrows = false;
    expect(() => registry.register(resolvedContribution)).not.toThrow();
  });

  it("validates requests and responses when schemas are provided", async () => {
    const transport = fakeTransport();
    const registry = new ChannelRegistry({
      transportRegistrar: (canonicalId, handler) =>
        transport.handle(canonicalId, handler),
    });

    registry.register({
      contributionId: toContributionId("canvas", "channel", "writeback"),
      canonicalId: toChannelCanonicalId("canvas", "writeback"),
      requestSchema: Type.Object({ key: Type.String() }),
      responseSchema: Type.Object({ ok: Type.Boolean() }),
      handler: (req: { key: string }) => ({ ok: req.key === "main" }),
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
      transportRegistrar: (canonicalId, handler) =>
        transport.handle(canonicalId, handler),
      publish: (canonicalId, payload) => {
        transport.publish(canonicalId, payload);
      },
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
      transportRegistrar: (canonicalId, handler, logOpts) =>
        transport.handle(canonicalId, handler, logOpts),
      publish: (canonicalId, payload, logOpts) => {
        transport.publish(canonicalId, payload, logOpts);
      },
    });
    const describeRequest = (): { redacted: string } => ({
      redacted: "auth request",
    });
    const describeResponse = (): { redacted: string } => ({
      redacted: "auth response",
    });
    const describeEvent = (): { redacted: string } => ({
      redacted: "auth event",
    });
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
        auth_response: { handler: () => undefined },
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
      transportRegistrar: (canonicalId, handler) =>
        transport.handle(canonicalId, handler),
    });

    const channelsDisposable = registerChannelContributions(
      registry,
      "canvas",
      [
        {
          feature: "canvas",
          requests: {
            refresh: {
              requestSchema: Type.Object({}),
              responseSchema: Type.Void(),
              handler: () => undefined,
            },
            writeback: {
              requestSchema: Type.Object({}),
              responseSchema: Type.Void(),
              handler: () => undefined,
            },
          },
          events: {},
        },
      ],
    );

    expect([...transport.handlers.keys()].sort()).toEqual([
      "canvas.refresh",
      "canvas.writeback",
    ]);

    channelsDisposable[Symbol.dispose]();

    expect(transport.handlers.size).toBe(0);
    expect(transport.disposed).toEqual(["canvas.writeback", "canvas.refresh"]);
  });

  it("rolls back earlier channels when the bulk register operation fails", () => {
    const transport = fakeTransport();
    const registry = new ChannelRegistry({
      transportRegistrar: (canonicalId, handler) =>
        transport.handle(canonicalId, handler),
    });
    const owned = {
      feature: "canvas",
      requests: {
        refresh: {
          requestSchema: Type.Object({}),
          responseSchema: Type.Void(),
          handler: () => undefined,
        },
      },
      events: {},
    } as const;

    expect(() =>
      registerChannelContributions(registry, "canvas", [
        owned,
        { ...owned, feature: "other" },
      ]),
    ).toThrow("Feature canvas cannot register channels owned by other");
    expect(transport.handlers.size).toBe(0);
    expect(() =>
      registerChannelContributions(registry, "canvas", [owned]),
    ).not.toThrow();
  });

  it("creates typed event publishers from a contract", () => {
    const transport = fakeTransport();

    const channels = createFeatureEventPublisherFactory("canvas", {
      publish: (canonicalId, payload) => {
        transport.publish(canonicalId, payload);
      },
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
      transportRegistrar: (canonicalId, handler, logOpts) =>
        transport.handle(canonicalId, handler, logOpts),
    });

    const status: AgentStatus = {
      cwd: "/workspace",
      defaultModel: { provider: "anthropic", id: "claude-sonnet-4-5" },
    };
    registerChannelContributions(registry, "agent", [
      withHandlers(agentChannels, {
        prompt: { handler: () => undefined },
        session_history: {
          handler: () => ({
            session: {
              sessionId: "session-1",
              title: "Existing conversation",
              createdAt: "2026-07-19T10:00:00.000Z",
              modifiedAt: "2026-07-19T10:30:00.000Z",
            },
            transcript: { items: [] },
          }),
        },
        list_session_summaries: {
          handler: () => [
            {
              sessionId: "session-1",
              title: "Existing conversation",
              createdAt: "2026-07-19T10:00:00.000Z",
              modifiedAt: "2026-07-19T10:30:00.000Z",
            },
          ],
        },
        new_session: {
          handler: () => ({
            sessionId: "session-2",
            createdAt: "2026-07-19T11:00:00.000Z",
            modifiedAt: "2026-07-19T11:00:00.000Z",
          }),
        },
        switch_session: {
          handler: ({ sessionId }) => ({
            sessionId,
            title: "Existing conversation",
            createdAt: "2026-07-19T10:00:00.000Z",
            modifiedAt: "2026-07-19T10:30:00.000Z",
          }),
        },
        set_session_title: {
          handler: ({ sessionId, title }) => ({
            sessionId,
            ...(title !== null && { title }),
            createdAt: "2026-07-19T10:00:00.000Z",
            modifiedAt: "2026-07-19T10:30:00.000Z",
          }),
        },
        list_models: {
          handler: () => ({
            models: [
              {
                provider: "anthropic",
                id: "claude-sonnet-4-5",
                name: "Claude Sonnet 4.5",
                favorite: false,
              },
            ],
          }),
        },
        set_model_favorite: {
          handler: () => ({ models: [] }),
        },
        // Both model fields absent — the explicit "no model chosen" status.
        agent_status: { handler: () => ({ cwd: "/workspace" }) },
        select_model: { handler: () => status },
        list_auth_providers: { handler: () => ({ providers: [] }) },
        current_provider_auth_flow: { handler: () => null },
        begin_provider_auth_flow: {
          handler: () => ({
            flowId: "flow-1",
            providerId: "anthropic",
            authType: "api_key" as const,
            phase: { type: "starting" as const },
            notices: [],
          }),
        },
        answer_provider_auth_flow: { handler: () => undefined },
        open_provider_auth_link: { handler: () => undefined },
        cancel_provider_auth_flow: { handler: () => undefined },
      }),
    ]);

    await expect(
      transport.handlers.get("agent.session_history")?.({}),
    ).resolves.toEqual({
      session: {
        sessionId: "session-1",
        title: "Existing conversation",
        createdAt: "2026-07-19T10:00:00.000Z",
        modifiedAt: "2026-07-19T10:30:00.000Z",
      },
      transcript: { items: [] },
    });
    await expect(
      transport.handlers.get("agent.session_history")?.({
        sessionId: "../outside",
      }),
    ).rejects.toThrow();
    await expect(
      transport.handlers.get("agent.list_session_summaries")?.({ limit: 10 }),
    ).resolves.toEqual([
      {
        sessionId: "session-1",
        title: "Existing conversation",
        createdAt: "2026-07-19T10:00:00.000Z",
        modifiedAt: "2026-07-19T10:30:00.000Z",
      },
    ]);
    await expect(
      transport.handlers.get("agent.list_session_summaries")?.({ limit: 0 }),
    ).rejects.toThrow();
    await expect(
      transport.handlers.get("agent.new_session")?.(undefined),
    ).resolves.toEqual({
      sessionId: "session-2",
      createdAt: "2026-07-19T11:00:00.000Z",
      modifiedAt: "2026-07-19T11:00:00.000Z",
    });
    await expect(
      transport.handlers.get("agent.switch_session")?.({
        sessionId: "session-1",
      }),
    ).resolves.toEqual({
      sessionId: "session-1",
      title: "Existing conversation",
      createdAt: "2026-07-19T10:00:00.000Z",
      modifiedAt: "2026-07-19T10:30:00.000Z",
    });
    await expect(
      transport.handlers.get("agent.switch_session")?.({
        sessionId: "../outside",
      }),
    ).rejects.toThrow();
    await expect(
      transport.handlers.get("agent.set_session_title")?.({
        sessionId: "session-1",
        title: "Research",
      }),
    ).resolves.toMatchObject({
      sessionId: "session-1",
      title: "Research",
    });
    await expect(
      transport.handlers.get("agent.set_session_title")?.({
        sessionId: "session-1",
        title: undefined,
      }),
    ).rejects.toThrow();
    await expect(
      transport.handlers.get("agent.select_model")?.({
        provider: "anthropic",
        id: "claude-sonnet-4-5",
      }),
    ).resolves.toEqual(status);
    // Both model fields may be absent while current cwd remains required.
    await expect(
      transport.handlers.get("agent.agent_status")?.(undefined),
    ).resolves.toEqual({ cwd: "/workspace" });
    await expect(
      transport.handlers.get("agent.set_model_favorite")?.({
        provider: "anthropic",
        id: "claude-sonnet-4-5",
        favorite: true,
      }),
    ).resolves.toEqual({ models: [] });

    const answerLog = transport.handleLogs.get(
      "agent.answer_provider_auth_flow",
    );
    const answerDescription = answerLog?.describeRequest?.({
      flowId: "flow-1",
      promptId: "prompt-1",
      value: "test-secret-api-key",
    });
    expect(answerDescription).toEqual({
      redacted: "provider authentication payload",
    });
    expect(JSON.stringify(answerDescription)).not.toContain(
      "test-secret-api-key",
    );

    await expect(
      transport.handlers.get("agent.set_model_favorite")?.({
        provider: "anthropic",
        id: "claude-sonnet-4-5",
        favorite: "yes",
      }),
    ).rejects.toThrow();

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
      transportRegistrar: (canonicalId, handler) =>
        transport.handle(canonicalId, handler),
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
      publish: (canonicalId, payload) => {
        transport.publish(canonicalId, payload);
      },
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
