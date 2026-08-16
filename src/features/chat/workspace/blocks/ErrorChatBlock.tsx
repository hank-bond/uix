// Renders an error chat block with the failure message.

import type { JSX } from "react";

import type { TranscriptItem } from "@uix/api/agent-channels";

import { ChatBlockFrame } from "./ChatBlockFrame";

export function ErrorChatBlock({
  item,
}: {
  item: Extract<TranscriptItem, { kind: "error" }>;
}): JSX.Element {
  return (
    <ChatBlockFrame
      className="error"
      kind="error"
      state="error"
      body={
        <div className="block-status-row" data-block-part="error-summary">
          <span className="error-block__marker" aria-hidden="true">
            !
          </span>
          <span className="block-status-row__content">
            <span className="block-status-row__label">agent</span>
            <span className="block-status-row__copy block-status-row__copy--inline">
              <span className="block-status-row__description">
                {item.message}
              </span>
            </span>
            <span className="block-status-row__state">error</span>
          </span>
        </div>
      }
    />
  );
}
