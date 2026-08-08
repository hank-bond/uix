// Renders the shared clickable summary and expanded-detail frame for tool calls.

import type { ReactNode } from "react";
import type { JSX } from "react";

import type { ToolParam, ToolState } from "../presentation";

interface ToolCallDisclosureProps {
  /** Display label for the tool (catalog label or prettified name). */
  label: string;
  /** Human-facing reason, styled as the primary summary field. */
  description?: string;
  /** Args surfaced in the collapsed summary as `key: value` rows. */
  params: ToolParam[];
  /** Args hidden from the summary, shown as `key: value` rows when expanded. */
  expandedParams: ToolParam[];
  state: ToolState;
  part: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function ToolCallDisclosure({
  label,
  description,
  params,
  expandedParams,
  state,
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
            <span className="tool-call__name">{label}</span>
            {params.length ? (
              <span className="tool-call__params">
                {params.map((param) => (
                  <span key={param.key} className="tool-call__param">
                    <span className="tool-call__param-key">{param.key}</span>
                    <span className="tool-call__param-value">
                      {param.value}
                    </span>
                  </span>
                ))}
              </span>
            ) : null}
            {description ? (
              <span className="tool-call__summary-copy">
                <span className="tool-call__description">{description}</span>
              </span>
            ) : null}
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
          {expandedParams.length ? (
            <div className="tool-call__params-list" data-uix-part="tool-params">
              {expandedParams.map((param) => (
                <div key={param.key} className="tool-call__param">
                  <span className="tool-call__param-key">{param.key}</span>
                  <span className="tool-call__param-value">{param.value}</span>
                </div>
              ))}
            </div>
          ) : null}
          {children ?? (
            <span className="tool-call__pending">Waiting for result…</span>
          )}
        </div>
      </details>
      {actions ? <div className="tool-call__actions">{actions}</div> : null}
    </div>
  );
}
