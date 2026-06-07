import { describe, expect, it } from "vitest";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { type AgentBinding, createUixCoreExtension } from "./bindings";

const pi = {} as ExtensionAPI;

describe("createUixCoreExtension", () => {
  it("runs bindings in list order, each handed the same pi", async () => {
    const seen: string[] = [];
    const binding =
      (id: string): AgentBinding =>
      (handle) => {
        expect(handle).toBe(pi);
        seen.push(id);
      };
    await createUixCoreExtension([binding("a"), binding("b"), binding("c")])(
      pi,
    );
    expect(seen).toEqual(["a", "b", "c"]);
  });

  it("awaits an async binding before running the next", async () => {
    const seen: string[] = [];
    const slow: AgentBinding = async () => {
      await Promise.resolve();
      seen.push("slow");
    };
    const fast: AgentBinding = () => {
      seen.push("fast");
    };
    await createUixCoreExtension([slow, fast])(pi);
    expect(seen).toEqual(["slow", "fast"]);
  });
});
