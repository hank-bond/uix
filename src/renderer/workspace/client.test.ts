import { describe, expect, it, vi } from "vitest";

import { canvasChannels } from "#features/canvas/shared/channels";
import { parseCanvasKey } from "#features/canvas/shared/addressing";
import { agentChannels } from "@uix/api/agent-channels";
import {
  createChannelClient,
  createFeatureSettingsClient,
  type WorkspaceClient,
} from "@uix/api/workspace";

function fakeWorkspaceClient() {
  const request = vi.fn((_name: string, _req: unknown) =>
    Promise.resolve(undefined),
  );
  const subscribe = vi.fn(
    (_name: string, _handler: (event: unknown) => void) => () => undefined,
  );
  const client: WorkspaceClient = {
    workspaceId: "local",
    request<Req, Res>(name: string, req: Req): Promise<Res> {
      return request(name, req) as Promise<Res>;
    },
    subscribe<Event>(
      name: string,
      handler: (event: Event) => void,
    ): () => void {
      return subscribe(name, handler as (event: unknown) => void);
    },
  };
  return { client, request, subscribe };
}

describe("channel clients", () => {
  it("creates typed feature client from a channel contract", async () => {
    const { client, request, subscribe } = fakeWorkspaceClient();
    const canvas = createChannelClient(client, canvasChannels);
    const onChanged = vi.fn();

    await canvas.requests.writeback({
      key: parseCanvasKey("main"),
      html: "<main />",
    });
    canvas.events.changed(onChanged);

    expect(request).toHaveBeenCalledWith("canvas.writeback", {
      key: "main",
      html: "<main />",
    });
    expect(subscribe).toHaveBeenCalledWith(
      "canvas.changed",
      expect.any(Function),
    );

    // The client validates incoming events against the contract schema.
    const wrapped = subscribe.mock.calls[0]?.[1];
    wrapped?.({ key: "main" });
    expect(onChanged).toHaveBeenCalledWith({ key: "main" });
    expect(() => wrapped?.({ key: 42 })).toThrow();
  });

  it("creates typed agent client from the agent channel contract", async () => {
    const { client, request, subscribe } = fakeWorkspaceClient();
    const agent = createChannelClient(client, agentChannels);
    const onEvent = vi.fn();

    await agent.requests.prompt({ text: "hi" });
    await agent.requests.history(undefined);
    agent.events.event(onEvent);

    expect(request).toHaveBeenCalledWith("agent.prompt", { text: "hi" });
    expect(request).toHaveBeenCalledWith("agent.history", undefined);
    expect(subscribe).toHaveBeenCalledWith("agent.event", expect.any(Function));
  });

  it("covers the agent model channels and validates status events", async () => {
    const { client, request, subscribe } = fakeWorkspaceClient();
    const agent = createChannelClient(client, agentChannels);
    const onStatus = vi.fn();

    await agent.requests.list_models(undefined);
    await agent.requests.agent_status(undefined);
    await agent.requests.select_model({
      provider: "anthropic",
      id: "claude-sonnet-4-5",
    });
    agent.events.status_changed(onStatus);

    expect(request).toHaveBeenCalledWith("agent.list_models", undefined);
    expect(request).toHaveBeenCalledWith("agent.agent_status", undefined);
    expect(request).toHaveBeenCalledWith("agent.select_model", {
      provider: "anthropic",
      id: "claude-sonnet-4-5",
    });
    expect(subscribe).toHaveBeenCalledWith(
      "agent.status_changed",
      expect.any(Function),
    );

    const wrapped = subscribe.mock.calls[0]?.[1];
    // Full status and the both-absent "no model chosen" status both pass.
    wrapped?.({ model: { provider: "anthropic", id: "claude-sonnet-4-5" } });
    wrapped?.({});
    expect(onStatus).toHaveBeenCalledTimes(2);
    // Malformed status events reject at the contract schema.
    expect(() => wrapped?.({ model: { provider: 42 } })).toThrow();
  });

  it("covers provider login requests and validates flow events", async () => {
    const { client, request, subscribe } = fakeWorkspaceClient();
    const agent = createChannelClient(client, agentChannels);
    const onFlow = vi.fn();

    await agent.requests.list_auth_providers(undefined);
    await agent.requests.save_provider_credentials({
      providerId: "openrouter",
      methodId: "api-key",
      values: { apiKey: "secret-key" },
    });
    await agent.requests.begin_oauth_flow({ providerId: "anthropic" });
    await agent.requests.answer_oauth_flow({
      flowId: "flow-1",
      promptId: "prompt-1",
      value: "secret-code",
    });
    agent.events.oauth_flow_changed(onFlow);

    expect(request).toHaveBeenCalledWith(
      "agent.list_auth_providers",
      undefined,
    );
    expect(request).toHaveBeenCalledWith("agent.save_provider_credentials", {
      providerId: "openrouter",
      methodId: "api-key",
      values: { apiKey: "secret-key" },
    });
    expect(request).toHaveBeenCalledWith("agent.begin_oauth_flow", {
      providerId: "anthropic",
    });
    expect(subscribe).toHaveBeenCalledWith(
      "agent.oauth_flow_changed",
      expect.any(Function),
    );

    const wrapped = subscribe.mock.calls[0]?.[1];
    wrapped?.({
      type: "prompt",
      flowId: "flow-1",
      promptId: "prompt-1",
      message: "Paste code",
      allowEmpty: false,
    });
    expect(onFlow).toHaveBeenCalledOnce();
    expect(() => wrapped?.({ type: "prompt", flowId: "flow-1" })).toThrow();
  });

  it("creates a feature-bound settings client", async () => {
    const { client, request, subscribe } = fakeWorkspaceClient();
    const settings = createFeatureSettingsClient(client, "chat");
    const onStatusBar = vi.fn();

    await settings.get("statusBar");
    await settings.set("statusBar", { order: ["model"], hidden: [] });
    settings.onChange("statusBar", onStatusBar);

    expect(request).toHaveBeenCalledWith("uix.get_setting", {
      featureId: "chat",
      key: "statusBar",
    });
    expect(request).toHaveBeenCalledWith("uix.set_setting", {
      featureId: "chat",
      key: "statusBar",
      value: { order: ["model"], hidden: [] },
    });
    expect(subscribe).toHaveBeenCalledWith(
      "uix.setting_changed",
      expect.any(Function),
    );

    const wrapped = subscribe.mock.calls[0]?.[1];
    wrapped?.({ featureId: "canvas", key: "statusBar", value: "ignored" });
    wrapped?.({
      featureId: "chat",
      key: "statusBar",
      value: { order: ["context"], hidden: [] },
    });
    expect(onStatusBar).toHaveBeenCalledTimes(1);
    expect(onStatusBar).toHaveBeenCalledWith({
      order: ["context"],
      hidden: [],
    });
  });
});
