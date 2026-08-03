import { Type } from "typebox";
import { describe, expect, it } from "vitest";

import type { AgentToolDefinition } from "@uix/api/agent-tools";

import {
  resolveAgentToolContribution,
  resolveAgentToolOverrideContribution,
  toAgentToolCanonicalId,
  toAgentToolOverrideCanonicalId,
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

describe("toAgentToolOverrideCanonicalId", () => {
  it("retains a valid exact Pi tool name", () => {
    expect(toAgentToolOverrideCanonicalId("read")).toBe("read");
    expect(toAgentToolOverrideCanonicalId("write")).toBe("write");
  });

  it("rejects invalid exact names", () => {
    expect(() => toAgentToolOverrideCanonicalId("Read")).toThrow(
      "Invalid agent tool override name",
    );
    expect(() => toAgentToolOverrideCanonicalId("read-file")).toThrow(
      "Invalid agent tool override name",
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

  it("does not mutate the author's body object", () => {
    const input = body();
    resolveAgentToolContribution("canvas", {
      name: "anchor_read",
      tool: input,
    });

    // The author shape is Omit<ToolDefinition, "name">; the original input
    // object must not gain a `name` key.
    expect("name" in input).toBe(false);
  });
});

describe("resolveAgentToolOverrideContribution", () => {
  it("retains the exact Pi name while deriving feature ownership", () => {
    const resolvedContribution = resolveAgentToolOverrideContribution("chat", {
      name: "read",
      tool: body(),
    });

    expect(resolvedContribution.contributionId as string).toBe(
      "chat.agent.read",
    );
    expect(resolvedContribution.canonicalId).toBe("read");
    expect(resolvedContribution.tool.name).toBe("read");
    expect(resolvedContribution.tool.parameters).toBe(emptyParams);
  });
});
