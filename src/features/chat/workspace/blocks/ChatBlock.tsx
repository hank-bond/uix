// Renders one transcript item with shared block structure and kind-specific body content.

import { type JSX, memo, type ReactNode } from "react";

import type { TranscriptItem } from "@uix/api/agent-channels";

import { CustomMessageChatBlockBody } from "./CustomMessageChatBlockBody";
import { ErrorChatBlockBody } from "./ErrorChatBlockBody";
import { MessageChatBlockBody } from "./MessageChatBlockBody";
import type { ToolItem, ToolState } from "./tool/call-presentation";
import { toToolState } from "./tool/call-presentation";
import { ToolChatBlockBody } from "./ToolChatBlockBody";
import { isPendingUserId } from "../pending-user-identity";

interface ChatBlockProps {
  item: TranscriptItem;
}

interface ChatBlockRendering {
  className: string;
  state?: ToolState;
  toolName?: string;
  customType?: string;
  label?: string;
  body: ReactNode;
  isUnconfirmed?: boolean;
}

// Reducers preserve object identity for unchanged items, so this boundary keeps
// unrelated Chat state and another item's stream updates out of this subtree.
export const ChatBlock = memo(function ChatBlock({
  item,
}: ChatBlockProps): JSX.Element {
  const rendering = deriveChatBlockRendering(item);

  return (
    <article
      className={`msg msg--${rendering.className}`}
      aria-label={toAccessibleLabel(item.kind)}
      data-chat-block={item.kind}
      data-block-state={rendering.state}
      data-tool-name={rendering.toolName}
      data-custom-type={rendering.customType}
      data-unconfirmed={rendering.isUnconfirmed ? "" : undefined}
    >
      {rendering.label ? (
        <div className="msg__label" data-block-part="label">
          {rendering.label}
          {rendering.state === "running" ? (
            <progress
              className="msg__running-track"
              data-block-part="tool-status"
              aria-label="Tool running"
            />
          ) : null}
        </div>
      ) : null}
      {rendering.state === "success" || rendering.state === "error" ? (
        <span className="visually-hidden" role="status">
          {completionStatus(item.kind, rendering.state)}
        </span>
      ) : null}
      <div className="msg__text" data-block-part="content">
        {rendering.body}
      </div>
    </article>
  );
});

function deriveChatBlockRendering(item: TranscriptItem): ChatBlockRendering {
  switch (item.kind) {
    case "user":
    case "assistant":
      return {
        className: item.kind,
        body: <MessageChatBlockBody item={item} />,
        isUnconfirmed: item.kind === "user" && isPendingUserId(item.id),
      };
    case "tool":
      return deriveToolChatBlockRendering(item);
    case "custom":
      return {
        className: "custom",
        customType: item.customType,
        label: item.customType,
        body: <CustomMessageChatBlockBody item={item} />,
      };
    case "error":
      return {
        className: "error",
        state: "error",
        body: <ErrorChatBlockBody item={item} />,
      };
  }
}

function deriveToolChatBlockRendering(item: ToolItem): ChatBlockRendering {
  const state = toToolState(item);
  return {
    className: state === "error" ? "tool-error" : "tool",
    state,
    toolName: item.toolName,
    body: <ToolChatBlockBody item={item} state={state} />,
  };
}

function completionStatus(
  kind: TranscriptItem["kind"],
  state: "success" | "error",
): string {
  if (kind === "error") return "Agent failed";
  return state === "success" ? "Tool finished" : "Tool failed";
}

function toAccessibleLabel(kind: TranscriptItem["kind"]): string | undefined {
  switch (kind) {
    case "user":
      return "User message";
    case "assistant":
      return "Agent message";
    case "error":
      return "Agent error";
    case "tool":
    case "custom":
      return undefined;
  }
}
