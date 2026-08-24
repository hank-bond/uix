import { describe, expect, it } from "vitest";

import { type SessionTarget, toBranchId, toSessionId } from "./workspace";

describe("SessionTarget", () => {
  it("names a session whose primary branch is not born yet", () => {
    const target: SessionTarget = { sessionId: toSessionId("session-1") };

    expect(target).toEqual({ sessionId: "session-1" });
  });

  it("names a born branch by its first durable entry", () => {
    const target: SessionTarget = {
      sessionId: toSessionId("session-1"),
      branchId: toBranchId("entry-1"),
    };

    expect(target).toEqual({
      sessionId: "session-1",
      branchId: "entry-1",
    });
  });

  it("rejects an empty branch entry id", () => {
    expect(() => toBranchId("")).toThrow("Invalid branch id");
  });
});
