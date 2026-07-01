import { describe, expect, it, vi } from "vitest";

import type { UIXBridge } from "#shared/ipc";
import { parseCanvasKey } from "#features/canvas/shared/addressing";
import { createCanvasClient } from "#features/canvas/workspace/client";
import { AgentEvents, AgentRequests, createAgentClient } from "./agent";
import {
  createFeatureChannelClient,
  type WorkspaceClient,
} from "@uix/api/workspace";
import { createPreloadWorkspaceClient } from "./preload";

function fakeBridge(): UIXBridge {
  return {
    request: vi.fn(() => Promise.resolve(undefined)),
    subscribe: vi.fn(() => () => undefined),
    reload: vi.fn(() =>
      Promise.resolve({
        extensionsLoaded: 0,
        extensionsFailed: 0,
        piReloaded: false,
      }),
    ),
  };
}

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

describe("createPreloadWorkspaceClient", () => {
  it("forwards requests to the preload bridge", async () => {
    const bridge = fakeBridge();
    const client = createPreloadWorkspaceClient(bridge);

    await client.request("agent.prompt", { text: "hi" });
    await client.request("agent.history", undefined);
    await client.request("canvas.writeback", {
      key: "main",
      html: "<p>hello</p>",
    });

    expect(bridge.request).toHaveBeenCalledWith("agent.prompt", { text: "hi" });
    expect(bridge.request).toHaveBeenCalledWith("agent.history", undefined);
    expect(bridge.request).toHaveBeenCalledWith("canvas.writeback", {
      key: "main",
      html: "<p>hello</p>",
    });
  });

  it("forwards subscriptions to the preload bridge", () => {
    const bridge = fakeBridge();
    const client = createPreloadWorkspaceClient(bridge);
    const handler = vi.fn();

    client.subscribe("agent.event", handler);
    client.subscribe("canvas.changed", handler);

    expect(bridge.subscribe).toHaveBeenCalledWith("agent.event", handler);
    expect(bridge.subscribe).toHaveBeenCalledWith("canvas.changed", handler);
  });
});

describe("feature and facet clients", () => {
  it("scopes feature requests and events", async () => {
    const { client, request, subscribe } = fakeWorkspaceClient();
    const feature = createFeatureChannelClient(client, "canvas");
    const canvas = createCanvasClient(feature);
    const onChanged = vi.fn();

    await canvas.writeback({ key: parseCanvasKey("main"), html: "<main />" });
    canvas.onChanged(onChanged);

    expect(request).toHaveBeenCalledWith("canvas.writeback", {
      key: "main",
      html: "<main />",
    });
    expect(subscribe).toHaveBeenCalledWith(
      "canvas.changed",
      expect.any(Function),
    );
  });

  it("keeps agent requests outside feature namespaces", async () => {
    const { client, request, subscribe } = fakeWorkspaceClient();
    const agent = createAgentClient(client);
    const onEvent = vi.fn();

    await agent.sendPrompt({ text: "hi" });
    await agent.getHistory();
    agent.onEvent(onEvent);

    expect(request).toHaveBeenCalledWith("agent.prompt", { text: "hi" });
    expect(request).toHaveBeenCalledWith("agent.history", undefined);
    expect(subscribe).toHaveBeenCalledWith("agent.event", onEvent);
  });
});
