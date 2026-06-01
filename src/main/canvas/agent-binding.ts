// UIX cockpit — canvas binding for the UIX-owned agent session.
//
// The agent addresses canvases by key through these tools. The local file store
// is an implementation detail hidden behind readCanvas/writeCanvas.

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";

import { assertCanvasKey } from "../../shared/canvas";
import type { AgentBinding } from "../agent/bindings";

import { readCanvas, writeCanvas } from "./store";

const readParams = Type.Object({
  key: Type.String({
    description:
      "Canvas key: lowercase slug segments [a-z0-9-]+ optionally separated by /, e.g. main or reports/security-review.",
  }),
});

const writeParams = Type.Object({
  key: Type.String({
    description:
      "Canvas key: lowercase slug segments [a-z0-9-]+ optionally separated by /, e.g. main or reports/security-review.",
  }),
  html: Type.String({
    description: "Full authored HTML document to store for this canvas key.",
  }),
});

type ReadParams = Static<typeof readParams>;
type WriteParams = Static<typeof writeParams>;

interface CanvasAgentBindingOptions {
  onCanvasChanged: (key: string) => void;
}

export function createCanvasAgentBinding(
  opts: CanvasAgentBindingOptions,
): AgentBinding {
  return {
    tools: [createReadTool(), createWriteTool(opts)],
  };
}

function createReadTool(): ToolDefinition<typeof readParams> {
  return {
    name: "uix_canvas_read",
    label: "read canvas",
    description:
      "Read the raw authored HTML for a UIX canvas key. The key is not a filesystem path.",
    promptSnippet: "Read raw authored HTML for a UIX canvas key.",
    parameters: readParams,
    async execute(_toolCallId, params: ReadParams) {
      assertCanvasKey(params.key);
      const html = await readCanvas(params.key);
      return {
        content: [
          {
            type: "text",
            text: html ?? `Canvas not found: ${params.key}`,
          },
        ],
        details: {},
      };
    },
  };
}

function createWriteTool(
  opts: CanvasAgentBindingOptions,
): ToolDefinition<typeof writeParams> {
  return {
    name: "uix_canvas_write",
    label: "write canvas",
    description:
      "Write a full authored HTML document to a UIX canvas key. The key is not a filesystem path; UIX stores and serves it through its canvas store.",
    promptSnippet: "Write authored HTML to a UIX canvas key.",
    promptGuidelines: [
      "Use uix_canvas_write, not filesystem tools, when creating or updating UIX canvas content.",
      "Canvas keys are lowercase slug segments separated by /, such as main or reports/security-review.",
    ],
    parameters: writeParams,
    executionMode: "sequential",
    async execute(_toolCallId, params: WriteParams) {
      assertCanvasKey(params.key);
      await writeCanvas(params.key, params.html);
      opts.onCanvasChanged(params.key);
      return {
        content: [{ type: "text", text: `Wrote canvas: ${params.key}` }],
        details: {},
      };
    },
  };
}
