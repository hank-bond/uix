// Renders an agent-error chat block body as a compact status row.

import type { JSX } from "react";

import type { TranscriptItem } from "@uix/api/agent-channels";

export function ErrorChatBlockBody({
  item,
}: {
  item: Extract<TranscriptItem, { kind: "error" }>;
}): JSX.Element {
  return (
    <div className="block-status-row" data-block-part="error-summary">
      <span className="error-block__marker" aria-hidden="true">
        !
      </span>
      <span className="block-status-row__content">
        <span className="block-status-row__label">agent</span>
        <span className="block-status-row__copy block-status-row__copy--inline">
          <span className="block-status-row__description">{item.message}</span>
        </span>
        <span className="block-status-row__state">error</span>
      </span>
    </div>
  );
}
