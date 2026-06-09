import type { TranscriptItem } from "../../shared/ipc";

export interface ConversationBlockProps {
  item: TranscriptItem;
}

/**
 * First-pass conversation block dispatch.
 *
 * This intentionally preserves the old markup/classes so the first slice only
 * changes the rendering unit from "string helper" to "React component". The
 * dispatch shape is the seam that later grows exact tool/custom renderers.
 */
export function ConversationBlock({ item }: ConversationBlockProps) {
  switch (item.kind) {
    case "user":
      return (
        <MessageConversationBlock item={item} label="user" className="user" />
      );
    case "assistant":
      return (
        <MessageConversationBlock
          item={item}
          label="assistant"
          className="assistant"
        />
      );
    case "tool":
      return <ToolConversationBlock item={item} />;
    case "custom":
      return <CustomMessageConversationBlock item={item} />;
    case "error":
      return <ErrorConversationBlock item={item} />;
  }
}

function MessageConversationBlock({
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
    <ConversationBlockFrame
      className={className}
      kind={item.kind}
      label={label}
      body={text}
    />
  );
}

function ToolConversationBlock({
  item,
}: {
  item: Extract<TranscriptItem, { kind: "tool" }>;
}) {
  return (
    <ConversationBlockFrame
      className={item.isError ? "tool-error" : "tool"}
      kind="tool"
      state={toToolState(item)}
      toolName={item.toolName}
      label={item.isError ? "tool error" : "tool"}
      body={toToolText(item)}
    />
  );
}

function CustomMessageConversationBlock({
  item,
}: {
  item: Extract<TranscriptItem, { kind: "custom" }>;
}) {
  const body = truncateText(item.content) ?? truncateText(item.details) ?? "";
  return (
    <ConversationBlockFrame
      className="custom"
      kind="custom"
      customType={item.customType}
      label={item.customType}
      body={body}
    />
  );
}

function ErrorConversationBlock({
  item,
}: {
  item: Extract<TranscriptItem, { kind: "error" }>;
}) {
  return (
    <ConversationBlockFrame
      className="error"
      kind="error"
      state="error"
      label="error"
      body={item.message}
    />
  );
}

function ConversationBlockFrame({
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
  body: string;
}) {
  return (
    <div
      className={`msg msg--${className}`}
      data-uix-conversation-block={kind}
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

function toToolText(item: Extract<TranscriptItem, { kind: "tool" }>): string {
  const status = !item.complete
    ? "running"
    : item.isError
      ? "failed"
      : "finished";
  const summary = truncateText(
    !item.complete ? (item.partialResult ?? item.args) : item.result,
  );
  return summary
    ? `${status} ${item.toolName}\n${summary}`
    : `${status} ${item.toolName}`;
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
