// canvas agent tool contributions.
//
// The agent reads, clobbers, and range-edits canvases by key through these
// tools, always in the anchored §-gutter wire format, and gets fresh anchors
// back in every result so it never re-reads to learn current anchors. Content
// is canonicalized at the core boundary and the local file store is hidden
// behind the document-store seam (see ../../documents/store.ts and
// ../document-buffer.ts).
//
// Every HTML document edited here is a canvas, so these tools are canvas-named;
// the canvas document runtime lives underneath in CanvasDocumentBuffer and
// DocumentStore (a later case-2 surface could store non-HTML state docs there
// with its own purpose-specific buffer).

import { Type } from "typebox";

import { CanvasKeyDescription, CanvasKeySchema } from "../../shared/addressing";
import type {
  AgentToolContribution,
  AgentToolDefinition,
} from "@uix/api/agent-tools";
import { formatAnchoredText, parseAnchoredLine } from "../anchors/wire";
import type { CanvasContext } from "../context";

import { formatChangeHunks } from "../anchored-format";

import { publishCanvasChanged } from "./channels";

const keyDescription = `Canvas key (not a filesystem path): ${CanvasKeyDescription}, e.g. main or reports/security-review.`;
const CanvasKeyToolParamSchema = {
  ...CanvasKeySchema,
  description: keyDescription,
} as typeof CanvasKeySchema;

const readParams = Type.Object({
  key: CanvasKeyToolParamSchema,
  start: Type.Optional(
    Type.Integer({
      description:
        "First line of a slice (0-based, inclusive). Omit to read from the start.",
    }),
  ),
  end: Type.Optional(
    Type.Integer({
      description:
        "End line of a slice (0-based, exclusive). Omit to read to the end.",
    }),
  ),
});

const writeParams = Type.Object({
  key: CanvasKeyToolParamSchema,
  html: Type.String({
    description:
      "Full authored HTML document. Write one block-level element per line so later edits can address fine-grained anchors.",
  }),
});

const editParams = Type.Object({
  key: CanvasKeyToolParamSchema,
  start_line: Type.String({
    description:
      "First line of the inclusive range to replace, as the full `<anchor>§<text>` line from a previous result. The live line must still match.",
  }),
  end_line: Type.String({
    description:
      "Last line of the inclusive range, same `<anchor>§<text>` form (equal to start_line to replace a single line).",
  }),
  replacement: Type.String({
    description:
      "New content for the range (the line(s) only, no anchors). Express an insertion by including the retained line(s) plus the new one(s).",
  }),
});

export function createCanvasAgentToolContributions(
  ctx: CanvasContext,
): readonly AgentToolContribution[] {
  return [
    { name: "anchor_read", tool: createReadTool(ctx) },
    { name: "anchor_write", tool: createWriteTool(ctx) },
    { name: "anchor_edit", tool: createEditTool(ctx) },
  ];
}

function createReadTool(
  ctx: CanvasContext,
): AgentToolDefinition<typeof readParams> {
  return {
    label: "read canvas",
    description:
      "Read a canvas as anchored lines (`<anchor>§<text>`). Each line is addressable by its anchor in canvas__anchor_edit. The key is not a filesystem path.",
    promptSnippet: "Read a canvas as anchored lines.",
    parameters: readParams,
    // `params: ReadParams` is inferred from `AgentToolDefinition<typeof readParams>`
    // — no hand-annotation needed; the factory return type carries the schema.
    async execute(_toolCallId, params) {
      const lines = await ctx.buffer.read(params.key, params.start, params.end);
      return {
        content: [
          {
            type: "text",
            text: lines.length
              ? formatAnchoredText(lines)
              : `Empty canvas: ${params.key}`,
          },
        ],
        details: {},
      };
    },
  };
}

function createWriteTool(
  ctx: CanvasContext,
): AgentToolDefinition<typeof writeParams> {
  return {
    label: "write canvas",
    description:
      "Replace a canvas with a full authored HTML body and get anchored lines back. Use this and canvas__anchor_edit, not filesystem tools, for canvases.",
    promptSnippet: "Replace a canvas with full authored HTML.",
    promptGuidelines: [
      "Use canvas__anchor_write/canvas__anchor_edit, not filesystem tools, when creating or updating canvases.",
      "Write one block-level element per line so edits address fine-grained anchors.",
      "Canvas keys are lowercase slug segments separated by /, such as main or reports/security-review.",
    ],
    parameters: writeParams,
    executionMode: "sequential",
    async execute(_toolCallId, params) {
      const lines = await ctx.buffer.write(params.key, params.html);
      publishCanvasChanged(ctx, params.key);
      return {
        content: [{ type: "text", text: formatAnchoredText(lines) }],
        details: {},
      };
    },
  };
}

function createEditTool(
  ctx: CanvasContext,
): AgentToolDefinition<typeof editParams> {
  return {
    label: "edit canvas",
    description:
      "Replace an inclusive anchor range in a canvas. Boundaries are full `<anchor>§<text>` lines from a previous result; the live lines must still match. Returns fresh anchors for the changed lines.",
    promptSnippet: "Replace an anchor range in a canvas.",
    parameters: editParams,
    executionMode: "sequential",
    async execute(_toolCallId, params) {
      const changes = await ctx.buffer.edit(params.key, {
        start: parseAnchoredLine(params.start_line),
        end: parseAnchoredLine(params.end_line),
        replacement: params.replacement,
      });
      publishCanvasChanged(ctx, params.key);
      return {
        content: [
          {
            type: "text",
            text: formatChangeHunks(`Edited ${params.key}`, changes),
          },
        ],
        details: {},
      };
    },
  };
}
