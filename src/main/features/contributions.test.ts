import { describe, expect, it } from "vitest";

import { Type } from "typebox";

import { AgentContextRegistry } from "../agent-context/registry";
import { AgentToolRegistry } from "../agent-tools/registry";
import { ChannelRegistry } from "../channels/registry";
import { ResourceRegistry } from "../resources/registry";
import { normalizeResourceRoute } from "@uix/api/resource-routes";
import { TurnStateRegistry } from "../turn-state/registry";

import {
  registerFeatureContributions,
  registerFeaturePreflightContributions,
} from "./contributions";
import { SurfaceRegistry } from "./surfaces";

const emptyParams = Type.Object({});

function channelContribution(name = "refresh") {
  return {
    feature: "canvas",
    requests: {
      [name]: {
        requestSchema: emptyParams,
        responseSchema: Type.Void(),
        handle: () => undefined,
      },
    },
    events: {},
  };
}

function resourceContribution(name = "doc") {
  return {
    name,
    route: normalizeResourceRoute({ path: "/:key*", origin: "feature" }),
    handle: () => new Response(""),
  };
}

function agentTool(name: string) {
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

describe("registerFeatureContributions", () => {
  it("registers all contribution groups and disposes them together", () => {
    const resources = new ResourceRegistry({
      workspaceId: "local",
      handle: () => undefined,
      unhandle: () => undefined,
    });
    const channels = new ChannelRegistry({
      transportHandle: () => ({
        [Symbol.dispose]() {},
      }),
    });
    const agentTools = new AgentToolRegistry();
    const turnState = new TurnStateRegistry();
    const agentContext = new AgentContextRegistry();

    const registration = registerFeatureContributions(
      { resources, channels, agentTools, turnState, agentContext },
      "canvas",
      {
        resources: [resourceContribution()],
        channels: [channelContribution()],
        agentTools: [agentTool("anchor_read")],
        turnState: [{ prepareUserSubmitState: () => ({ state: {} }) }],
        agentContext: [
          {
            name: "canvas-diff",
            description: "diffs",
            materialize: () => undefined,
          },
        ],
      },
    );

    expect(() =>
      registerFeatureContributions({ resources }, "canvas", {
        resources: [resourceContribution()],
      }),
    ).toThrow("Resource already registered: canvas-doc");
    expect(() =>
      registerFeatureContributions({ channels }, "canvas", {
        channels: [channelContribution()],
      }),
    ).toThrow("Channel already registered: canvas.refresh");
    expect(() =>
      registerFeatureContributions({ agentTools }, "canvas", {
        agentTools: [
          {
            name: "anchor_read",
            tool: agentTool("anchor_read").tool,
          },
        ],
      }),
    ).toThrow("Agent tool already registered: canvas__anchor_read");
    expect(() =>
      registerFeatureContributions({ turnState }, "canvas", {
        turnState: [{}],
      }),
    ).toThrow("Turn state already registered: canvas");
    expect(() =>
      registerFeatureContributions({ agentContext }, "other", {
        agentContext: [
          {
            name: "canvas-diff",
            description: "again",
            materialize: () => undefined,
          },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      registerFeatureContributions({ agentContext }, "canvas", {
        agentContext: [
          {
            name: "canvas-diff",
            description: "again",
            materialize: () => undefined,
          },
        ],
      }),
    ).toThrow("Agent context already registered: canvas.canvas-diff");

    registration[Symbol.dispose]();

    expect(() =>
      registerFeatureContributions(
        { resources, channels, agentTools, turnState, agentContext },
        "canvas",
        {
          resources: [resourceContribution()],
          channels: [channelContribution()],
          agentTools: [agentTool("anchor_read")],
          turnState: [{}],
          agentContext: [
            {
              name: "canvas-diff",
              description: "diffs",
              materialize: () => undefined,
            },
          ],
        },
      ),
    ).not.toThrow();
  });

  it("rejects contribution groups when the matching registry is missing", () => {
    expect(() =>
      registerFeatureContributions({}, "canvas", {
        resources: [resourceContribution()],
      }),
    ).toThrow(
      "Feature canvas contributes resources but no resource registry was provided",
    );

    expect(() =>
      registerFeatureContributions({}, "canvas", {
        channels: [channelContribution()],
      }),
    ).toThrow(
      "Feature canvas contributes channels but no channel registry was provided",
    );

    expect(() =>
      registerFeatureContributions({}, "canvas", {
        agentTools: [agentTool("anchor_read")],
      }),
    ).toThrow(
      "Feature canvas contributes agent tools but no agent tool registry was provided",
    );

    expect(() =>
      registerFeatureContributions({}, "canvas", { turnState: [{}] }),
    ).toThrow(
      "Feature canvas contributes turn state but no turn-state registry was provided",
    );

    expect(() =>
      registerFeatureContributions({}, "canvas", {
        agentContext: [
          {
            name: "canvas-diff",
            description: "diffs",
            materialize: () => undefined,
          },
        ],
      }),
    ).toThrow(
      "Feature canvas contributes agent context but no agent-context registry was provided",
    );

    expect(() =>
      registerFeatureContributions({}, "canvas", {
        surfaces: ["./surface.tsx"],
      }),
    ).toThrow(
      "Feature canvas contributes surfaces but no surface registry was provided",
    );
  });

  it("rejects surface contributions without an entry directory", () => {
    const surfaces = new SurfaceRegistry();
    expect(() =>
      registerFeatureContributions({ surfaces }, "canvas", {
        surfaces: ["./surface.tsx"],
      }),
    ).toThrow(
      "Feature canvas contributes surfaces but was activated without an entry directory",
    );
  });
});

describe("registerFeaturePreflightContributions", () => {
  it("registers the pre-ready resource protocol", () => {
    const registered: Electron.CustomScheme[][] = [];

    registerFeaturePreflightContributions(
      [
        {
          id: "canvas",
          contribute: () => ({}),
        },
      ],
      (schemes) => {
        registered.push(schemes);
      },
    );

    expect(registered).toEqual([
      [
        {
          scheme: "uix-resource",
          privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
          },
        },
      ],
    ]);
  });
});
