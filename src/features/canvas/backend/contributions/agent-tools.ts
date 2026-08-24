// Canvas agent tool contributions.
//
// The agent reads, clobbers, and range-edits canvases by key through these
// tools, always in the anchored §-gutter wire format, and gets fresh anchors
// back in every result so it never re-reads to learn current anchors. The
// The document buffer canonicalizes content at the core boundary and hides
// persistence behind the document-store seam.
//
// Every HTML document edited here is a canvas, so these tools are canvas-named;
// CanvasDocumentBuffer and DocumentStore provide the document storage beneath
// the tool boundary.

import { Type } from "typebox";

import type {
  AgentToolContribution,
  AgentToolDefinition,
} from "@uix/api/agent-tools";

import { publishCanvasChanged } from "./channels";
import { CanvasKeyDescription, CanvasKeySchema } from "../../shared/addressing";
import { formatChangeHunks } from "../anchored-format";
import {
  ANCHOR_GUTTER_DELIMITER,
  formatAnchoredText,
  parseAnchoredLine,
} from "../anchors/wire";
import type { CanvasContext } from "../context";

const keyDescription = `Canvas key (not a filesystem path): ${CanvasKeyDescription}, e.g. main or reports/security-review.`;
const CanvasKeyToolParamSchema = {
  ...CanvasKeySchema,
  description: keyDescription,
} as typeof CanvasKeySchema;

const ReasonSchema = Type.String({
  description:
    "One concise sentence in layman's terms explaining why this operation is useful for the current task. This enables less-technical users to follow your thought process and understand why certain actions are being made.",
});

const readParams = Type.Object({
  key: CanvasKeyToolParamSchema,
  reason: ReasonSchema,
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
  reason: ReasonSchema,
  html: Type.String({
    description:
      "Full authored HTML document. Write one block-level element per line so later edits can address fine-grained anchors.",
  }),
});

const editParams = Type.Object({
  key: CanvasKeyToolParamSchema,
  reason: ReasonSchema,
  start_line: Type.String({
    description:
      "First line of the inclusive range to replace, as the full `<anchor>§<text>` line from a previous result. The live line must still match.",
  }),
  end_line: Type.String({
    description:
      "Last line of the inclusive range, same `<anchor>§<text>` form (equal to start_line to replace a single line).",
  }),
  html: Type.String({
    description:
      "Raw HTML that replaces the range. Never include anchor names or the `§` delimiter. To keep a line, copy only the text after `§`. An empty string deletes the range.",
  }),
});

// The wire format never belongs in authored content. Reject a leading anchor
// and gutter delimiter here, while allowing a delimiter deeper in the HTML.
// The buffer separately rejects replacement lines equal to current anchors.
function assertReplacementHasNoGutter(html: string): void {
  const leaked = html.split("\n").find((line) => {
    const delimiterIndex = line.indexOf(ANCHOR_GUTTER_DELIMITER);
    return (
      delimiterIndex > 0 && /^[A-Za-z]+$/.test(line.slice(0, delimiterIndex))
    );
  });
  if (leaked !== undefined) {
    throw new Error(
      `Replacement html line starts with an anchor and the gutter delimiter: ${JSON.stringify(
        leaked,
      )}. Copy only the text after the delimiter, never the anchor or the delimiter.`,
    );
  }
}

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
      "Read a canvas as anchored lines (`<anchor>§<text>`). Each line is addressable by its anchor in canvas__anchor_edit. The key is not a filesystem path. Include a concise reason so the human can understand why the canvas is being read.",
    promptSnippet: "Read a canvas as anchored lines.",
    parameters: readParams,
    async execute(_toolCallId, { reason: _reason, ...params }) {
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
      "Replace a canvas with a full authored HTML body and get anchored lines back. Use this and canvas__anchor_edit, not filesystem tools, for canvases. Include a concise reason so the human can understand why the canvas is being written.",
    promptSnippet: "Replace a canvas with full authored HTML.",
    promptGuidelines: [
      "Use canvas__anchor_write/canvas__anchor_edit, not filesystem tools, when creating or updating canvases.",
      "Write one block-level element per line so edits address fine-grained anchors.",
      "Canvas keys are lowercase slug segments separated by /, such as main or reports/security-review.",
    ],
    parameters: writeParams,
    executionMode: "sequential",
    async execute(_toolCallId, { reason: _reason, ...params }) {
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
      "Replace an inclusive anchor range in a canvas. Boundaries are full `<anchor>§<text>` lines from a previous result; the live lines must still match. `html` holds only authored content, never an anchored line. Returns fresh anchors for the changed lines. Include a concise reason so the human can understand why the canvas is being edited.",
    promptSnippet: "Replace an anchor range in a canvas.",
    promptGuidelines: [
      "Copy start_line and end_line verbatim from a previous read result.",
      "Put only authored HTML in `html`. Never include anchor names or the `§` delimiter; copy only the text after `§` when you keep a line.",
    ],
    parameters: editParams,
    executionMode: "sequential",
    async execute(_toolCallId, { reason: _reason, ...params }) {
      assertReplacementHasNoGutter(params.html);
      const changes = await ctx.buffer.edit(params.key, {
        start: parseAnchoredLine(params.start_line),
        end: parseAnchoredLine(params.end_line),
        replacement: params.html,
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
