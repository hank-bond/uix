import { describe, expect, it, vi } from "vitest";

import { canvasChannels } from "#features/canvas/shared/channels";
import { parseCanvasKey } from "#features/canvas/shared/addressing";
import { agentChannels } from "#shared/ipc";
import { createChannelClient, type WorkspaceClient } from "@uix/api/workspace";

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
    canvas.subscriptions.changed(onChanged);

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
    agent.subscriptions.event(onEvent);

    expect(request).toHaveBeenCalledWith("agent.prompt", { text: "hi" });
    expect(request).toHaveBeenCalledWith("agent.history", undefined);
    expect(subscribe).toHaveBeenCalledWith("agent.event", expect.any(Function));
  });
});
