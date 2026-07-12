import { describe, expect, it } from "vitest";

import {
  AgentSystemPromptRegistry,
  buildAgentSystemPromptSection,
} from "./registry";

describe("AgentSystemPromptRegistry", () => {
  it("assembles feature blobs in registration order", () => {
    const registry = new AgentSystemPromptRegistry();
    registry.register("first", "## First\n\nOne");
    registry.register("second", "## Second\n\nTwo");

    expect(buildAgentSystemPromptSection(registry)).toBe(
      "## First\n\nOne\n\n## Second\n\nTwo",
    );
  });

  it("enforces one nonempty blob per feature and releases it on disposal", () => {
    const registry = new AgentSystemPromptRegistry();
    const registration = registry.register("canvas", "Canvas instructions");

    expect(() => registry.register("canvas", "Again")).toThrow(
      "Agent system prompt already registered: canvas",
    );
    expect(() => registry.register("empty", "   ")).toThrow(
      "expected non-empty Markdown",
    );

    registration[Symbol.dispose]();
    expect(buildAgentSystemPromptSection(registry)).toBeUndefined();
    expect(() => registry.register("canvas", "Reloaded")).not.toThrow();
  });
});
