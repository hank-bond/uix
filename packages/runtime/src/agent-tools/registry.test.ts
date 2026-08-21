import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";

import type { AgentToolDefinition } from "@uix/api/agent-tools";

import {
  AgentToolRegistry,
  createAgentToolInstaller,
  registerAgentToolContributions,
} from "./registry";

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

function installTools(
  registry = new AgentToolRegistry(),
): Map<string, ToolDefinition> {
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
    ).toThrow(
      "Agent tool contribution already registered: canvas.agent.anchor_read",
    );
  });

  it("namespaces the same local tool name across features", () => {
    const registry = new AgentToolRegistry();
    registerAgentToolContributions(registry, "canvas", [
      { name: "anchor_read", tool: body("read") },
    ]);

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

  it("retains every local name for the admitted base-tools provider", () => {
    const registry = new AgentToolRegistry();
    registerAgentToolContributions(
      registry,
      "workspace_tools",
      [
        { name: "read", tool: body("read") },
        { name: "write", tool: body("write") },
      ],
      { isBaseToolsProvider: true },
    );

    expect([...installTools(registry).keys()]).toEqual(["read", "write"]);
  });

  it("rejects competing prefix-free names across claimed base providers", () => {
    const registry = new AgentToolRegistry();
    registerAgentToolContributions(
      registry,
      "first",
      [{ name: "read", tool: body("first read") }],
      { isBaseToolsProvider: true },
    );

    expect(() =>
      registerAgentToolContributions(
        registry,
        "second",
        [{ name: "read", tool: body("second read") }],
        { isBaseToolsProvider: true },
      ),
    ).toThrow(
      "Agent tool name already registered: read (existing: first.agent.read, attempted: second.agent.read)",
    );
  });

  it("rolls back earlier tools when the bulk register operation fails", () => {
    const registry = new AgentToolRegistry();
    const contribution = { name: "anchor_read", tool: body("read") };

    expect(() =>
      registerAgentToolContributions(registry, "canvas", [
        contribution,
        contribution,
      ]),
    ).toThrow(
      "Agent tool contribution already registered: canvas.agent.anchor_read",
    );

    expect(() =>
      registerAgentToolContributions(registry, "canvas", [contribution]),
    ).not.toThrow();
  });

  it("bulk-registers contributions and installs active tools with derived names", () => {
    const registry = new AgentToolRegistry();
    const toolsDisposable = registerAgentToolContributions(registry, "canvas", [
      { name: "anchor_read", tool: body("canvas__anchor_read") },
      { name: "anchor_write", tool: body("canvas__anchor_write") },
    ]);

    expect([...installTools(registry).keys()]).toEqual([
      "canvas__anchor_read",
      "canvas__anchor_write",
    ]);

    toolsDisposable[Symbol.dispose]();
    expect([...installTools(registry).keys()]).toEqual([]);
  });

  it("unregisters a contribution when disposed", () => {
    const registry = new AgentToolRegistry();
    const toolsDisposable = registerAgentToolContributions(registry, "canvas", [
      { name: "anchor_read", tool: body("canvas__anchor_read") },
    ]);

    toolsDisposable[Symbol.dispose]();

    expect([...installTools(registry).keys()]).toEqual([]);
    // The registry allows re-registering the same name after dispose.
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
