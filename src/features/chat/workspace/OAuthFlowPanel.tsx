import { type ReactNode, useEffect, useRef, useState } from "react";

import type { ProviderAuthMethod } from "@uix/api/agent-channels";

import type { AgentControls } from "./agent-controls";

type OAuthMethod = Extract<ProviderAuthMethod, { type: "oauth" }>;

export function OAuthFlowPanel({
  id,
  providerName,
  method,
  controls,
}: {
  id: string;
  providerName: string;
  method: OAuthMethod;
  controls: AgentControls;
}) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const chooseModelRef = useRef<HTMLButtonElement>(null);
  const activity =
    controls.oauthActivity?.providerId === method.providerId
      ? controls.oauthActivity
      : undefined;
  const state = activity?.flow;

  useEffect(() => {
    setAnswer("");
  }, [state?.type === "prompt" ? state.promptId : undefined]);

  useEffect(() => {
    if (state?.type === "success") chooseModelRef.current?.focus();
  }, [state?.type]);

  const cancel = activity?.flowId ? (
    <button
      type="button"
      className="chat-button"
      data-variant="secondary"
      onClick={() => void controls.cancelOAuthFlow()}
    >
      Cancel
    </button>
  ) : null;

  const retryActionId = activity?.actionId ?? method.startActions[0]?.id;
  let content: ReactNode;
  if (!state && !activity) {
    content = (
      <div className="provider-oauth__choices">
        {method.startActions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="chat-button"
            data-variant={action.primary ? "primary" : "secondary"}
            onClick={() =>
              void controls.beginOAuthFlow(method.providerId, action.id)
            }
          >
            {action.label}
          </button>
        ))}
      </div>
    );
  } else if (!state) {
    content = (
      <p className="provider-oauth__status" role="status">
        Starting {providerName} authentication…
      </p>
    );
  } else if (state.type === "authorization") {
    content = (
      <>
        <p className="provider-oauth__status" role="status">
          {state.instructions ??
            `Continue signing in to ${providerName} in your browser.`}
        </p>
        {state.supportsManualInput && (
          <p className="provider-oauth__note">
            If the browser cannot return automatically, UIX will ask for the
            redirect URL or authorization code here.
          </p>
        )}
        <div className="provider-oauth__actions">
          {cancel}
          <button
            type="button"
            className="chat-button"
            data-variant="primary"
            onClick={() => void controls.reopenOAuthFlow(state.flowId)}
          >
            Open browser again
          </button>
        </div>
      </>
    );
  } else if (state.type === "device_code") {
    content = (
      <>
        <p className="provider-oauth__status" role="status">
          Enter this code to connect {providerName}:
        </p>
        <output className="provider-oauth__code">{state.userCode}</output>
        <p className="provider-oauth__url">{state.verificationUrl}</p>
        <div className="provider-oauth__actions">
          {cancel}
          <button
            type="button"
            className="chat-button"
            data-variant="primary"
            onClick={() => void controls.reopenOAuthFlow(state.flowId)}
          >
            Open browser again
          </button>
        </div>
      </>
    );
  } else if (state.type === "prompt") {
    content = (
      <form
        className="provider-oauth__prompt"
        aria-busy={submitting}
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitting(true);
          void controls
            .answerOAuthFlow(state.flowId, state.promptId, answer)
            .catch(() => {})
            .finally(() => setSubmitting(false));
        }}
      >
        <label htmlFor={`${id}-answer`}>{state.message}</label>
        <input
          id={`${id}-answer`}
          value={answer}
          placeholder={state.placeholder}
          required={!state.allowEmpty}
          autoComplete="off"
          spellCheck={false}
          disabled={submitting}
          onChange={(event) => setAnswer(event.currentTarget.value)}
        />
        <div className="provider-oauth__actions">
          {cancel}
          <button
            type="submit"
            className="chat-button"
            data-variant="primary"
            disabled={submitting || (!state.allowEmpty && answer.length === 0)}
          >
            Continue
          </button>
        </div>
      </form>
    );
  } else if (state.type === "select") {
    content = (
      <>
        <p className="provider-oauth__status">{state.message}</p>
        <div className="provider-oauth__choices">
          {state.options.map((option) => (
            <button
              key={option.id}
              type="button"
              className="chat-button"
              disabled={submitting}
              onClick={() => {
                setSubmitting(true);
                void controls
                  .answerOAuthFlow(state.flowId, state.promptId, option.id)
                  .catch(() => {})
                  .finally(() => setSubmitting(false));
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="provider-oauth__actions">{cancel}</div>
      </>
    );
  } else if (state.type === "progress") {
    content = (
      <>
        <p className="provider-oauth__status" role="status">
          {state.message}
        </p>
        <div className="provider-oauth__actions">{cancel}</div>
      </>
    );
  } else if (state.type === "success") {
    content = (
      <>
        <p className="provider-oauth__success" role="status">
          {providerName} is connected.
        </p>
        <div className="provider-oauth__actions">
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
      </>
    );
  } else {
    const failed = state.type === "failure";
    content = (
      <>
        <p
          className={
            failed ? "provider-oauth__error" : "provider-oauth__status"
          }
          role={failed ? "alert" : "status"}
        >
          {failed ? state.message : "Authentication cancelled."}
        </p>
        <div className="provider-oauth__actions">
          <button
            type="button"
            className="chat-button"
            data-variant="primary"
            disabled={!retryActionId}
            onClick={() => {
              if (retryActionId) {
                void controls.beginOAuthFlow(method.providerId, retryActionId);
              }
            }}
          >
            Retry
          </button>
        </div>
      </>
    );
  }

  return (
    <div id={id} className="provider-oauth">
      {content}
    </div>
  );
}
