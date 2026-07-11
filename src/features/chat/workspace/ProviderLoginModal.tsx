import { useEffect, useRef } from "react";

import type { AgentControls } from "./agent-controls";

export function ProviderLoginModal({ controls }: { controls: AgentControls }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

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
        {controls.providerError ? (
          <p className="provider-modal__error" role="alert">
            {controls.providerError}
          </p>
        ) : controls.providers === undefined ? (
          <p className="provider-modal__note">Loading providers…</p>
        ) : controls.providers.length === 0 ? (
          <p className="provider-modal__note">Pi reported no providers.</p>
        ) : (
          <ul className="provider-list">
            {controls.providers.map((provider) => (
              <li className="provider-list__row" key={provider.id}>
                <span>
                  <strong>{provider.name}</strong>
                  {provider.methods.some((method) => method.connection) && (
                    <span className="provider-list__status">Connected</span>
                  )}
                </span>
                <span className="provider-list__methods">
                  {provider.methods.map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      className="provider-list__action"
                      disabled
                      title="Provider authentication is wired in the next slice"
                    >
                      {method.label}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}
