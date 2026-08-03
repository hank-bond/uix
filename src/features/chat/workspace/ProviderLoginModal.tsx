// Renders the provider login modal: provider rows and auth method selection.

import type { JSX } from "react";
import { useEffect, useMemo, useRef } from "react";

import type {
  ProviderAuthFlowSnapshot,
  ProviderAuthMethod,
} from "@uix/api/agent-channels";

import type { AgentControls } from "./agent-controls";
import { deriveProviderAuthRows } from "./provider-auth-presentation";
import { ProviderAuthFlowPanel } from "./ProviderAuthFlowPanel";

export function ProviderLoginModal({
  controls,
}: {
  controls: AgentControls;
}): JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const providerRows = useMemo(
    () => deriveProviderAuthRows(controls.providers),
    [controls.providers],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (controls.providerModalOpen && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    } else if (!controls.providerModalOpen && dialog.open) {
      dialog.close();
    }
  }, [controls.providerModalOpen]);

  return (
    <dialog
      ref={dialogRef}
      className="provider-modal"
      aria-labelledby="provider-modal-title"
      closedby="any"
      onClose={() => {
        if (controls.providerModalOpen) controls.closeProviderModal();
      }}
    >
      <header className="provider-modal__header">
        <div>
          <h2 id="provider-modal-title">Connect a provider</h2>
          <p>Choose a provider to make its models available in UIX.</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="provider-modal__close"
          aria-label="Close provider connection"
          onClick={controls.closeProviderModal}
        >
          ×
        </button>
      </header>

      <div className="provider-modal__body">
        {controls.providerAuthError && (
          <p className="provider-modal__error" role="alert">
            {controls.providerAuthError}
          </p>
        )}
        {controls.providerError ? (
          <p className="provider-modal__error" role="alert">
            {controls.providerError}
          </p>
        ) : providerRows === undefined ? (
          <p className="provider-modal__note">Loading providers…</p>
        ) : providerRows.length === 0 ? (
          <p className="provider-modal__note">
            Pi reported no interactive provider login methods.
          </p>
        ) : (
          <ul className="provider-list">
            {providerRows.map((provider) => (
              <ProviderRow
                key={provider.id}
                provider={provider}
                flow={controls.providerAuthFlow}
                onSelectMethod={(method) =>
                  void controls.selectProviderAuthMethod(
                    method.providerId,
                    method.authType,
                  )
                }
                controls={controls}
              />
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}

function ProviderRow({
  provider,
  flow,
  onSelectMethod,
  controls,
}: {
  provider: NonNullable<ReturnType<typeof deriveProviderAuthRows>>[number];
  flow: ProviderAuthFlowSnapshot | undefined;
  onSelectMethod: (method: ProviderAuthMethod) => void;
  controls: AgentControls;
}): JSX.Element {
  const activeMethod = provider.methods.find(
    (method) =>
      method.providerId === flow?.providerId &&
      method.authType === flow.authType,
  );

  return (
    <li className="provider-list__row">
      <div className="provider-list__summary">
        <strong>{provider.name}</strong>
        <span className="provider-list__methods">
          {provider.methods.map((method) => {
            const key = toProviderAuthMethodKey(method);
            const panelId = `provider-auth-${toDomId(key)}`;
            const isExpanded = activeMethod === method;
            return (
              <button
                key={key}
                type="button"
                className="provider-list__action"
                data-connected={method.connection ? "" : undefined}
                aria-expanded={isExpanded}
                aria-controls={panelId}
                onClick={() => {
                  onSelectMethod(method);
                }}
              >
                {method.authType === "api_key" ? "API key" : "Sign in"}
                {method.connection && (
                  <span className="visually-hidden">, connected</span>
                )}
              </button>
            );
          })}
        </span>
      </div>

      {flow && activeMethod && (
        <ProviderAuthFlowPanel
          id={`provider-auth-${toDomId(toProviderAuthMethodKey(activeMethod))}`}
          providerName={provider.name}
          method={activeMethod}
          flow={flow}
          controls={controls}
        />
      )}
    </li>
  );
}

function toProviderAuthMethodKey(method: ProviderAuthMethod): string {
  return `${method.providerId}:${method.authType}`;
}

function toDomId(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
}
