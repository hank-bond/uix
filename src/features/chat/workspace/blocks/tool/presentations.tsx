// Derives per-tool chat block presentations: labels and content for known tool names.

import type { ReactNode } from "react";

import { CanvasToolContent } from "./content/CanvasToolContent";
import {
  CommandToolContent,
  tryParseCommandToolPresentation,
} from "./content/CommandToolContent";
import { DefaultToolContent } from "./content/DefaultToolContent";
import {
  FileToolContent,
  tryParseFileToolPresentation,
} from "./content/FileToolContent";
import type {
  ToolChatBlockPresentation,
  ToolItem,
  ToolState,
} from "./presentation";
import { toToolDisplayName } from "./presentation";

interface ToolChatBlockPresentationPolicyProps {
  item: ToolItem;
  state: ToolState;
}

interface ToolChatBlockPresentationPolicy {
  displayName: string;
  hideFrameLabel?: (props: ToolChatBlockPresentationPolicyProps) => boolean;
  deriveContent: (props: ToolChatBlockPresentationPolicyProps) => ReactNode;
}

const policyByToolName: ReadonlyMap<string, ToolChatBlockPresentationPolicy> =
  new Map([
    [
      "canvas__anchor_read",
      {
        displayName: "Read Canvas",
        deriveContent: ({ item }) => <CanvasToolContent item={item} />,
      },
    ],
    [
      "canvas__anchor_write",
      {
        displayName: "Write Canvas",
        deriveContent: ({ item }) => <CanvasToolContent item={item} />,
      },
    ],
    [
      "canvas__anchor_edit",
      {
        displayName: "Edit Canvas",
        deriveContent: ({ item }) => <CanvasToolContent item={item} />,
      },
    ],
    [
      "read",
      {
        displayName: "read",
        hideFrameLabel: ({ item }) =>
          tryParseFileToolPresentation(item) !== undefined,
        deriveContent: ({ item, state }) => (
          <FileToolContent item={item} state={state} />
        ),
      },
    ],
    [
      "write",
      {
        displayName: "write",
        hideFrameLabel: ({ item }) =>
          tryParseFileToolPresentation(item) !== undefined,
        deriveContent: ({ item, state }) => (
          <FileToolContent item={item} state={state} />
        ),
      },
    ],
    [
      "command",
      {
        displayName: "command",
        hideFrameLabel: ({ item }) =>
          tryParseCommandToolPresentation(item) !== undefined,
        deriveContent: ({ item, state }) => (
          <CommandToolContent item={item} state={state} />
        ),
      },
    ],
  ]);

export function deriveToolChatBlockPresentation(
  item: ToolItem,
  state: ToolState,
): ToolChatBlockPresentation {
  const policy = policyByToolName.get(item.toolName);
  const displayName = policy?.displayName ?? toToolDisplayName(item.toolName);
  const hideFrameLabel = policy?.hideFrameLabel?.({ item, state }) ?? false;
  const label = hideFrameLabel ? undefined : (
    <>
      tool: <span data-uix-part="tool-name">{displayName}</span>
      {state === "error" ? " (error)" : ""}
    </>
  );

  return {
    label,
    content: policy ? (
      policy.deriveContent({ item, state })
    ) : (
      <DefaultToolContent item={item} />
    ),
  };
}
