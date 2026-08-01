import type { ReactNode } from "react";

import type { TranscriptItem } from "@uix/api/agent-channels";

interface ChatBlockFrameProps {
  className: string;
  kind: TranscriptItem["kind"];
  state?: "running" | "success" | "error";
  toolName?: string;
  customType?: string;
  label?: ReactNode;
  body: ReactNode;
  /** Optimistic row awaiting its canonical counterpart from main. */
  isUnconfirmed?: boolean;
}

export function ChatBlockFrame({
  className,
  kind,
  state,
  toolName,
  customType,
  label,
  body,
  isUnconfirmed,
}: ChatBlockFrameProps) {
  return (
    <article
      className={`msg msg--${className}`}
      aria-label={toAccessibleLabel(kind)}
      data-uix-chat-block={kind}
      data-uix-state={state}
      data-uix-tool-name={toolName}
      data-uix-custom-type={customType}
      data-uix-unconfirmed={isUnconfirmed ? "" : undefined}
    >
      {label ? (
        <div className="msg__label" data-uix-part="label">
          {label}
          {state === "running" ? (
            <progress
              className="msg__running-track"
              data-uix-part="tool-status"
              aria-label="Tool running"
            />
          ) : null}
        </div>
      ) : null}
      {state === "success" || state === "error" ? (
        <span className="visually-hidden" role="status">
          {state === "success" ? "Tool finished" : "Tool failed"}
        </span>
      ) : null}
      <div className="msg__text" data-uix-part="content">
        {body}
      </div>
    </article>
  );
}

function toAccessibleLabel(kind: TranscriptItem["kind"]): string | undefined {
  switch (kind) {
    case "user":
      return "User message";
    case "assistant":
      return "Agent message";
    case "tool":
    case "custom":
    case "error":
      return undefined;
  }
}
