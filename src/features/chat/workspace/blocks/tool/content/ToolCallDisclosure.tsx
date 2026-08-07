// Renders the shared clickable summary and expanded-detail frame for structured tool calls.

import type { ReactNode } from "react";
import type { JSX } from "react";

import type { ToolState } from "../presentation";

interface ToolCallDisclosureProps {
  toolName: string;
  description?: string;
  state: ToolState;
  target?: string;
  part: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function ToolCallDisclosure({
  toolName,
  description,
  state,
  target,
  part,
  actions,
  children,
}: ToolCallDisclosureProps): JSX.Element {
  return (
    <div
      className="tool-call-frame"
      data-has-actions={actions ? "" : undefined}
    >
      <details className="tool-call" data-uix-part={part}>
        <summary className="tool-call__summary">
          <span className="tool-call__chevron" aria-hidden="true" />
          <span className="tool-call__header">
            <span className="tool-call__name">{toolName}</span>
            <span className="tool-call__summary-copy">
              {description ? (
                <span className="tool-call__description">{description}</span>
              ) : null}
              {target ? (
                <code className="tool-call__target" data-uix-part="tool-target">
                  {target}
                </code>
              ) : null}
            </span>
            {state === "error" ? (
              <span className="tool-call__state">error</span>
            ) : null}
          </span>
          {state === "running" ? (
            <progress
              className="msg__running-track"
              data-uix-part="tool-status"
              aria-label="Tool running"
            />
          ) : null}
        </summary>
        <div className="tool-call__content">
          {children ?? (
            <span className="tool-call__pending">Waiting for result…</span>
          )}
        </div>
      </details>
      {actions ? <div className="tool-call__actions">{actions}</div> : null}
    </div>
  );
}
