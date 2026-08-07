// Derives per-tool chat block presentations: labels and content for known tool names.

import type { ReactNode } from "react";

import {
  CanvasToolContent,
  tryParseCanvasToolPresentation,
} from "./content/CanvasToolContent";
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
  derivePresentation: (
    props: ToolChatBlockPresentationPolicyProps,
  ) => ToolChatBlockPresentation;
}

// Every known tool family parses a human reason (and where applicable a
// target) from its args once, then renders through the shared disclosure
// frame. Calls without a compatible parse fall back to the default payload
// row with a frame label.
const policyByToolName: ReadonlyMap<string, ToolChatBlockPresentationPolicy> =
  new Map([
    [
      "canvas__anchor_read",
      disclosurePolicy({
        displayName: "Read Canvas",
        tryParse: tryParseCanvasToolPresentation,
        render: ({ item, state, presentation }) => (
          <CanvasToolContent
            item={item}
            state={state}
            presentation={presentation}
          />
        ),
      }),
    ],
    [
      "canvas__anchor_write",
      disclosurePolicy({
        displayName: "Write Canvas",
        tryParse: tryParseCanvasToolPresentation,
        render: ({ item, state, presentation }) => (
          <CanvasToolContent
            item={item}
            state={state}
            presentation={presentation}
          />
        ),
      }),
    ],
    [
      "canvas__anchor_edit",
      disclosurePolicy({
        displayName: "Edit Canvas",
        tryParse: tryParseCanvasToolPresentation,
        render: ({ item, state, presentation }) => (
          <CanvasToolContent
            item={item}
            state={state}
            presentation={presentation}
          />
        ),
      }),
    ],
    [
      "read",
      disclosurePolicy({
        displayName: "read",
        tryParse: tryParseFileToolPresentation,
        render: ({ item, state, presentation }) => (
          <FileToolContent
            item={item}
            state={state}
            presentation={presentation}
          />
        ),
      }),
    ],
    [
      "write",
      disclosurePolicy({
        displayName: "write",
        tryParse: tryParseFileToolPresentation,
        render: ({ item, state, presentation }) => (
          <FileToolContent
            item={item}
            state={state}
            presentation={presentation}
          />
        ),
      }),
    ],
    [
      "command",
      disclosurePolicy({
        displayName: "command",
        tryParse: tryParseCommandToolPresentation,
        render: ({ item, state, presentation }) => (
          <CommandToolContent
            item={item}
            state={state}
            presentation={presentation}
          />
        ),
      }),
    ],
  ]);

function disclosurePolicy<Presentation>(options: {
  displayName: string;
  tryParse: (item: ToolItem) => Presentation | undefined;
  render: (
    props: ToolChatBlockPresentationPolicyProps & {
      presentation: Presentation;
    },
  ) => ReactNode;
}): ToolChatBlockPresentationPolicy {
  return {
    displayName: options.displayName,
    derivePresentation: ({ item, state }) => {
      const presentation = options.tryParse(item);
      return presentation === undefined
        ? fallbackPresentation(item, options.displayName, state)
        : { content: options.render({ item, state, presentation }) };
    },
  };
}

function fallbackPresentation(
  item: ToolItem,
  displayName: string,
  state: ToolState,
): ToolChatBlockPresentation {
  return {
    label: (
      <>
        tool: <span data-uix-part="tool-name">{displayName}</span>
        {state === "error" ? " (error)" : ""}
      </>
    ),
    content: <DefaultToolContent item={item} />,
  };
}

export function deriveToolChatBlockPresentation(
  item: ToolItem,
  state: ToolState,
): ToolChatBlockPresentation {
  const policy = policyByToolName.get(item.toolName);
  if (policy) return policy.derivePresentation({ item, state });
  return fallbackPresentation(item, toToolDisplayName(item.toolName), state);
}
