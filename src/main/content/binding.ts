// UIX cockpit — anchored canvas agent binding.
//
// The agent reads, clobbers, and range-edits canvases by key through these
// tools, always in the anchored §-gutter wire format, and gets fresh anchors
// back in every result so it never re-reads to learn current anchors. Content
// is canonicalized at the core boundary and the local file store is hidden
// behind the content-store seam (see ./content-store.ts, ./channel.ts).
//
// Every HTML document edited here is a canvas, so these tools are canvas-named;
// the general document/content abstraction lives underneath in DocumentChannel
// and ContentStore (a later case-2 surface could store non-HTML state docs
// there without HTML canonicalization).

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";

import { assertCanvasKey, CanvasKeyDescription } from "../../shared/canvas";
import type { AgentBinding } from "../agent/bindings";
import type { StateMessages } from "../agent/state-messages";
import type { AnchoredChange } from "../anchors/document";
import { formatAnchoredText, parseAnchoredLine } from "../anchors/wire";

import { createLogger } from "../log";

import { DocumentChannel } from "./channel";
import type { ContentStore } from "./content-store";

const keyDescription = `Canvas key (not a filesystem path): ${CanvasKeyDescription}, e.g. main or reports/security-review.`;

const readParams = Type.Object({
  key: Type.String({ description: keyDescription }),
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
  key: Type.String({ description: keyDescription }),
  html: Type.String({
    description:
      "Full authored HTML document. Write one block-level element per line so later edits can address fine-grained anchors.",
  }),
});

const editParams = Type.Object({
  key: Type.String({ description: keyDescription }),
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

type ReadParams = Static<typeof readParams>;
type WriteParams = Static<typeof writeParams>;
type EditParams = Static<typeof editParams>;

interface CanvasAgentBindingOptions {
  onCanvasChanged: (key: string) => void;
}

// The canvas subsection's agent binding: handed the live pi handle, it
// registers its content tools and declares its state messages. Turn context
// rides state messages, not an "input" transform — pi persists transformed
// text as the user's own entry, so a transform would put cockpit context
// inside the human's message (see src/main/agent/state-messages.ts).
export function createCanvasAgentBinding(
  opts: CanvasAgentBindingOptions,
  store: ContentStore,
  openCanvasKeys: readonly string[],
  stateMessages: StateMessages,
): AgentBinding {
  const channel = new DocumentChannel(store);

  // Change-only: the open set is re-announced only when it differs from the
  // last persisted report on the branch. Today the keys are fixed at startup,
  // so this one emit is the whole signal; the pane host will re-emit on
  // open/close when panes become dynamic.
  stateMessages.register({
    customType: "uix.pane-visibility",
    description:
      'JSON `{"canvases_open": [...]}` — the canvas keys currently open in the pane. Sent only when the set changes. Keys are not filesystem paths; read contents with uix_canvas_read when relevant.',
    schema: Type.Object({ canvases_open: Type.Array(Type.String()) }),
    policy: "change-only",
  });
  stateMessages.emit("uix.pane-visibility", {
    canvases_open: [...openCanvasKeys].sort(),
  });

  // Human-writeback diff: anchored hunks for canvases the agent has touched,
  // edited by the human since its last turn. consumeChanges() is the single
  // consuming read (canvas-data-channel log 2026-06-06), so this computes at
  // the turn boundary rather than emitting ahead of it.
  stateMessages.register({
    customType: "uix.canvas-diff",
    description:
      "anchored hunks the human edited in open canvases since your last turn, grouped by `## <canvas key>`. The anchors shown are current.",
    atTurnBoundary: async () => {
      const changes = await channel.consumeChanges();
      if (changes.size === 0) return undefined;
      const content = formatCanvasChanges(changes);
      // Human edits are conversation content (level policy: chat-visible is
      // info), even though the message itself is display-hidden.
      createLogger("canvas").info({ diff: content }, "canvas_diff");
      return {
        content,
        details: { changes: Object.fromEntries(changes) },
      };
    },
  });

  return (pi) => {
    pi.registerTool(createReadTool(channel));
    pi.registerTool(createWriteTool(channel, opts));
    pi.registerTool(createEditTool(channel, opts));
  };
}

function createReadTool(
  channel: DocumentChannel,
): ToolDefinition<typeof readParams> {
  return {
    name: "uix_canvas_read",
    label: "read canvas",
    description:
      "Read a UIX canvas as anchored lines (`<anchor>§<text>`). Each line is addressable by its anchor in uix_canvas_edit. The key is not a filesystem path.",
    promptSnippet: "Read a UIX canvas as anchored lines.",
    parameters: readParams,
    async execute(_toolCallId, params: ReadParams) {
      assertCanvasKey(params.key);
      const lines = await channel.read(params.key, params.start, params.end);
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
  channel: DocumentChannel,
  opts: CanvasAgentBindingOptions,
): ToolDefinition<typeof writeParams> {
  return {
    name: "uix_canvas_write",
    label: "write canvas",
    description:
      "Replace a UIX canvas with a full authored HTML body and get anchored lines back. Use this and uix_canvas_edit, not filesystem tools, for UIX canvases.",
    promptSnippet: "Replace a UIX canvas with full authored HTML.",
    promptGuidelines: [
      "Use uix_canvas_write/uix_canvas_edit, not filesystem tools, when creating or updating UIX canvases.",
      "Write one block-level element per line so edits address fine-grained anchors.",
      "Canvas keys are lowercase slug segments separated by /, such as main or reports/security-review.",
    ],
    parameters: writeParams,
    executionMode: "sequential",
    async execute(_toolCallId, params: WriteParams) {
      assertCanvasKey(params.key);
      const lines = await channel.write(params.key, params.html);
      opts.onCanvasChanged(params.key);
      return {
        content: [{ type: "text", text: formatAnchoredText(lines) }],
        details: {},
      };
    },
  };
}

function createEditTool(
  channel: DocumentChannel,
  opts: CanvasAgentBindingOptions,
): ToolDefinition<typeof editParams> {
  return {
    name: "uix_canvas_edit",
    label: "edit canvas",
    description:
      "Replace an inclusive anchor range in a UIX canvas. Boundaries are full `<anchor>§<text>` lines from a previous result; the live lines must still match. Returns fresh anchors for the changed lines.",
    promptSnippet: "Replace an anchor range in a UIX canvas.",
    parameters: editParams,
    executionMode: "sequential",
    async execute(_toolCallId, params: EditParams) {
      assertCanvasKey(params.key);
      const changes = await channel.edit(params.key, {
        start: parseAnchoredLine(params.start_line),
        end: parseAnchoredLine(params.end_line),
        replacement: params.replacement,
      });
      opts.onCanvasChanged(params.key);
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

function formatChangeHunks(
  label: string,
  changes: readonly AnchoredChange[],
): string {
  const removed = changes.flatMap((change) => change.oldLines);
  const added = changes.flatMap((change) => change.newLines);
  const header = `${label} (−${removed.length}/+${added.length})`;
  return added.length ? `${header}\n${formatAnchoredText(added)}` : header;
}

// Section body only — the state-message substrate owns the <canvas-diff>
// tag and the <uix-state> envelope around it.
function formatCanvasChanges(
  changes: ReadonlyMap<string, readonly AnchoredChange[]>,
): string {
  const sections: string[] = [];
  for (const [key, hunks] of changes) {
    sections.push(formatChangeHunks(`## ${key}`, hunks));
  }
  return sections.join("\n\n");
}
