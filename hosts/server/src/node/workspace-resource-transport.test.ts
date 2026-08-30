import { describe, expect, it } from "vitest";

import { toWorkspaceId } from "@uix/runtime/workspace";

import { WorkspaceResourceTransport } from "./workspace-resource-transport";

describe("workspace resource transport", () => {
  it("routes one live runtime handler and removes only its generation", async () => {
    const workspaceId = toWorkspaceId("reference");
    const transport = new WorkspaceResourceTransport();
    const first = transport.register(workspaceId, () => new Response("first"));

    expect(
      await (
        await transport.dispatch(
          workspaceId,
          new Request("uix-resource://reference/test"),
        )
      ).text(),
    ).toBe("first");

    first[Symbol.dispose]();
    const second = transport.register(
      workspaceId,
      () => new Response("second"),
    );
    first[Symbol.dispose]();
    expect(
      await (
        await transport.dispatch(
          workspaceId,
          new Request("uix-resource://reference/test"),
        )
      ).text(),
    ).toBe("second");

    second[Symbol.dispose]();
    expect(
      await transport.dispatch(
        workspaceId,
        new Request("uix-resource://reference/test"),
      ),
    ).toMatchObject({ status: 503 });
  });
});
