import { describe, expect, it, vi } from "vitest";

import type { ContentRequest } from "@uix/runtime/content-transport";
import { toWorkspaceId } from "@uix/runtime/workspace";

import { WorkspaceContentTransport } from "./workspace-content-transport";

const requests: ContentRequest[] = [
  { kind: "resource", request: new Request("uix-resource://reference/test") },
  {
    kind: "viewpoint",
    request: {
      binding: "token",
      namespace: "canvas",
      pathname: "/view",
      queryString: "key=main",
      method: "GET",
    },
  },
];

describe("workspace content transport", () => {
  it.each(requests)(
    "routes $kind requests and removes only the registered generation",
    async (request) => {
      const workspaceId = toWorkspaceId("reference");
      const transport = new WorkspaceContentTransport();
      const handler = vi.fn(() => new Response("first"));
      const first = transport.register(workspaceId, handler);
      expect(
        await (await transport.dispatch(workspaceId, request)).text(),
      ).toBe("first");
      expect(handler).toHaveBeenCalledWith(request);
      expect(() => transport.register(workspaceId, handler)).toThrow(
        "already registered",
      );

      first[Symbol.dispose]();
      using second = transport.register(
        workspaceId,
        () => new Response("second"),
      );
      first[Symbol.dispose]();
      expect(
        await (await transport.dispatch(workspaceId, request)).text(),
      ).toBe("second");

      second[Symbol.dispose]();
      expect(await transport.dispatch(workspaceId, request)).toMatchObject({
        status: 503,
      });
    },
  );
});
