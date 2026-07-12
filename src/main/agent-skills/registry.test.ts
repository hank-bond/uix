import { resolve } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import {
  AgentSkillRegistry,
  createAgentSkillInstaller,
  registerAgentSkillContributions,
} from "./registry";

describe("AgentSkillRegistry", () => {
  it("resolves feature-relative paths in registration order and disposes them", () => {
    const registry = new AgentSkillRegistry();
    const first = registerAgentSkillContributions(
      registry,
      "canvas",
      ["./skills/canvas-authoring", "/shared/skill.md"],
      "/workspace/features/canvas",
    );
    registerAgentSkillContributions(
      registry,
      "reports",
      ["skills/reporting"],
      "/workspace/features/reports",
    );

    expect(registry.list()).toEqual([
      resolve("/workspace/features/canvas/skills/canvas-authoring"),
      "/shared/skill.md",
      resolve("/workspace/features/reports/skills/reporting"),
    ]);

    first[Symbol.dispose]();
    expect(registry.list()).toEqual([
      resolve("/workspace/features/reports/skills/reporting"),
    ]);
  });

  it("snapshots paths once per Pi runtime installation", () => {
    const registry = new AgentSkillRegistry();
    registerAgentSkillContributions(
      registry,
      "canvas",
      ["skill-a"],
      "/feature",
    );

    let discover: (() => { skillPaths?: readonly string[] }) | undefined;
    const pi = {
      on: (event: string, handler: typeof discover) => {
        if (event === "resources_discover") discover = handler;
      },
    } as unknown as ExtensionAPI;
    void createAgentSkillInstaller(registry)(pi);

    registerAgentSkillContributions(registry, "later", ["skill-b"], "/feature");
    expect(discover?.()).toEqual({
      skillPaths: [resolve("/feature/skill-a")],
    });
  });

  it("rejects empty skill refs", () => {
    expect(() =>
      registerAgentSkillContributions(
        new AgentSkillRegistry(),
        "canvas",
        [""],
        "/feature",
      ),
    ).toThrow("invalid agent skill ref");
  });
});
