import type { ReactNode } from "react";

import { CanvasToolContent } from "./content/CanvasToolContent";
import {
  CommandToolContent,
  tryParseCommandToolPresentation,
} from "./content/CommandToolContent";
import { DefaultToolContent } from "./content/DefaultToolContent";
import { FileToolContent } from "./content/FileToolContent";
import type {
  ToolChatBlockPresentation,
  ToolItem,
  ToolState,
} from "./presentation";
import { toToolDisplayName } from "./presentation";

interface ToolChatBlockPresentationPolicyProps {
  item: ToolItem;
}

interface ToolChatBlockPresentationPolicy {
  displayName: string;
  deriveLabel?: (props: ToolChatBlockPresentationPolicyProps) => ReactNode;
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
        deriveContent: ({ item }) => <FileToolContent item={item} />,
      },
    ],
    [
      "write",
      {
        displayName: "write",
        deriveContent: ({ item }) => <FileToolContent item={item} />,
      },
    ],
    [
      "command",
      {
        displayName: "command",
        deriveLabel: ({ item }) => {
          const presentation = tryParseCommandToolPresentation(item);
          return presentation ? (
            <>
              command:{" "}
              <span data-uix-part="tool-reason">{presentation.reason}</span>
            </>
          ) : undefined;
        },
        deriveContent: ({ item }) => <CommandToolContent item={item} />,
      },
    ],
  ]);

export function deriveToolChatBlockPresentation(
  item: ToolItem,
  state: ToolState,
): ToolChatBlockPresentation {
  const policy = policyByToolName.get(item.toolName);
  const displayName = policy?.displayName ?? toToolDisplayName(item.toolName);
  const label = policy?.deriveLabel?.({ item }) ?? (
    <>
      tool: <span data-uix-part="tool-name">{displayName}</span>
    </>
  );

  return {
    label: (
      <>
        {label}
        {state === "error" ? " (error)" : ""}
      </>
    ),
    content: policy ? (
      policy.deriveContent({ item })
    ) : (
      <DefaultToolContent item={item} />
    ),
  };
}
