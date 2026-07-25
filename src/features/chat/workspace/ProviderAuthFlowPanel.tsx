import { useEffect, useRef, useState } from "react";

import type {
  ProviderAuthFlowSnapshot,
  ProviderAuthLink,
  ProviderAuthMethod,
  ProviderAuthNotice,
  ProviderAuthPrompt,
} from "@uix/api/agent-channels";

import type { AgentControls } from "./agent-controls";

export function ProviderAuthFlowPanel({
  id,
  providerName,
  method,
  flow,
  controls,
}: {
  id: string;
  providerName: string;
  method: ProviderAuthMethod;
  flow: ProviderAuthFlowSnapshot;
  controls: AgentControls;
}) {
  const chooseModelRef = useRef<HTMLButtonElement>(null);
  const isRunning =
    flow.phase.type === "starting" || flow.phase.type === "active";

  useEffect(() => {
    if (flow.phase.type === "success") chooseModelRef.current?.focus();
  }, [flow.phase.type]);

  return (
    <div id={id} className="provider-auth">
      {isRunning &&
        flow.notices.map((notice, index) => (
          <ProviderAuthNoticeView
            key={`${notice.type}-${index}`}
            notice={notice}
            flowId={flow.flowId}
            providerName={providerName}
            controls={controls}
          />
        ))}

      {flow.prompt ? (
        <ProviderAuthPromptView
          key={flow.prompt.promptId}
          prompt={flow.prompt}
          flowId={flow.flowId}
          controls={controls}
        />
      ) : flow.phase.type === "starting" ? (
        <p className="provider-auth__status" role="status">
          Starting {providerName} authentication…
        </p>
      ) : flow.phase.type === "active" ? (
        <p className="provider-auth__status" role="status">
          Waiting for {providerName}…
        </p>
      ) : flow.phase.type === "success" ? (
        <>
          <p className="provider-auth__success" role="status">
            {providerName} is connected.
          </p>
          <div className="provider-auth__actions">
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
      ) : (
        <>
          <p
            className={
              flow.phase.type === "failure"
                ? "provider-auth__error"
                : "provider-auth__status"
            }
            role={flow.phase.type === "failure" ? "alert" : "status"}
          >
            {flow.phase.type === "failure"
              ? flow.phase.message
              : "Authentication cancelled."}
          </p>
          <div className="provider-auth__actions">
            <button
              type="button"
              className="chat-button"
              data-variant="primary"
              onClick={() =>
                void controls.selectProviderAuthMethod(
                  method.providerId,
                  method.authType,
                )
              }
            >
              Retry
            </button>
          </div>
        </>
      )}

      {isRunning && (
        <div className="provider-auth__actions">
          <button
            type="button"
            className="chat-button"
            data-variant="secondary"
            onClick={() => void controls.cancelProviderAuthFlow()}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function ProviderAuthNoticeView({
  notice,
  flowId,
  providerName,
  controls,
}: {
  notice: ProviderAuthNotice;
  flowId: string;
  providerName: string;
  controls: AgentControls;
}) {
  if (notice.type === "info") {
    return (
      <div className="provider-auth__notice">
        <p className="provider-auth__status">{notice.message}</p>
        {notice.links.map((link) => (
          <ProviderAuthLinkButton
            key={link.linkId}
            link={link}
            flowId={flowId}
            controls={controls}
          />
        ))}
      </div>
    );
  }

  if (notice.type === "authorization") {
    return (
      <div className="provider-auth__notice">
        <p className="provider-auth__status" role="status">
          {notice.instructions ??
            `Continue signing in to ${providerName} in your browser.`}
        </p>
        <p className="provider-auth__url">{notice.link.url}</p>
        <ProviderAuthLinkButton
          link={notice.link}
          flowId={flowId}
          controls={controls}
          fallbackLabel="Open browser again"
        />
      </div>
    );
  }

  if (notice.type === "device_code") {
    return (
      <div className="provider-auth__notice">
        <p className="provider-auth__status" role="status">
          Enter this code to connect {providerName}:
        </p>
        <output className="provider-auth__code">{notice.userCode}</output>
        <p className="provider-auth__url">{notice.link.url}</p>
        <ProviderAuthLinkButton
          link={notice.link}
          flowId={flowId}
          controls={controls}
          fallbackLabel="Open browser again"
        />
      </div>
    );
  }

  return (
    <p className="provider-auth__status" role="status">
      {notice.message}
    </p>
  );
}

function ProviderAuthLinkButton({
  link,
  flowId,
  controls,
  fallbackLabel = "Open link",
}: {
  link: ProviderAuthLink;
  flowId: string;
  controls: AgentControls;
  fallbackLabel?: string;
}) {
  return (
    <div className="provider-auth__actions">
      <button
        type="button"
        className="chat-button"
        onClick={() => void controls.openProviderAuthLink(flowId, link.linkId)}
      >
        {link.label ?? fallbackLabel}
      </button>
    </div>
  );
}

function ProviderAuthPromptView({
  prompt,
  flowId,
  controls,
}: {
  prompt: ProviderAuthPrompt;
  flowId: string;
  controls: AgentControls;
}) {
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (prompt.type === "select") {
    return (
      <fieldset className="provider-auth__prompt" disabled={isSubmitting}>
        <legend>{prompt.message}</legend>
        <div className="provider-auth__choices">
          {prompt.options.map((option) => (
            <button
              key={option.id}
              type="button"
              className="chat-button"
              data-has-description={option.description ? "" : undefined}
              onClick={() => {
                setIsSubmitting(true);
                void controls
                  .answerProviderAuthPrompt(flowId, prompt.promptId, option.id)
                  .catch(() => setIsSubmitting(false));
              }}
            >
              <span>{option.label}</span>
              {option.description && (
                <span className="provider-auth__choice-description">
                  {option.description}
                </span>
              )}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <form
      className="provider-auth__prompt"
      aria-busy={isSubmitting}
      onSubmit={(event) => {
        event.preventDefault();
        setIsSubmitting(true);
        void controls
          .answerProviderAuthPrompt(flowId, prompt.promptId, answer)
          .catch(() => setIsSubmitting(false));
      }}
    >
      <label htmlFor={`${prompt.promptId}-answer`}>{prompt.message}</label>
      <input
        id={`${prompt.promptId}-answer`}
        type={prompt.secret ? "password" : "text"}
        value={answer}
        placeholder={prompt.placeholder}
        autoComplete={prompt.secret ? "new-password" : "off"}
        spellCheck={false}
        disabled={isSubmitting}
        onChange={(event) => setAnswer(event.currentTarget.value)}
      />
      <div className="provider-auth__actions">
        <button
          type="submit"
          className="chat-button"
          data-variant="primary"
          disabled={isSubmitting}
        >
          Continue
        </button>
      </div>
    </form>
  );
}
