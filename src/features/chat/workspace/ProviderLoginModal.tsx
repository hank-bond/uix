import { useEffect, useRef, useState } from "react";

import type { AuthProvider, ProviderAuthMethod } from "@uix/api/agent-channels";

import type { AgentControls } from "./agent-controls";

type CredentialMethod = Extract<ProviderAuthMethod, { type: "credentials" }>;
type CredentialReference = NonNullable<
  NonNullable<CredentialMethod["connection"]>["credentialReference"]
>;

interface ExpandedCredentials {
  key: string;
  providerName: string;
  method: CredentialMethod;
}

export function ProviderLoginModal({ controls }: { controls: AgentControls }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState<ExpandedCredentials>();
  const [justConnected, setJustConnected] = useState<string>();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (controls.providerModalOpen && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    } else if (!controls.providerModalOpen && dialog.open) {
      dialog.close();
      setExpanded(undefined);
      setJustConnected(undefined);
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
              <ProviderRow
                key={provider.id}
                provider={provider}
                expanded={expanded}
                justConnected={justConnected}
                onToggle={(next) => {
                  setJustConnected(undefined);
                  setExpanded((current) =>
                    current?.key === next.key ? undefined : next,
                  );
                }}
                onBack={() => setExpanded(undefined)}
                onConnected={(key) => setJustConnected(key)}
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
  expanded,
  justConnected,
  onToggle,
  onBack,
  onConnected,
  controls,
}: {
  provider: AuthProvider;
  expanded: ExpandedCredentials | undefined;
  justConnected: string | undefined;
  onToggle: (next: ExpandedCredentials) => void;
  onBack: () => void;
  onConnected: (key: string) => void;
  controls: AgentControls;
}) {
  const methodButtons = useRef(new Map<string, HTMLButtonElement>());

  return (
    <li className="provider-list__row">
      <div className="provider-list__summary">
        <strong>{provider.name}</strong>
        <span className="provider-list__methods">
          {provider.methods.map((method) => {
            const key = `${method.providerId}:${method.id}`;
            const panelId = `provider-credentials-${toDomId(key)}`;
            const isCredentials = method.type === "credentials";
            const isExpanded = expanded?.key === key;
            return (
              <button
                key={key}
                ref={(button) => {
                  if (button) methodButtons.current.set(key, button);
                  else methodButtons.current.delete(key);
                }}
                type="button"
                className="provider-list__action"
                data-connected={method.connection ? "" : undefined}
                data-just-connected={justConnected === key ? "" : undefined}
                disabled={!isCredentials}
                title={
                  isCredentials
                    ? undefined
                    : "Subscription authentication is wired in the next slice"
                }
                aria-expanded={isCredentials ? isExpanded : undefined}
                aria-controls={isCredentials ? panelId : undefined}
                onClick={() => {
                  if (!isCredentials) return;
                  onToggle({
                    key,
                    providerName: provider.name,
                    method,
                  });
                }}
              >
                {method.label}
                {method.connection && (
                  <span className="visually-hidden">, connected</span>
                )}
              </button>
            );
          })}
        </span>
      </div>

      {expanded &&
        provider.methods.some(
          (method) =>
            method.type === "credentials" &&
            `${method.providerId}:${method.id}` === expanded.key,
        ) && (
          <CredentialForm
            id={`provider-credentials-${toDomId(expanded.key)}`}
            providerName={expanded.providerName}
            method={expanded.method}
            onBack={() => {
              const key = expanded.key;
              onBack();
              requestAnimationFrame(() =>
                methodButtons.current.get(key)?.focus(),
              );
            }}
            onConnected={() => onConnected(expanded.key)}
            controls={controls}
          />
        )}
    </li>
  );
}

