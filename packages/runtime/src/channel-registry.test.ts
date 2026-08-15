import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";

import { agentChannels } from "@uix/api/agent-channels";
import { toChannelCanonicalId } from "@uix/api/channel-resolution";
import {
  type ChannelEventLogOptions,
  type ChannelRequestLogOptions,
  withHandlers,
} from "@uix/api/channels";

import {
  ChannelRegistry,
  createFeatureEventPublisherFactory,
  registerChannelContributions,
} from "./channel-registry";
import type {
  AttachmentDispatchContext,
  CanonicalRequest,
  CanonicalResponse,
  PreparedDispatch,
} from "./dispatch";
import { toAttachmentId, toSessionId, toWorkspaceId } from "./workspace";

function fakeAttachmentDispatchContext(): AttachmentDispatchContext {
  const target = { sessionId: toSessionId("session-1") };
  return {
    workspaceId: toWorkspaceId("workspace-1"),
    attachmentId: toAttachmentId("attachment-1"),
    target,
    agentInstanceGuard: {
      instance: { target } as never,
      retain: () => {
        throw new Error("unused");
      },
      release: () => undefined,
      [Symbol.dispose]() {},
    },
    retarget: () => Promise.reject(new Error("unused")),
  };
}

async function invoke(
  registry: ChannelRegistry,
  request: CanonicalRequest,
  release = vi.fn(),
): Promise<{
  prepared: PreparedDispatch;
  response: CanonicalResponse;
  release: ReturnType<typeof vi.fn>;
}> {
  const prepared = registry.prepare(
    fakeAttachmentDispatchContext(),
    request,
    release,
  );
  const response = await prepared.invoke();
  return { prepared, response, release };
}

