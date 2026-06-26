import { describe, expect, it } from "vitest";

import { Type } from "typebox";

import { createStateMessages } from "../agent/state-messages";
import { createAgentToolRegistry } from "../agent/tools";
import { createChannelRegistry } from "../channels/registry";
import { createResourceRegistry } from "../resources/registry";
import { createStateRegistry } from "../state/registry";

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

function agentTool(name: string) {
  return {
    id: `canvas.${name}`,
    tool: {
      name: `canvas__${name}`,
      label: name,
      description: name,
      parameters: emptyParams,
      execute: () => Promise.resolve({ content: [], details: {} }),
    },
  };
}

describe("registerFeatureContributions", () => {
  it("registers all contribution groups and disposes them together", () => {
    const resources = createResourceRegistry({
      handle: () => undefined,
      unhandle: () => undefined,
    });
    const channels = createChannelRegistry({
      handle: () => ({
        [Symbol.dispose]() {},
      }),
    });
    const agentTools = createAgentToolRegistry();
    const state = createStateRegistry();
    const stateMessages = createStateMessages();

    const registration = registerFeatureContributions(
      { resources, channels, agentTools, state, stateMessages },
      {
        id: "canvas",
        resources: [
          {
            id: "canvas.resource.html",
            scheme: "uix-canvas",
            handle: () => new Response(""),
          },
        ],
        channels: [channelContribution()],
        agentTools: [agentTool("anchor_read")],
        state: [
          { id: "canvas", prepareUserSubmitState: () => ({ state: {} }) },
        ],
        stateMessages: [
          {
            messageType: "uix.canvas-diff",
            description: "diffs",
            materialize: () => undefined,
          },
        ],
      },
    );

    expect(() =>
      registerFeatureContributions(
        { resources },
        {
          id: "other",
          resources: [
            {
              id: "other.resource.html",
              scheme: "uix-canvas",
              handle: () => new Response(""),
            },
          ],
        },
      ),
    ).toThrow("Resource scheme already handled: uix-canvas");
    expect(() =>
      registerFeatureContributions(
        { channels },
        {
          id: "canvas",
          channels: [channelContribution()],
        },
      ),
    ).toThrow(
      "Channel contribution already registered: canvas.channel.refresh",
    );
    expect(() =>
      registerFeatureContributions(
        { agentTools },
        {
          id: "other",
          agentTools: [
            {
              id: "other.anchor_read",
              tool: agentTool("anchor_read").tool,
            },
          ],
        },
      ),
    ).toThrow("Agent tool already registered: canvas__anchor_read");
    expect(() =>
      registerFeatureContributions(
        { state },
        { id: "other", state: [{ id: "canvas" }] },
      ),
    ).toThrow("State contribution already registered: canvas");
    expect(() =>
      registerFeatureContributions(
        { stateMessages },
        {
          id: "other",
          stateMessages: [
            {
              messageType: "uix.canvas-diff",
              description: "again",
              materialize: () => undefined,
            },
          ],
        },
      ),
    ).toThrow("State message already registered: uix.canvas-diff");

    registration[Symbol.dispose]();

    expect(() =>
      registerFeatureContributions(
        { resources, channels, agentTools, state, stateMessages },
        {
          id: "canvas",
          resources: [
            {
              id: "canvas.resource.html",
              scheme: "uix-canvas",
              handle: () => new Response(""),
            },
          ],
          channels: [channelContribution()],
          agentTools: [agentTool("anchor_read")],
          state: [{ id: "canvas" }],
          stateMessages: [
            {
              messageType: "uix.canvas-diff",
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
      registerFeatureContributions(
        {},
        {
          id: "canvas",
          resources: [
            {
              id: "canvas.resource.html",
              scheme: "uix-canvas",
              handle: () => new Response(""),
            },
          ],
        },
      ),
    ).toThrow(
      "Feature canvas contributes resources but no resource registry was provided",
    );

    expect(() =>
      registerFeatureContributions(
        {},
        {
          id: "canvas",
          channels: [channelContribution()],
        },
      ),
    ).toThrow(
      "Feature canvas contributes channels but no channel registry was provided",
    );

    expect(() =>
      registerFeatureContributions(
        {},
        { id: "canvas", agentTools: [agentTool("anchor_read")] },
      ),
    ).toThrow(
      "Feature canvas contributes agent tools but no agent tool registry was provided",
    );

    expect(() =>
      registerFeatureContributions(
        {},
        { id: "canvas", state: [{ id: "canvas" }] },
      ),
    ).toThrow(
      "Feature canvas contributes state but no state registry was provided",
    );

    expect(() =>
      registerFeatureContributions(
        {},
        {
          id: "canvas",
          stateMessages: [
            {
              messageType: "uix.canvas-diff",
              description: "diffs",
              materialize: () => undefined,
            },
          ],
        },
      ),
    ).toThrow(
      "Feature canvas contributes state messages but no state-message registry was provided",
    );
  });
});

describe("registerFeaturePreflightContributions", () => {
  it("registers pre-ready resource schemes from feature definitions", () => {
    const registered: Electron.CustomScheme[][] = [];

    registerFeaturePreflightContributions(
      [
        {
          id: "canvas",
          preflight: {
            resourceSchemes: [
              {
                id: "canvas.resource.scheme",
                scheme: "uix-canvas",
                privileges: { standard: true },
              },
            ],
          },
          contribute: () => ({ id: "canvas" }),
        },
      ],
      (schemes) => {
        registered.push(schemes);
      },
    );

    expect(registered).toEqual([
      [
        {
          scheme: "uix-canvas",
          privileges: { standard: true },
        },
      ],
    ]);
  });
});
