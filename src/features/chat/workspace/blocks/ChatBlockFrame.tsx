// Renders the shared chat block chrome: label, running track, and body frame.

import type { ReactNode } from "react";
import type { JSX } from "react";

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
}: ChatBlockFrameProps): JSX.Element {
  return (
    <article
      className={`msg msg--${className}`}
      aria-label={toAccessibleLabel(kind)}
      data-chat-block={kind}
      data-block-state={state}
      data-tool-name={toolName}
      data-custom-type={customType}
      data-unconfirmed={isUnconfirmed ? "" : undefined}
    >
      {label ? (
        <div className="msg__label" data-block-part="label">
          {label}
          {state === "running" ? (
            <progress
              className="msg__running-track"
              data-block-part="tool-status"
              aria-label="Tool running"
            />
          ) : null}
        </div>
      ) : null}
      {state === "success" || state === "error" ? (
        <span className="visually-hidden" role="status">
          {completionStatus(kind, state)}
        </span>
      ) : null}
      <div className="msg__text" data-block-part="content">
        {body}
      </div>
    </article>
  );
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
