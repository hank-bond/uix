import { describe, expect, it, vi } from "vitest";

import type { UIXBridge } from "#shared/ipc";
import { toChannelCanonicalId } from "#shared/channel-normalization";
import { parseCanvasKey } from "#features/canvas/shared/addressing";
import { createCanvasClient } from "#features/canvas/workspace/client";
import { AgentEvents, AgentRequests, createAgentClient } from "./agent";
import {
  createFeatureChannelClient,
  type WorkspaceClient,
} from "@uix/api/workspace";
import { createPreloadWorkspaceClient } from "./preload";

const CanvasChannels = {
  writeback: toChannelCanonicalId("canvas", "writeback") as string,
  changed: toChannelCanonicalId("canvas", "changed") as string,
} as const;

function fakeBridge(): UIXBridge {
  return {
    sendPrompt: vi.fn(() => Promise.resolve()),
    onAgentEvent: vi.fn(() => () => undefined),
    onCanvasChanged: vi.fn(() => () => undefined),
    writebackCanvas: vi.fn(() => Promise.resolve()),
    reload: vi.fn(() =>
      Promise.resolve({
        extensionsLoaded: 0,
        extensionsFailed: 0,
        piReloaded: false,
      }),
    ),
    getHistory: vi.fn(() => Promise.resolve({ items: [] })),
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
  it("maps workspace requests to the preload bridge", async () => {
    const bridge = fakeBridge();
    const client = createPreloadWorkspaceClient(bridge);

    await client.request(AgentRequests.prompt, { text: "hi" });
    await client.request(AgentRequests.history, undefined);
    await client.request(CanvasChannels.writeback, {
      key: "main",
      html: "<p>hello</p>",
    });

    expect(bridge.sendPrompt).toHaveBeenCalledWith({ text: "hi" });
    expect(bridge.getHistory).toHaveBeenCalledTimes(1);
    expect(bridge.writebackCanvas).toHaveBeenCalledWith({
      key: "main",
      html: "<p>hello</p>",
    });
  });

  it("maps workspace events to the preload bridge", () => {
    const bridge = fakeBridge();
    const client = createPreloadWorkspaceClient(bridge);
    const onAgent = vi.fn();
    const onCanvas = vi.fn();

    client.subscribe(AgentEvents.event, onAgent);
    client.subscribe(CanvasChannels.changed, onCanvas);

    expect(bridge.onAgentEvent).toHaveBeenCalledWith(onAgent);
    expect(bridge.onCanvasChanged).toHaveBeenCalledTimes(1);

    const wrappedCanvasHandler = vi.mocked(bridge.onCanvasChanged).mock
      .calls[0]?.[0];
    wrappedCanvasHandler?.({ key: "main" });
    expect(onCanvas).toHaveBeenCalledWith({ key: "main" });
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
    expect(subscribe).toHaveBeenCalledWith("canvas.changed", onChanged);
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
