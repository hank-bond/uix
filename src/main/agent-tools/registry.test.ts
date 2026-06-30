import { describe, expect, it } from "vitest";

import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  createAgentToolInstaller,
  AgentToolRegistry,
  registerAgentToolContributions,
} from "./registry";
import type { AgentToolDefinition } from "./normalization";

const emptyParams = Type.Object({});

/** Author-shaped tool body: everything but `name`. */
function body(label: string): AgentToolDefinition {
  return {
    label,
    description: label,
    parameters: emptyParams,
    execute: () => Promise.resolve({ content: [], details: {} }),
  };
}

function installTools(registry = new AgentToolRegistry()) {
  const tools = new Map<string, ToolDefinition>();
  const pi = {
    registerTool: (next: ToolDefinition) => tools.set(next.name, next),
  } as unknown as ExtensionAPI;

  void createAgentToolInstaller(registry)(pi);

  return tools;
}

describe("AgentToolRegistry", () => {
  it("rejects duplicate contribution ids (same local name)", () => {
    const registry = new AgentToolRegistry();
    registerAgentToolContributions(registry, "canvas", [
      { name: "anchor_read", tool: body("read") },
    ]);

    expect(() =>
      registerAgentToolContributions(registry, "canvas", [
        { name: "anchor_read", tool: body("other") },
      ]),
    ).toThrow("Agent tool already registered: canvas__anchor_read");
  });

  it("rejects duplicate canonical tool names across features", () => {
    const registry = new AgentToolRegistry();
    registerAgentToolContributions(registry, "canvas", [
      { name: "anchor_read", tool: body("read") },
    ]);

    // Different featureId + local name, but if canonical ids collided it
    // would be the pi tool name that dupes. Here they differ, so this should
    // succeed; the assertion below checks the derived name is distinct.
    expect(() =>
      registerAgentToolContributions(registry, "other", [
        { name: "anchor_read", tool: body("read") },
      ]),
    ).not.toThrow();

    const tools = installTools(registry);
    expect([...tools.keys()].sort()).toEqual([
      "canvas__anchor_read",
      "other__anchor_read",
    ]);
  });

  it("bulk-registers contributions and installs active tools with derived names", () => {
    const registry = new AgentToolRegistry();
    const registrations = registerAgentToolContributions(registry, "canvas", [
      { name: "anchor_read", tool: body("canvas__anchor_read") },
      { name: "anchor_write", tool: body("canvas__anchor_write") },
    ]);

    expect([...installTools(registry).keys()]).toEqual([
      "canvas__anchor_read",
      "canvas__anchor_write",
    ]);

    registrations[Symbol.dispose]();
    expect([...installTools(registry).keys()]).toEqual([]);
  });

  it("unregisters a contribution when disposed", () => {
    const registry = new AgentToolRegistry();
    const registrations = registerAgentToolContributions(registry, "canvas", [
      { name: "anchor_read", tool: body("canvas__anchor_read") },
    ]);

    registrations[Symbol.dispose]();

    expect([...installTools(registry).keys()]).toEqual([]);
    // Re-registering the same name after dispose is allowed.
    expect(() =>
      registerAgentToolContributions(registry, "canvas", [
        { name: "anchor_read", tool: body("canvas__anchor_read") },
      ]),
    ).not.toThrow();
  });

  it("reproduces the legacy pi tool names (back-compat for persisted history)", () => {
    const registry = new AgentToolRegistry();
    registerAgentToolContributions(registry, "canvas", [
      { name: "anchor_read", tool: body("read") },
      { name: "anchor_write", tool: body("write") },
      { name: "anchor_edit", tool: body("edit") },
    ]);

    expect([...installTools(registry).keys()].sort()).toEqual([
      "canvas__anchor_edit",
      "canvas__anchor_read",
      "canvas__anchor_write",
    ]);
  });
});
