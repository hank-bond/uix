import { type TSchema, Type } from "typebox";
import { describe, expect, it } from "vitest";

import type { AgentToolContribution } from "@uix/api/agent-tools";
import type { TurnStateContributions } from "@uix/api/turn-state";

import {
  type AgentFeatureRegistries,
  registerAgentFeatureContributions,
  registerWorkspaceFeatureContributions,
  type WorkspaceFeatureRegistries,
} from "./contributions";
import { SurfaceRegistry } from "./surfaces";
import { AgentContextRegistry } from "../agent-context/registry";
import { AgentSkillRegistry } from "../agent-skill-registry";
import { AgentSystemPromptRegistry } from "../agent-system-prompt-registry";
import { AgentToolRegistry } from "../agent-tools/registry";
import {
  AgentChannelHandlerRegistry,
  ChannelRegistry,
} from "../channel-registry";
import { ResourceRegistry } from "../resource-registry";
import { TurnStateRegistry } from "../turn-state";

const emptyParams = Type.Object({});

function channelContribution(name = "refresh"): {
  feature: string;
  requests: Record<
    string,
    {
      requestSchema: TSchema;
      responseSchema: TSchema;
      handler: () => undefined;
    }
  >;
  events: Record<string, never>;
} {
  return {
    feature: "canvas",
    requests: {
      [name]: {
        requestSchema: emptyParams,
        responseSchema: Type.Void(),
        handler: () => undefined,
      },
    },
    events: {},
  };
}

function workspaceRegistries(): WorkspaceFeatureRegistries {
  return {
    resources: new ResourceRegistry({ workspaceId: "local" }),
    channels: new ChannelRegistry(),
    invokeAgentChannel: (context, canonicalId, payload) =>
      context.agentInstanceGuard.value.featureChannels.invoke(
        canonicalId,
        payload,
      ),
    surfaces: new SurfaceRegistry(),
  };
}

function agentRegistries(): AgentFeatureRegistries {
  return {
    channels: new AgentChannelHandlerRegistry(),
    agentTools: new AgentToolRegistry(),
    agentSystemPrompt: new AgentSystemPromptRegistry(),
    agentSkills: new AgentSkillRegistry(),
    turnState: new TurnStateRegistry(),
    agentContext: new AgentContextRegistry(),
  };
}

function agentTool(name: string): AgentToolContribution {
  return {
    name,
    tool: {
      label: name,
      description: name,
      parameters: emptyParams,
      execute: () => Promise.resolve({ content: [], details: {} }),
    },
  };
}

function turnStateCells(): TurnStateContributions {
  return {
    documents: {
      schema: Type.Object({}),
      createSnapshot: () => ({}),
      restore: () => undefined,
    },
  };
}

describe("feature contribution registration", () => {
  it("registers and removes Workspace facets together", () => {
    const registries = workspaceRegistries();
    const lifetime = registerWorkspaceFeatureContributions(
      registries,
      "canvas",
      {
        agentChannelContracts: [channelContribution()],
        surfaces: ["./surface.tsx"],
      },
      { entryDir: "/feature" },
    );

    expect(registries.channels.listCanonicalIds()).toEqual(["canvas.refresh"]);
    expect(registries.surfaces.list()).toHaveLength(1);

    lifetime[Symbol.dispose]();
    expect(registries.channels.listCanonicalIds()).toEqual([]);
    expect(registries.surfaces.list()).toEqual([]);
  });

  it("registers and removes Agent facets together", () => {
    const registries = agentRegistries();
    const lifetime = registerAgentFeatureContributions(
      registries,
      "canvas",
      {
        channels: [channelContribution()],
        agentTools: [agentTool("anchor_read")],
        agentToolOverrides: [agentTool("read")],
        agentSystemPrompt: "Canvas guidance",
        agentSkills: ["./skills/canvas-authoring"],
        turnState: turnStateCells(),
        agentContext: [
          {
            name: "canvas-diff",
            description: "diffs",
            materialize: () => undefined,
          },
        ],
      },
      { entryDir: "/feature" },
    );

    expect(registries.channels.listCanonicalIds()).toEqual(["canvas.refresh"]);
    expect(registries.agentTools.list()).toHaveLength(2);
    expect(registries.agentSkills.list()[0]?.path).toBe(
      "/feature/skills/canvas-authoring",
    );
    expect(registries.turnState.list()).toHaveLength(1);
    expect(registries.agentContext.list()).toHaveLength(1);

    lifetime[Symbol.dispose]();
    expect(registries.channels.listCanonicalIds()).toEqual([]);
    expect(registries.agentTools.list()).toEqual([]);
    expect(registries.turnState.list()).toEqual([]);
  });

  it("rolls back earlier Agent facets when a later facet fails", () => {
    const registries = agentRegistries();
    registerAgentFeatureContributions(registries, "existing", {
      agentToolOverrides: [agentTool("read")],
    });

    expect(() =>
      registerAgentFeatureContributions(registries, "canvas", {
        agentTools: [agentTool("anchor_read")],
        agentToolOverrides: [agentTool("read")],
      }),
    ).toThrow("Agent tool name already registered: read");
    expect(
      registries.agentTools
        .list()
        .some(({ canonicalId }) => canonicalId === "canvas__anchor_read"),
    ).toBe(false);
  });

  it("rejects path facets without an entry directory", () => {
    expect(() =>
      registerWorkspaceFeatureContributions(workspaceRegistries(), "canvas", {
        surfaces: ["./surface.tsx"],
      }),
    ).toThrow("without an entry directory");

    expect(() =>
      registerAgentFeatureContributions(agentRegistries(), "canvas", {
        agentSkills: ["./skill"],
      }),
    ).toThrow("without an entry directory");
  });
});
