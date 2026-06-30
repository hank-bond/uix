import { describe, expect, it } from "vitest";

import { Type } from "typebox";

import { StateMessageRegistry } from "../agent/state-messages";
import { AgentToolRegistry } from "../agent/tools";
import { ChannelRegistry } from "../channels/registry";
import { ResourceRegistry } from "../resources/registry";
import { normalizeResourceRoute } from "#shared/resource-routes";
import { StateRegistry } from "../state/registry";

import {
  registerFeatureContributions,
  registerFeaturePreflightContributions,
} from "./contributions";

const emptyParams = Type.Object({});

function channelContribution(name = "refresh") {
  return {
    requests: {
      [name]: {
        request: emptyParams,
        response: Type.Void(),
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
    const state = new StateRegistry();
    const stateMessages = new StateMessageRegistry();

    const registration = registerFeatureContributions(
      { resources, channels, agentTools, state, stateMessages },
      "canvas",
      {
        resources: [resourceContribution()],
        channels: [channelContribution()],
        agentTools: [agentTool("anchor_read")],
        state: [{ prepareUserSubmitState: () => ({ state: {} }) }],
        stateMessages: [
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
      registerFeatureContributions({ state }, "canvas", {
        state: [{}],
      }),
    ).toThrow("State already registered: canvas");
    expect(() =>
      registerFeatureContributions({ stateMessages }, "other", {
        stateMessages: [
          {
            name: "canvas-diff",
            description: "again",
            materialize: () => undefined,
          },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      registerFeatureContributions({ stateMessages }, "canvas", {
        stateMessages: [
          {
            name: "canvas-diff",
            description: "again",
            materialize: () => undefined,
          },
        ],
      }),
    ).toThrow("State message already registered: canvas.canvas-diff");

    registration[Symbol.dispose]();

    expect(() =>
      registerFeatureContributions(
        { resources, channels, agentTools, state, stateMessages },
        "canvas",
        {
          resources: [resourceContribution()],
          channels: [channelContribution()],
          agentTools: [agentTool("anchor_read")],
          state: [{}],
          stateMessages: [
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
      registerFeatureContributions({}, "canvas", { state: [{}] }),
    ).toThrow(
      "Feature canvas contributes state but no state registry was provided",
    );

    expect(() =>
      registerFeatureContributions({}, "canvas", {
        stateMessages: [
          {
            name: "canvas-diff",
            description: "diffs",
            materialize: () => undefined,
          },
        ],
      }),
    ).toThrow(
      "Feature canvas contributes state messages but no state-message registry was provided",
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
          },
        },
      ],
    ]);
  });
});