describe("ChannelRegistry", () => {
  it("prepares, validates, and invokes one registered handler", async () => {
    const registry = new ChannelRegistry();
    const canonicalId = toChannelCanonicalId("feature", "ping");
    const handler = vi.fn((request: { value: string }) => ({
      value: request.value.toUpperCase(),
    }));
    const registration = registry.register({
      canonicalId,
      requestSchema: Type.Object({ value: Type.String() }),
      responseSchema: Type.Object({ value: Type.String() }),
      handler,
    });

    const { response, release } = await invoke(registry, {
      channel: canonicalId,
      payload: { value: "hello" },
    });

    expect(response).toEqual({ ok: true, value: { value: "HELLO" } });
    expect(handler).toHaveBeenCalledWith(
      { value: "hello" },
      expect.objectContaining({ attachmentId: "attachment-1" }),
    );
    expect(release).toHaveBeenCalledOnce();

    registration[Symbol.dispose]();
    const unknown = await invoke(registry, {
      channel: canonicalId,
      payload: { secret: "do-not-log" },
    });
    expect(unknown.response).toMatchObject({
      ok: false,
      error: { code: "unknown_channel" },
    });
    expect(
      unknown.prepared.logOptions.describeRequest?.({ secret: "do-not-log" }),
    ).toEqual({ channel: canonicalId });
  });

  it("releases a disposed preparation without invoking its handler", async () => {
    const registry = new ChannelRegistry();
    const canonicalId = toChannelCanonicalId("feature", "ping");
    const handler = vi.fn(() => "pong");
    registry.register({
      canonicalId,
      requestSchema: Type.Object({}),
      responseSchema: Type.String(),
      handler,
    });
    const release = vi.fn();
    const prepared = registry.prepare(
      fakeAttachmentDispatchContext(),
      { channel: canonicalId, payload: {} },
      release,
    );

    prepared[Symbol.dispose]();
    prepared[Symbol.dispose]();

    await expect(prepared.invoke()).resolves.toMatchObject({
      ok: false,
      error: { code: "disposed" },
    });
    expect(release).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects duplicate ids until the registration disposes", () => {
    const registry = new ChannelRegistry();
    const registration = {
      canonicalId: toChannelCanonicalId("feature", "ping"),
      requestSchema: Type.Unknown(),
      responseSchema: Type.Unknown(),
      handler: (request: unknown) => request,
    };
    const first = registry.register(registration);

    expect(() => registry.register(registration)).toThrow(
      "Channel already registered",
    );
    first[Symbol.dispose]();
    expect(() => registry.register(registration)).not.toThrow();
  });

  it("returns handler errors for invalid requests and responses", async () => {
    const registry = new ChannelRegistry();
    const canonicalId = toChannelCanonicalId("feature", "validated");
    registry.register({
      canonicalId,
      requestSchema: Type.Object({ key: Type.String() }),
      responseSchema: Type.Object({ ok: Type.Boolean() }),
      handler: () => ({ ok: "wrong" }) as never,
    });

    expect(
      (
        await invoke(registry, {
          channel: canonicalId,
          payload: { key: 1 },
        })
      ).response,
    ).toMatchObject({ ok: false, error: { code: "handler_error" } });
    expect(
      (
        await invoke(registry, {
          channel: canonicalId,
          payload: { key: "value" },
        })
      ).response,
    ).toMatchObject({ ok: false, error: { code: "handler_error" } });
  });

  it("uses one context-aware handler model for substrate and feature requests", async () => {
    const registry = new ChannelRegistry();
    const featureId = toChannelCanonicalId("feature", "ping");
    const substrateId = toChannelCanonicalId("agent", "status");
    registry.register({
      canonicalId: featureId,
      requestSchema: Type.Object({}),
      responseSchema: Type.String(),
      handler: () => "feature",
    });
    registry.register({
      canonicalId: substrateId,
      requestSchema: Type.Object({}),
      responseSchema: Type.String(),
      handler: (_request, context) => context.target.sessionId,
    });

    expect(
      (await invoke(registry, { channel: featureId, payload: {} })).response,
    ).toEqual({ ok: true, value: "feature" });
    expect(
      (await invoke(registry, { channel: substrateId, payload: {} })).response,
    ).toEqual({ ok: true, value: "session-1" });
  });

  it("keeps contract log policy on the prepared workspace entry", async () => {
    const registry = new ChannelRegistry();
    const canonicalId = toChannelCanonicalId("feature", "secret");
    const log: ChannelRequestLogOptions<{ secret: string }, { ok: boolean }> = {
      describeRequest: () => ({ redacted: true }),
      describeResponse: ({ ok }) => ({ ok }),
    };
    registry.register({
      canonicalId,
      requestSchema: Type.Object({ secret: Type.String() }),
      responseSchema: Type.Object({ ok: Type.Boolean() }),
      handler: () => ({ ok: true }),
      log,
    });

    const { prepared } = await invoke(registry, {
      channel: canonicalId,
      payload: { secret: "token" },
    });

    expect(prepared.logOptions.describeRequest?.({ secret: "token" })).toEqual({
      redacted: true,
    });
    expect(prepared.logOptions.describeResponse?.({ ok: true })).toEqual({
      ok: true,
    });
  });

  it("publishes canonical events with their contract log policy", () => {
    const published: Array<{
      channel: string;
      payload: unknown;
      log?: ChannelEventLogOptions<unknown>;
    }> = [];
    const registry = new ChannelRegistry({
      publish: (channel, payload, log) => {
        published.push({ channel, payload, log });
      },
    });
    const contract = {
      feature: "feature",
      requests: {},
      events: {
        changed: {
          event: Type.Object({ value: Type.String() }),
          log: { describeEvent: () => ({ summarized: true }) },
        },
      },
    } as const;
    const publisher = createFeatureEventPublisherFactory(
      "feature",
      registry,
    ).createPublisher(contract);

    publisher.changed({ value: "large" });

    expect(published[0]?.channel).toBe("feature.changed");
    expect(published[0]?.payload).toEqual({ value: "large" });
    expect(published[0]?.log?.describeEvent?.({ value: "large" })).toEqual({
      summarized: true,
    });
  });

  it("registers contribution groups and rolls back earlier entries", async () => {
    const registry = new ChannelRegistry();
    const contract = {
      feature: "feature",
      requests: {
        ping: {
          requestSchema: Type.Object({}),
          responseSchema: Type.String(),
        },
      },
      events: {},
    } as const;
    const contribution = withHandlers(contract, {
      ping: { handler: () => "pong" },
    });
    const lifetime = registerChannelContributions(registry, "feature", [
      contribution,
    ]);

    expect(
      (
        await invoke(registry, {
          channel: toChannelCanonicalId("feature", "ping"),
          payload: {},
        })
      ).response,
    ).toEqual({ ok: true, value: "pong" });

    expect(() =>
      registerChannelContributions(registry, "feature", [contribution]),
    ).toThrow("already registered");
    lifetime[Symbol.dispose]();
  });

  it("validates real agent model references through the shared contract", async () => {
    const registry = new ChannelRegistry();
    const contract = agentChannels.requests.select_model;
    const canonicalId = toChannelCanonicalId("agent", "select_model");
    registry.register({
      canonicalId,
      requestSchema: contract.requestSchema,
      responseSchema: contract.responseSchema,
      handler: (request) => ({ cwd: "/workspace", model: request }),
    });

    expect(
      (
        await invoke(registry, {
          channel: canonicalId,
          payload: { provider: "openai", id: "gpt-5" },
        })
      ).response,
    ).toEqual({
      ok: true,
      value: {
        cwd: "/workspace",
        model: { provider: "openai", id: "gpt-5" },
      },
    });
    expect(
      (
        await invoke(registry, {
          channel: canonicalId,
          payload: { provider: "openai" },
        })
      ).response,
    ).toMatchObject({ ok: false, error: { code: "handler_error" } });
  });

  it("rejects contribution and publisher owner mismatches", () => {
    const registry = new ChannelRegistry();
    const contribution = withHandlers(
      {
        feature: "feature-a",
        requests: {},
        events: {},
      },
      {},
    );

    expect(() =>
      registerChannelContributions(registry, "feature-b", [contribution]),
    ).toThrow("cannot register channels");
    expect(() =>
      createFeatureEventPublisherFactory("feature-b", registry).createPublisher(
        {
          feature: "feature-a",
          requests: {},
          events: {},
        },
      ),
    ).toThrow("cannot publish events");
  });
});
