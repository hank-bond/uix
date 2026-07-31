import { describe, expect, it } from "vitest";

import {
  AgentSystemPromptRegistry,
  buildAgentSystemPromptSection,
  registerAgentSystemPromptContribution,
} from "./registry";

describe("AgentSystemPromptRegistry", () => {
  it("assembles feature blobs in manifest order", () => {
    const registry = new AgentSystemPromptRegistry();
    registerAgentSystemPromptContribution(registry, "first", "## First\n\nOne");
    registerAgentSystemPromptContribution(
      registry,
      "second",
      "## Second\n\nTwo",
    );

    expect(buildAgentSystemPromptSection(registry)).toBe(
      "## First\n\nOne\n\n## Second\n\nTwo",
    );
  });

  it("enforces one nonempty blob per feature and releases it on disposal", () => {
    const registry = new AgentSystemPromptRegistry();
    const promptDisposable = registerAgentSystemPromptContribution(
      registry,
      "canvas",
      "Canvas instructions",
    );

    expect(() =>
      registerAgentSystemPromptContribution(registry, "canvas", "Again"),
    ).toThrow("Agent system prompt already registered: canvas");
    expect(() =>
      registerAgentSystemPromptContribution(registry, "empty", "   "),
    ).toThrow("expected non-empty Markdown");

    promptDisposable[Symbol.dispose]();
    expect(buildAgentSystemPromptSection(registry)).toBeUndefined();
    expect(() =>
      registerAgentSystemPromptContribution(registry, "canvas", "Reloaded"),
    ).not.toThrow();
  });
});
