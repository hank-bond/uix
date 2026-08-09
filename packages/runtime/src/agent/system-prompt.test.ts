import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { createSystemPromptAssembler } from "./system-prompt";

describe("createSystemPromptAssembler", () => {
  it("computes ordered sections once and appends the suffix to Pi's base", () => {
    let first = "## First";
    const firstSource = vi.fn(() => first);
    const secondSource = vi.fn(() => "## Second");
    let handler:
      | ((event: { systemPrompt: string }) => { systemPrompt: string })
      | undefined;

    const pi = {
      on: (event: string, next: typeof handler) => {
        if (event === "before_agent_start") handler = next;
      },
    } as unknown as ExtensionAPI;

    void createSystemPromptAssembler([firstSource, secondSource])(pi);
    first = "changed after installation";

    expect(firstSource).toHaveBeenCalledOnce();
    expect(secondSource).toHaveBeenCalledOnce();
    expect(handler?.({ systemPrompt: "PI BASE" })).toEqual({
      systemPrompt: "PI BASE\n\n## First\n\n## Second",
    });
    expect(handler?.({ systemPrompt: "PI BASE" })).toEqual({
      systemPrompt: "PI BASE\n\n## First\n\n## Second",
    });
    expect(firstSource).toHaveBeenCalledOnce();
  });

  it("does not install a hook when every source is empty", () => {
    const on = vi.fn();
    void createSystemPromptAssembler([() => undefined, () => "   "])({
      on,
    } as unknown as ExtensionAPI);
    expect(on).not.toHaveBeenCalled();
  });
});
