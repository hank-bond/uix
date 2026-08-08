// Renders a tool chat block from its tool-state presentation.

import type { JSX } from "react";

import { useBlockPresentationSettings } from "./BlockPresentationSettings";
import { ChatBlockFrame } from "./ChatBlockFrame";
import { ToolBlockSettings } from "./tool/content/ToolBlockSettings";
import { ToolCallDisclosure } from "./tool/content/ToolCallDisclosure";
import type { ToolItem } from "./tool/presentation";
import { toToolState } from "./tool/presentation";
import { deriveToolChatBlockPresentation } from "./tool/presentations";
import { useToolLabel } from "./tool/tool-catalog";

export function ToolChatBlock({ item }: { item: ToolItem }): JSX.Element {
  const state = toToolState(item);
  const { settings } = useBlockPresentationSettings();
  const label = useToolLabel(item.toolName);
  const presentation = deriveToolChatBlockPresentation(
    item,
    state,
    label,
    settings,
  );
  const { summary } = presentation;
  const allParams = summary.surfaceableParams;

  return (
    <ChatBlockFrame
      className={state === "error" ? "tool-error" : "tool"}
      kind="tool"
      state={state}
      toolName={item.toolName}
      body={
        <div className="tool-block">
          <ToolCallDisclosure
            label={summary.label}
            description={summary.description}
            params={summary.collapsedParams}
            expandedParams={summary.expandedParams}
            state={state}
            part={presentation.part}
            actions={
              allParams.length ? (
                <ToolBlockSettings
                  toolName={item.toolName}
                  label={summary.label}
                  params={allParams}
                />
              ) : undefined
            }
          >
            {presentation.content}
          </ToolCallDisclosure>
        </div>
      }
    />
  );
}
