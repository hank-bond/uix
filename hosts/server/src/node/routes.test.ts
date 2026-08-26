import { describe, expect, it } from "vitest";

import { toSessionId, toWorkspaceId } from "@uix/runtime";

import { toWorkspacePath, toWorkspaceSessionPath } from "./routes";

describe("server workspace routes", () => {
  it("encodes opaque workspace and session ids into explicit resource paths", () => {
    expect(toWorkspacePath(toWorkspaceId("team/reports"))).toBe(
      "/workspaces/team%2Freports",
    );
    expect(
      toWorkspaceSessionPath(
        toWorkspaceId("team/reports"),
        toSessionId("session?one"),
      ),
    ).toBe("/workspaces/team%2Freports/sessions/session%3Fone");
  });
});
