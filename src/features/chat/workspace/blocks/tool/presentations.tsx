// Dispatches per-tool expanded content and derives the generic collapsed summary.
//
// The collapsed summary is one renderer for every tool: the catalog label,
// the `reason`/`description` arg styled as the primary field, and the
// remaining args surfaced as `key: value` params (filtered by the per-tool
// `toolParams` visibility settings). Per-tool knowledge is limited to the
// expanded content: which arg keys it consumes as content, and how it renders.

import type { ReactNode } from "react";

import { CanvasToolContent } from "./content/CanvasToolContent";
import { CommandToolContent } from "./content/CommandToolContent";
import { DefaultToolContent } from "./content/DefaultToolContent";
import { FileToolContent } from "./content/FileToolContent";
import type { ToolCallSummary, ToolItem, ToolState } from "./presentation";
import { toToolDescription, toToolParams } from "./presentation";
import {
  type BlockPresentationSettings,
  toolParamVisibility,
} from "../../../shared/settings";

interface ToolContentPolicy {
  /** Arg keys consumed as expanded content, never surfaced as params. */
  contentArgs: readonly string[];
  part: string;
  render: (props: { item: ToolItem; state: ToolState }) => ReactNode;
}

export interface ToolChatBlockPresentation {
  summary: ToolCallSummary;
  part: string;
  content: ReactNode;
}

// Every known tool family renders its expanded content through the shared
// disclosure frame (owned by ToolChatBlock). Only the content is custom.
const contentPolicyByToolName: ReadonlyMap<string, ToolContentPolicy> = new Map(
  [
    [
      "canvas__anchor_read",
      {
        contentArgs: ["payload"],
        part: "canvas-tool",
        render: ({ item }) => <CanvasToolContent item={item} />,
      },
    ],
    [
      "canvas__anchor_write",
      {
        contentArgs: ["payload"],
        part: "canvas-tool",
        render: ({ item }) => <CanvasToolContent item={item} />,
      },
    ],
    [
      "canvas__anchor_edit",
      {
        contentArgs: ["payload"],
        part: "canvas-tool",
        render: ({ item }) => <CanvasToolContent item={item} />,
      },
    ],
    [
      "read",
      {
        contentArgs: [],
        part: "file-tool",
        render: ({ item }) => <FileToolContent item={item} />,
      },
    ],
    [
      "write",
      {
        contentArgs: ["content"],
        part: "file-tool",
        render: ({ item }) => <FileToolContent item={item} />,
      },
    ],
    [
      "command",
      {
        contentArgs: [],
        part: "command-tool",
        render: ({ item }) => <CommandToolContent item={item} />,
      },
    ],
  ],
);

export function deriveToolChatBlockPresentation(
  item: ToolItem,
  state: ToolState,
  label: string,
  settings: BlockPresentationSettings,
): ToolChatBlockPresentation {
  const policy = contentPolicyByToolName.get(item.toolName);
  const params = toToolParams(item.args, policy?.contentArgs);
  const visibility = toolParamVisibility(settings, item.toolName);
  const collapsedKeys = visibility?.collapsed;
  const collapsedParams =
    collapsedKeys === undefined
      ? params
      : params.filter((param) => collapsedKeys.includes(param.key));
  const collapsedKeysSet = new Set(collapsedParams.map((param) => param.key));
  const expandedParams = params.filter(
    (param) => !collapsedKeysSet.has(param.key),
  );

  return {
    summary: {
      label,
      description: toToolDescription(item.args),
      surfaceableParams: params,
      collapsedParams,
      expandedParams,
    },
    part: policy?.part ?? "tool",
    content: policy ? (
      policy.render({ item, state })
    ) : (
      <DefaultToolContent item={item} />
    ),
  };
}
