import { useEffect, useRef, type KeyboardEvent } from "react";

import type { AgentControls } from "./agent-controls";

export function ProviderLoginModal({ controls }: { controls: AgentControls }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (controls.providerModalOpen) closeRef.current?.focus();
  }, [controls.providerModalOpen]);

  if (!controls.providerModalOpen) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      controls.closeProviderModal();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="provider-modal__backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) controls.closeProviderModal();
      }}
    >
      <div
        ref={dialogRef}
        className="provider-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="provider-modal-title"
        onKeyDown={onKeyDown}
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
          {controls.providerError ? (
            <p className="provider-modal__error" role="alert">
              {controls.providerError}
            </p>
          ) : controls.providers === undefined ? (
            <p className="provider-modal__note">Loading providers…</p>
          ) : controls.providers.length === 0 ? (
            <p className="provider-modal__note">
              Pi reported no OAuth providers.
            </p>
          ) : (
            <ul className="provider-list">
              {controls.providers.map((provider) => (
                <li className="provider-list__row" key={provider.id}>
                  <span>
                    <strong>{provider.name}</strong>
                    {provider.connected && (
                      <span className="provider-list__status">Connected</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="provider-list__action"
                    disabled
                    title="Provider login is wired in the next slice"
                  >
                    {provider.connected ? "Reconnect" : "Connect"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
