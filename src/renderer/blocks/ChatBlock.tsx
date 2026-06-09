import type { ReactNode } from "react";

import type { TranscriptItem } from "../../shared/ipc";

export interface ChatBlockProps {
  item: TranscriptItem;
}

/**
 * First-pass chat block dispatch.
 *
 * This intentionally preserves the old markup/classes so the first slice only
 * changes the rendering unit from "string helper" to "React component". The
 * dispatch shape is the seam that later grows exact tool/custom renderers.
 */
export function ChatBlock({ item }: ChatBlockProps) {
  switch (item.kind) {
    case "user":
      return <MessageChatBlock item={item} label="user" className="user" />;
    case "assistant":
      return (
        <MessageChatBlock item={item} label="assistant" className="assistant" />
      );
    case "tool":
      return <ToolChatBlock item={item} />;
    case "custom":
      return <CustomMessageChatBlock item={item} />;
    case "error":
      return <ErrorChatBlock item={item} />;
  }
}

function MessageChatBlock({
  item,
  label,
  className,
}: {
  item: Extract<TranscriptItem, { kind: "user" | "assistant" }>;
  label: string;
  className: string;
}) {
  const text = item.text || (item.kind === "assistant" ? "…" : "");
  return (
    <ChatBlockFrame
      className={className}
      kind={item.kind}
      label={label}
      body={text}
    />
  );
}

function ToolChatBlock({
  item,
}: {
  item: Extract<TranscriptItem, { kind: "tool" }>;
}) {
  const state = toToolState(item);
  return (
    <ChatBlockFrame
      className={item.isError ? "tool-error" : "tool"}
      kind="tool"
      state={state}
      toolName={item.toolName}
      label={item.isError ? "tool error" : "tool"}
      body={<ToolContent item={item} state={state} />}
    />
  );
}

function CustomMessageChatBlock({
  item,
}: {
  item: Extract<TranscriptItem, { kind: "custom" }>;
}) {
  const body = truncateText(item.content) ?? truncateText(item.details) ?? "";
  return (
    <ChatBlockFrame
      className="custom"
      kind="custom"
      customType={item.customType}
      label={item.customType}
      body={body}
    />
  );
}

function ErrorChatBlock({
  item,
}: {
  item: Extract<TranscriptItem, { kind: "error" }>;
}) {
  return (
    <ChatBlockFrame
      className="error"
      kind="error"
      state="error"
      label="error"
      body={item.message}
    />
  );
}

function ChatBlockFrame({
  className,
  kind,
  state,
  toolName,
  customType,
  label,
  body,
}: {
  className: string;
  kind: TranscriptItem["kind"];
  state?: "running" | "success" | "error";
  toolName?: string;
  customType?: string;
  label: string;
  body: ReactNode;
}) {
  return (
    <div
      className={`msg msg--${className}`}
      data-uix-chat-block={kind}
      data-uix-state={state}
      data-uix-tool-name={toolName}
      data-uix-custom-type={customType}
    >
      <div className="msg__role" data-uix-part="label">
        {label}
      </div>
      <div className="msg__text" data-uix-part="content">
        {body}
      </div>
    </div>
  );
}

function toToolState(
  item: Extract<TranscriptItem, { kind: "tool" }>,
): "running" | "success" | "error" {
  if (!item.complete) return "running";
  return item.isError ? "error" : "success";
}

function ToolContent({
  item,
  state,
}: {
  item: Extract<TranscriptItem, { kind: "tool" }>;
  state: "running" | "success" | "error";
}) {
  const payload = toToolPayloadText(item);
  const args = item.complete ? truncateText(item.args) : undefined;

  return (
    <div className="tool-block" data-uix-part="tool">
      <div className="tool-block__header" data-uix-part="tool-header">
        <span className="tool-block__status" data-uix-part="tool-status">
          {toToolStatusLabel(state)}
        </span>
        <span className="tool-block__name" data-uix-part="tool-name">
          {item.toolName}
        </span>
      </div>
      {payload ? (
        <pre className="tool-block__payload" data-uix-part="tool-payload">
          {payload}
        </pre>
      ) : null}
      {args ? (
        <details className="tool-block__details" data-uix-part="tool-details">
          <summary>arguments</summary>
          <pre>{args}</pre>
        </details>
      ) : null}
    </div>
  );
}

function toToolPayloadText(
  item: Extract<TranscriptItem, { kind: "tool" }>,
): string | undefined {
  return truncateText(
    !item.complete ? (item.partialResult ?? item.args) : item.result,
  );
}

function toToolStatusLabel(state: "running" | "success" | "error"): string {
  switch (state) {
    case "running":
      return "running";
    case "success":
      return "finished";
    case "error":
      return "failed";
  }
}

function truncateText(
  value: unknown,
  charLimit: number = 600,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text =
    typeof value === "string" ? value : JSON.stringify(value, undefined, 2);
  if (!text) return undefined;
  return text.length > charLimit ? `${text.slice(0, charLimit)}…` : text;
}
