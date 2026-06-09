import type { ReactNode } from "react";

import type { TranscriptItem } from "../../../shared/ipc";

export interface ChatBlockFrameProps {
  className: string;
  kind: TranscriptItem["kind"];
  state?: "running" | "success" | "error";
  toolName?: string;
  customType?: string;
  label: string;
  body: ReactNode;
}

export function ChatBlockFrame({
  className,
  kind,
  state,
  toolName,
  customType,
  label,
  body,
}: ChatBlockFrameProps) {
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
