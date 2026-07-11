import { useEffect, useRef, useState } from "react";

import type { ModelOption } from "@uix/api/agent-channels";

import type { AgentControls } from "./agent-controls";
import { filterModels } from "./model-filter";

export function ModelPill({ controls }: { controls: AgentControls }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = controls.status?.model ?? controls.status?.defaultModel;
  return (
    <span className="model-pill">
      <button
        ref={buttonRef}
        type="button"
        className="status-bar__item model-pill__button"
        aria-haspopup="listbox"
        aria-expanded={controls.modelPickerOpen}
        onClick={controls.toggleModelPicker}
      >
        {current ? `${current.provider}/${current.id}` : "select model"}
      </button>
      {controls.modelPickerOpen && (
        <ModelPicker
          controls={controls}
          onConnect={() => {
            if (buttonRef.current)
              controls.openProviderModal(buttonRef.current);
          }}
          onClose={controls.closeModelPicker}
        />
      )}
    </span>
  );
}

function ModelPicker({
  controls,
  onConnect,
  onClose,
}: {
  controls: AgentControls;
  onConnect: () => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  const filtered = filterModels(controls.models ?? [], query);

  const select = async (model: ModelOption) => {
    try {
      await controls.selectModel(model);
    } catch (selectError) {
      setError(String(selectError));
    }
  };

  return (
    <span className="model-picker" ref={rootRef}>
      <input
        ref={inputRef}
        className="model-picker__input"
        placeholder="search models…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "Enter" && filtered.length > 0) {
            void select(filtered[0]);
          }
        }}
      />
      {(error ?? controls.modelError) ? (
        <span className="model-picker__note model-picker__note--error">
          {error ?? controls.modelError}
        </span>
      ) : controls.models === undefined ? (
        <span className="model-picker__note">loading models…</span>
      ) : controls.models.length === 0 ? (
        <span className="model-picker__note">
          No authenticated models found.
        </span>
      ) : filtered.length === 0 ? (
        <span className="model-picker__note">no matches</span>
      ) : (
        <ul className="model-picker__list" role="listbox">
          {filtered.map((model) => (
            <li key={`${model.provider}/${model.id}`} role="option">
              <button
                type="button"
                className="model-picker__option"
                onClick={() => void select(model)}
              >
                <span className="model-picker__name">{model.name}</span>
                <span className="model-picker__ref">
                  {model.provider}/{model.id}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="model-picker__connect"
        onClick={onConnect}
      >
        Connect to a provider…
      </button>
    </span>
  );
}
