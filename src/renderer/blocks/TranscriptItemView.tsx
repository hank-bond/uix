import type { TranscriptItem } from "../../shared/ipc";

export interface TranscriptItemViewProps {
  item: TranscriptItem;
}

/**
 * First-pass transcript item dispatch.
 *
 * This intentionally preserves the old markup/classes so the first slice only
 * changes the rendering unit from "string helper" to "React component". The
 * dispatch shape is the seam that later grows exact tool/custom renderers.
 */
export function TranscriptItemView({ item }: TranscriptItemViewProps) {
  switch (item.kind) {
    case "user":
      return <MessageItemView item={item} label="user" className="user" />;
    case "assistant":
      return (
        <MessageItemView item={item} label="assistant" className="assistant" />
      );
    case "tool":
      return <ToolItemView item={item} />;
    case "custom":
      return <CustomMessageItemView item={item} />;
    case "error":
      return <ErrorItemView item={item} />;
  }
}

function MessageItemView({
  item,
  label,
  className,
}: {
  item: Extract<TranscriptItem, { kind: "user" | "assistant" }>;
  label: string;
  className: string;
}) {
  const text = item.text || (item.kind === "assistant" ? "…" : "");
  return <TranscriptRow className={className} label={label} body={text} />;
}

function ToolItemView({
  item,
}: {
  item: Extract<TranscriptItem, { kind: "tool" }>;
}) {
  return (
    <TranscriptRow
      className={item.isError ? "tool-error" : "tool"}
      label={item.isError ? "tool error" : "tool"}
      body={toToolText(item)}
    />
  );
}

function CustomMessageItemView({
  item,
}: {
  item: Extract<TranscriptItem, { kind: "custom" }>;
}) {
  const body = truncateText(item.content) ?? truncateText(item.details) ?? "";
  return (
    <TranscriptRow className="custom" label={item.customType} body={body} />
  );
}

function ErrorItemView({
  item,
}: {
  item: Extract<TranscriptItem, { kind: "error" }>;
}) {
  return <TranscriptRow className="error" label="error" body={item.message} />;
}

function TranscriptRow({
  className,
  label,
  body,
}: {
  className: string;
  label: string;
  body: string;
}) {
  return (
    <div className={`msg msg--${className}`}>
      <div className="msg__role">{label}</div>
      <div className="msg__text">{body}</div>
    </div>
  );
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
