import { describe, expect, it, vi } from "vitest";

import { parseCanvasKey } from "#features/canvas/shared/addressing";
import { createCanvasClient } from "#features/canvas/workspace/client";
import { AgentEvents, AgentRequests, createAgentClient } from "./agent";
import {
  createFeatureChannelClient,
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

    expect(request).toHaveBeenCalledWith(AgentRequests.prompt, { text: "hi" });
    expect(request).toHaveBeenCalledWith(AgentRequests.history, undefined);
    expect(subscribe).toHaveBeenCalledWith(AgentEvents.event, onEvent);
  });
});
