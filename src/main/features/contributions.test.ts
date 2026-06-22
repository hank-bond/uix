import { describe, expect, it } from "vitest";

import { Type } from "typebox";

import { createStateMessages } from "../agent/state-messages";
import { createAgentToolRegistry } from "../agent/tools";
import { createChannelRegistry } from "../channels/registry";
import { createStateRegistry } from "../state/registry";

import { registerFeatureContributions } from "./contributions";

const emptyParams = Type.Object({});

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
    const channels = createChannelRegistry({
      handle: () => ({
        [Symbol.dispose]() {},
      }),
    });
    const agentTools = createAgentToolRegistry();
    const state = createStateRegistry();
    const stateMessages = createStateMessages();

    const registration = registerFeatureContributions(
      { channels, agentTools, state, stateMessages },
      {
        id: "canvas",
        channels: [
          {
            id: "canvas.channel.refresh",
            channel: "uix:canvas-refresh",
            handle: () => undefined,
          },
        ],
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
        { channels },
        {
          id: "other",
          channels: [
            {
              id: "other.channel.refresh",
              channel: "uix:canvas-refresh",
              handle: () => undefined,
            },
          ],
        },
      ),
    ).toThrow("Channel already registered: uix:canvas-refresh");
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
        { channels, agentTools, state, stateMessages },
        {
          id: "canvas",
          channels: [
            {
              id: "canvas.channel.refresh",
              channel: "uix:canvas-refresh",
              handle: () => undefined,
            },
          ],
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
          channels: [
            {
              id: "canvas.channel.refresh",
              channel: "uix:canvas-refresh",
              handle: () => undefined,
            },
          ],
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
