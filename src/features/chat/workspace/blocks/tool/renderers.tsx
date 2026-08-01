import { CanvasToolContent } from "./content/CanvasToolContent";
import {
  CommandToolContent,
  tryParseCommandToolPresentation,
} from "./content/CommandToolContent";
import { FileToolContent } from "./content/FileToolContent";
import type { ToolChatRenderer } from "./rendering";

const rendererByToolName: ReadonlyMap<string, ToolChatRenderer> = new Map([
  [
    "canvas__anchor_read",
    {
      displayName: "Read Canvas",
      render: ({ item }) => <CanvasToolContent item={item} />,
    },
  ],
  [
    "canvas__anchor_write",
    {
      displayName: "Write Canvas",
      render: ({ item }) => <CanvasToolContent item={item} />,
    },
  ],
  [
    "canvas__anchor_edit",
    {
      displayName: "Edit Canvas",
      render: ({ item }) => <CanvasToolContent item={item} />,
    },
  ],
  [
    "read",
    {
      displayName: "read",
      render: ({ item }) => <FileToolContent item={item} />,
    },
  ],
  [
    "write",
    {
      displayName: "write",
      render: ({ item }) => <FileToolContent item={item} />,
    },
  ],
  [
    "command",
    {
      displayName: "command",
      renderLabel: ({ item }) => {
        const presentation = tryParseCommandToolPresentation(item);
        return presentation ? (
          <>
            command:{" "}
            <span data-uix-part="tool-reason">{presentation.reason}</span>
          </>
        ) : undefined;
      },
      render: ({ item }) => <CommandToolContent item={item} />,
    },
  ],
]);

export function getToolChatRenderer(
  toolName: string,
): ToolChatRenderer | undefined {
  return rendererByToolName.get(toolName);
}
