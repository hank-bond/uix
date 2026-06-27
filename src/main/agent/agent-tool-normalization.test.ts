import { describe, expect, it } from "vitest";

import { Type } from "typebox";

import {
  agentToolCanonicalId,
  normalizeAgentToolContribution,
} from "./agent-tool-normalization";
import type { AgentToolDefinition } from "./agent-tool-normalization";

const emptyParams = Type.Object({});

function body(): AgentToolDefinition {
  return {
    label: "read",
    description: "read",
    parameters: emptyParams,
    execute: () => Promise.resolve({ content: [], details: {} }),
  };
}

describe("agentToolCanonicalId", () => {
  it("joins featureId + name with pi's double underscore", () => {
    expect(agentToolCanonicalId("canvas", "anchor_read")).toBe(
      "canvas__anchor_read",
    );
    expect(agentToolCanonicalId("canvas", "anchor_write")).toBe(
      "canvas__anchor_write",
    );
  });

  it("rejects invalid feature ids", () => {
    expect(() => agentToolCanonicalId("Canvas", "anchor_read")).toThrow(
      "Invalid feature id",
    );
    expect(() => agentToolCanonicalId("", "anchor_read")).toThrow(
      "Invalid feature id",
    );
    expect(() => agentToolCanonicalId("can-vas", "anchor_read")).toThrow(
      "Invalid feature id",
    );
  });

  it("rejects invalid tool names", () => {
    expect(() => agentToolCanonicalId("canvas", "AnchorRead")).toThrow(
      "Invalid agent tool name",
    );
    expect(() => agentToolCanonicalId("canvas", "")).toThrow(
      "Invalid agent tool name",
    );
    expect(() => agentToolCanonicalId("canvas", "anchor-read")).toThrow(
      "Invalid agent tool name",
    );
  });
});

describe("normalizeAgentToolContribution", () => {
  it("derives both ids and stamps the pi tool name", () => {
    const registration = normalizeAgentToolContribution("canvas", {
      name: "anchor_read",
      tool: body(),
    });

    expect(registration.contributionId as string).toBe(
      "canvas.agent.anchor_read",
    );
    expect(registration.canonicalId).toBe("canvas__anchor_read");
    expect(registration.tool.name).toBe("canvas__anchor_read");
    // Author body preserved.
    expect(registration.tool.label).toBe("read");
    expect(registration.tool.parameters).toBe(emptyParams);
  });

  it("does not mutate the author's body object", () => {
    const input = body();
    normalizeAgentToolContribution("canvas", {
      name: "anchor_read",
      tool: input,
    });

    // The author shape is Omit<ToolDefinition, "name">; the original input
    // object must not gain a `name` key.
    expect("name" in input).toBe(false);
  });
});
