import { describe, expect, it } from "vitest";

import { toggleParamKey } from "./ToolBlockSettings";

describe("toggleParamKey", () => {
  it("appends a newly shown key in list order", () => {
    expect(toggleParamKey(["key"], "reason", true)).toEqual(["key", "reason"]);
  });

  it("removes a hidden key", () => {
    expect(toggleParamKey(["key", "timeout"], "key", false)).toEqual([
      "timeout",
    ]);
  });

  it("keeps an already-shown key stable", () => {
    expect(toggleParamKey(["key"], "key", true)).toEqual(["key"]);
  });

  it("keeps an already-hidden key absent", () => {
    expect(toggleParamKey(["key"], "timeout", false)).toEqual(["key"]);
  });
});