function CredentialForm({
  id,
  providerName,
  method,
  onBack,
  onConnected,
  controls,
}: {
  id: string;
  providerName: string;
  method: CredentialMethod;
  onBack: () => void;
  onConnected: () => void;
  controls: AgentControls;
}) {
  const [saving, setSaving] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const chooseModelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (saved) chooseModelRef.current?.focus();
  }, [saved]);

  if (saved) {
    return (
      <div id={id} className="provider-credentials provider-credentials--saved">
        <p className="provider-credentials__success" role="status">
          {providerName} is connected.
        </p>
        <div className="provider-credentials__actions">
          <button
            type="button"
            className="chat-button"
            data-variant="secondary"
            onClick={onBack}
          >
            Back to providers
          </button>
          <button
            ref={chooseModelRef}
            type="button"
            className="chat-button"
            data-variant="primary"
            onClick={() => controls.chooseModelForProvider(method.providerId)}
          >
            Choose a model
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      id={id}
      className="provider-credentials"
      aria-busy={saving}
      onInput={(event) => {
        const values = readCredentialValues(event.currentTarget, method);
        setCanSave(
          Object.values(values).some((value) => value.trim() !== "") &&
            method.fields.every(
              (field) => !field.required || values[field.id]?.trim() !== "",
            ),
        );
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const values = readCredentialValues(event.currentTarget, method);
        setSaving(true);
        setError(undefined);
        void controls
          .saveProviderCredentials({
            providerId: method.providerId,
            methodId: method.id,
            values,
          })
          .then(() => {
            setSaved(true);
            onConnected();
          })
          .catch((saveError: unknown) => setError(String(saveError)))
          .finally(() => setSaving(false));
      }}
    >
      {method.description && (
        <p className="provider-credentials__description">
          {method.description}
        </p>
      )}
      {method.fields.map((field) => {
        const connection =
          field.id === "apiKey" ? method.connection : undefined;
        const keySuffix = connection?.keySuffix;
        const credentialReference = connection?.credentialReference;
        const fieldId = `${id}-${toDomId(field.id)}`;
        const descriptionId =
          keySuffix || credentialReference
            ? `${fieldId}-saved-description`
            : undefined;
        const helpId = credentialReference
          ? `${fieldId}-credential-help`
          : undefined;
        return (
          <div className="provider-credentials__field" key={field.id}>
            <span className="provider-credentials__label">
              <label htmlFor={fieldId}>{field.label}</label>
              {credentialReference && helpId && (
                <button
                  type="button"
                  className="provider-credentials__help-button"
                  aria-label={`About the ${field.label} source`}
                  {...({ popovertarget: helpId } as Record<string, string>)}
                >
                  ?
                </button>
              )}
            </span>
            <input
              id={fieldId}
              name={field.id}
              type={field.secret ? "password" : "text"}
              required={field.required}
              placeholder={credentialPlaceholder(
                credentialReference,
                keySuffix,
                field.placeholder,
              )}
              aria-describedby={descriptionId}
              autoComplete={field.secret ? "new-password" : "off"}
              spellCheck={false}
              disabled={saving}
            />
            {(keySuffix || credentialReference) && (
              <span id={descriptionId} className="visually-hidden">
                {credentialDescription(credentialReference, keySuffix)}
              </span>
            )}
            {credentialReference && helpId && (
              <CredentialSourceHelp
                id={helpId}
                reference={credentialReference}
              />
            )}
          </div>
        );
      })}
      {error && (
        <p className="provider-credentials__error" role="alert">
          {error}
        </p>
      )}
      <div className="provider-credentials__actions">
        <button
          type="submit"
          className="chat-button"
          data-variant="primary"
          disabled={saving || !canSave}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function readCredentialValues(
  form: HTMLFormElement,
  method: CredentialMethod,
): Record<string, string> {
  const data = new FormData(form);
  return Object.fromEntries(
    method.fields.map((field) => {
      const value = data.get(field.id);
      return [field.id, typeof value === "string" ? value : ""];
    }),
  );
}

function credentialPlaceholder(
  reference: CredentialReference | undefined,
  keySuffix: string | undefined,
  fallback: string | undefined,
): string | undefined {
  if (reference?.type === "environment") {
    return `${formatEnvironmentReference(reference.name)}${keySuffix ? `=****************${keySuffix}` : ""}`;
  }
  if (reference?.type === "command") return "!command";
  return keySuffix ? `****************${keySuffix}` : fallback;
}

function credentialDescription(
  reference: CredentialReference | undefined,
  keySuffix: string | undefined,
): string {
  if (reference?.type === "environment") {
    return `This provider currently uses ${formatEnvironmentReference(reference.name)}${keySuffix ? ` with a key ending in ${keySuffix}` : ""}. Enter a new key to save a literal replacement in Pi's auth file; the environment variable will not be changed.`;
  }
  if (reference?.type === "command") {
    return "This provider currently uses a command-backed credential. Enter a new key to save a literal replacement in Pi's auth file; the command and its external secret source will not be changed.";
  }
  return `A saved key ending in ${keySuffix} exists. Enter a new key to replace it.`;
}

function CredentialSourceHelp({
  id,
  reference,
}: {
  id: string;
  reference: CredentialReference;
}) {
  const authFile = <code>~/.pi/agent/auth.json</code>;
  return (
    <div
      id={id}
      className="provider-credentials__help-popover"
      {...({ popover: "auto" } as Record<string, string>)}
    >
      <strong>
        {reference.type === "environment"
          ? "Environment credential"
          : "Command-backed credential"}
      </strong>
      {reference.type === "environment" ? (
        <p>
          Pi currently gets this API key from{" "}
          <code>{formatEnvironmentReference(reference.name)}</code>, inherited
          when UIX started.
        </p>
      ) : (
        <p>
          Pi currently gets this API key by running a command{" "}
          {reference.location === "auth_file" ? (
            <>stored in {authFile}</>
          ) : (
            <>from provider configuration</>
          )}
          . The command’s output remains outside this form.
        </p>
      )}
      <p>
        Saving here writes a literal key to {authFile}. It does not change the{" "}
        {reference.type === "environment"
          ? "environment variable"
          : "command or its external secret source"}
        ; Pi will use the saved key instead.
      </p>
    </div>
  );
}

function formatEnvironmentReference(label: string): string {
  return label
    .split(",")
    .map((name) => `$${name.trim()}`)
    .join(", ");
}

function toDomId(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
}
