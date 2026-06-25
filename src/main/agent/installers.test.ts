import { describe, expect, it } from "vitest";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { type AgentInstaller, createUixCoreExtension } from "./installers";

const pi = {} as ExtensionAPI;

describe("createUixCoreExtension", () => {
  it("runs installers in list order, each handed the same pi", async () => {
    const seen: string[] = [];
    const installer =
      (id: string): AgentInstaller =>
      (handle) => {
        expect(handle).toBe(pi);
        seen.push(id);
      };
    await createUixCoreExtension([
      installer("a"),
      installer("b"),
      installer("c"),
    ])(pi);
    expect(seen).toEqual(["a", "b", "c"]);
  });

  it("awaits an async installer before running the next", async () => {
    const seen: string[] = [];
    const slow: AgentInstaller = async () => {
      await Promise.resolve();
      seen.push("slow");
    };
    const fast: AgentInstaller = () => {
      seen.push("fast");
    };
    await createUixCoreExtension([slow, fast])(pi);
    expect(seen).toEqual(["slow", "fast"]);
  });
});
