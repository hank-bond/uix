// Owns the high-frequency Chat draft and renders prompt submission and cancellation controls.

import { type FormEvent, type JSX, useState } from "react";

import {
  deriveComposerKeyboardIntent,
  deriveComposerPresentation,
} from "./composer";

interface ChatComposerProps {
  canStop: boolean;
  isStopping: boolean;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}

/** Keep draft updates inside the composer so typing cannot render transcripts. */
export function ChatComposer({
  canStop,
  isStopping,
  onCancel,
  onSubmit,
}: ChatComposerProps): JSX.Element {
  const [draft, setDraft] = useState("");
  const presentation = deriveComposerPresentation({
    canStop,
    isStopping,
    hasDraft: draft.trim().length > 0,
  });

  const submitDraft = (): void => {
    const text = draft.trim();
    if (!text || canStop || isStopping) return;
    setDraft("");
    onSubmit(text);
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    submitDraft();
  };

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <textarea
        className="composer__input"
        placeholder="say something…"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          const intent = deriveComposerKeyboardIntent({
            key: event.key,
            shiftKey: event.shiftKey,
            canStop,
            isStopping,
          });
          if (!intent) return;
          event.preventDefault();
          if (intent === "cancel") onCancel();
          if (intent === "submit") submitDraft();
        }}
        rows={2}
      />
      <button
        className="composer__send"
        type={presentation.action === "cancel" ? "button" : "submit"}
        disabled={presentation.disabled}
        onClick={presentation.action === "cancel" ? onCancel : undefined}
      >
        {presentation.label}
      </button>
    </form>
  );
}
