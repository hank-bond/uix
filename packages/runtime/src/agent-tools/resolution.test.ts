import { Type } from "typebox";
import { describe, expect, it } from "vitest";

import type { AgentToolDefinition } from "@uix/api/agent-tools";

import {
  resolveAgentToolContribution,
  toAgentToolCanonicalId,
} from "./resolution";

const emptyParams = Type.Object({});

function body(): AgentToolDefinition {
  return {
    label: "read",
    description: "read",
    parameters: emptyParams,
    execute: () => Promise.resolve({ content: [], details: {} }),
  };
}

describe("toAgentToolCanonicalId", () => {
  it("joins featureId + name with pi's double underscore", () => {
    expect(toAgentToolCanonicalId("canvas", "anchor_read")).toBe(
      "canvas__anchor_read",
    );
    expect(toAgentToolCanonicalId("canvas", "anchor_write")).toBe(
      "canvas__anchor_write",
    );
  });

  it("rejects invalid feature ids", () => {
    expect(() => toAgentToolCanonicalId("Canvas", "anchor_read")).toThrow(
      "Invalid feature id",
    );
    expect(() => toAgentToolCanonicalId("", "anchor_read")).toThrow(
      "Invalid feature id",
    );
    expect(() => toAgentToolCanonicalId("can-vas", "anchor_read")).toThrow(
      "Invalid feature id",
    );
  });

  it("rejects invalid tool names", () => {
    expect(() => toAgentToolCanonicalId("canvas", "AnchorRead")).toThrow(
      "Invalid agent tool name",
    );
    expect(() => toAgentToolCanonicalId("canvas", "")).toThrow(
      "Invalid agent tool name",
    );
    expect(() => toAgentToolCanonicalId("canvas", "anchor-read")).toThrow(
      "Invalid agent tool name",
    );
  });
});

describe("resolveAgentToolContribution", () => {
  it("derives both ids and stamps the pi tool name", () => {
    const resolvedContribution = resolveAgentToolContribution("canvas", {
      name: "anchor_read",
      tool: body(),
    });

    expect(resolvedContribution.contributionId as string).toBe(
      "canvas.agent.anchor_read",
    );
    expect(resolvedContribution.canonicalId).toBe("canvas__anchor_read");
    expect(resolvedContribution.tool.name).toBe("canvas__anchor_read");
    // Author body preserved.
    expect(resolvedContribution.tool.label).toBe("read");
    expect(resolvedContribution.tool.parameters).toBe(emptyParams);
  });

  it("retains the admitted base-tools provider's local name", () => {
    const resolvedContribution = resolveAgentToolContribution(
      "workspace_tools",
      { name: "read", tool: body() },
      { isBaseToolsProvider: true },
    );

    expect(resolvedContribution.contributionId as string).toBe(
      "workspace_tools.agent.read",
    );
    expect(resolvedContribution.canonicalId).toBe("read");
    expect(resolvedContribution.tool.name).toBe("read");
  });

  it("rejects invalid base-tool names through the ordinary resolver", () => {
    expect(() =>
      resolveAgentToolContribution(
        "workspace_tools",
        { name: "read-file", tool: body() },
        { isBaseToolsProvider: true },
      ),
    ).toThrow("Invalid agent tool name");
  });

  it("does not mutate the author's body object", () => {
    const input = body();
    resolveAgentToolContribution("canvas", {
      name: "anchor_read",
      tool: input,
    });

    // The author shape is Omit<ToolDefinition, "name">. The original input
    // object must not gain a `name` key.
    expect("name" in input).toBe(false);
  });
});
