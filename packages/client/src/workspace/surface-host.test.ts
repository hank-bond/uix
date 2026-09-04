import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";

import type { ChannelContract } from "@uix/api/channels";
import type { WorkspaceClient } from "@uix/api/workspace";

import { createSurfaceChannelClients } from "./surface-host";

const contract = {
  requests: {
    ping: {
      requestSchema: Type.Void(),
      responseSchema: Type.Void(),
    },
  },
  events: {},
} as const satisfies ChannelContract;

function fakeWorkspaceClient(namespaces: readonly string[]): {
  workspace: WorkspaceClient;
  request: ReturnType<typeof vi.fn>;
} {
  const request = vi.fn(() => Promise.resolve(undefined));
  return {
    workspace: {
      workspaceId: "local",
      channelNamespaces: namespaces,
      request,
      subscribe: () => () => undefined,
    },
    request,
  };
}

describe("surface channel clients", () => {
  it("uses each declarative key as its contract namespace", async () => {
    const { workspace, request } = fakeWorkspaceClient(["agent", "canvas"]);
    const clients = createSurfaceChannelClients(workspace, {
      agent: contract,
      canvas: contract,
    });

    await clients["agent"].requests["ping"](undefined);
    await clients["canvas"].requests["ping"](undefined);

    expect(request).toHaveBeenNthCalledWith(1, "agent.ping", undefined);
    expect(request).toHaveBeenNthCalledWith(2, "canvas.ping", undefined);
  });

  it("rejects a namespace absent from the backend catalog", () => {
    const { workspace } = fakeWorkspaceClient(["canvas"]);

    expect(() =>
      createSurfaceChannelClients(workspace, { agent: contract }),
    ).toThrow("Channel namespace is unavailable: agent");
  });
});
