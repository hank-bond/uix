import { describe, expect, it } from "vitest";

import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  createAgentToolInstaller,
  createAgentToolRegistry,
  registerAgentToolContributions,
} from "./tools";

const emptyParams = Type.Object({});

function tool(name: string): ToolDefinition<typeof emptyParams> {
  return {
    name,
    label: name,
    description: name,
    parameters: emptyParams,
    execute: () => Promise.resolve({ content: [], details: {} }),
  };
}

function installTools(registry = createAgentToolRegistry()) {
  const tools = new Map<string, ToolDefinition>();
  const pi = {
    registerTool: (next: ToolDefinition) => tools.set(next.name, next),
  } as unknown as ExtensionAPI;

  void createAgentToolInstaller(registry)(pi);

  return tools;
}

describe("AgentToolRegistry", () => {
  it("rejects duplicate contribution ids", () => {
    const registry = createAgentToolRegistry();
    registry.register({
      id: "canvas.anchor_read",
      tool: tool("canvas__anchor_read"),
    });

    expect(() =>
      registry.register({
        id: "canvas.anchor_read",
        tool: tool("canvas__other"),
      }),
    ).toThrow("Agent tool contribution already registered: canvas.anchor_read");
  });

  it("rejects duplicate tool names", () => {
    const registry = createAgentToolRegistry();
    registry.register({
      id: "canvas.anchor_read",
      tool: tool("canvas__anchor_read"),
    });

    expect(() =>
      registry.register({
        id: "canvas.other_read",
        tool: tool("canvas__anchor_read"),
      }),
    ).toThrow("Agent tool already registered: canvas__anchor_read");
  });

  it("bulk-registers contributions and installs active tools", () => {
    const registry = createAgentToolRegistry();
    const registrations = registerAgentToolContributions(registry, [
      { id: "canvas.anchor_read", tool: tool("canvas__anchor_read") },
      { id: "canvas.anchor_write", tool: tool("canvas__anchor_write") },
    ]);

    expect([...installTools(registry).keys()]).toEqual([
      "canvas__anchor_read",
      "canvas__anchor_write",
    ]);

    registrations[Symbol.dispose]();
    expect([...installTools(registry).keys()]).toEqual([]);
  });

  it("unregisters a contribution when disposed", () => {
    const registry = createAgentToolRegistry();
    const registration = registry.register({
      id: "canvas.anchor_read",
      tool: tool("canvas__anchor_read"),
    });

    registration[Symbol.dispose]();

    expect([...installTools(registry).keys()]).toEqual([]);
    expect(() =>
      registry.register({
        id: "canvas.anchor_read",
        tool: tool("canvas__anchor_read"),
      }),
    ).not.toThrow();
  });
});
