import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ModelOption } from "@uix/api/agent-channels";
import { useActionContribution } from "@uix/api/workspace";

import type { AgentControls } from "./agent-controls";
import {
  filterModels,
  getModelsForScope,
  type ModelPickerScope,
  toModelSource,
} from "./model-filter";
import { createModelActions } from "./model-actions";

export function ModelPill({ controls }: { controls: AgentControls }) {
  const actions = useMemo(
    () => createModelActions(controls.openModelPicker),
    [controls.openModelPicker],
  );
  useActionContribution(actions);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = controls.status?.model ?? controls.status?.defaultModel;
  const currentOption = controls.models?.find(
    (model) => model.provider === current?.provider && model.id === current?.id,
  );
  return (
    <div className="model-pill">
      <button
        ref={buttonRef}
        type="button"
        className="status-bar__item model-pill__button"
        aria-haspopup="dialog"
        aria-expanded={controls.modelPicker !== undefined}
        onClick={controls.toggleModelPicker}
      >
        {currentOption?.name ?? current?.id ?? "select model"}
      </button>
      {controls.modelPicker && (
        <ModelPicker
          controls={controls}
          initialQuery={controls.modelPicker.initialQuery}
          scope={controls.modelPicker.scope}
          onConnect={() => {
            if (buttonRef.current)
              controls.openProviderModal(buttonRef.current);
          }}
          onClose={controls.closeModelPicker}
          onScopeChange={controls.setModelPickerScope}
        />
      )}
    </div>
  );
}

function ModelPicker({
  controls,
  initialQuery,
  scope,
  onConnect,
  onClose,
  onScopeChange,
}: {
  controls: AgentControls;
  initialQuery: string;
  scope: ModelPickerScope;
  onConnect: () => void;
  onClose: () => void;
  onScopeChange: (scope: ModelPickerScope) => void;
}) {
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState(initialQuery);
  const [favoritePending, setFavoritePending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const positionedScopes = useRef<Set<ModelPickerScope>>(
    new Set(initialQuery ? ["all"] : []),
  );
  const scopeScrollPositions = useRef(new Map<ModelPickerScope, number>());
  const inputId = useId();

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

  const activeScope = scope;
  const scopedModels = getModelsForScope(controls.models ?? [], activeScope);
  const filtered = filterModels(scopedModels, query);
  const current = controls.status?.model ?? controls.status?.defaultModel;

  useLayoutEffect(() => {
    if (controls.models === undefined) return;

    const list = listRef.current;
    if (positionedScopes.current.has(scope)) {
      const savedScrollTop = scopeScrollPositions.current.get(scope);
      if (list && savedScrollTop !== undefined) {
        list.scrollTop = savedScrollTop;
      }
      return;
    }
    if (query) {
      positionedScopes.current.add(scope);
      if (list) list.scrollTop = 0;
      scopeScrollPositions.current.set(scope, 0);
      return;
    }
    if (!current) return;

    const row = list?.querySelector<HTMLElement>('[data-current-model="true"]');
    positionedScopes.current.add(scope);
    if (!list || !row) {
      if (list) list.scrollTop = 0;
      scopeScrollPositions.current.set(scope, 0);
      return;
    }

    const listBounds = list.getBoundingClientRect();
    const rowBounds = row.getBoundingClientRect();
    const rowOffsetInViewport = rowBounds.top - listBounds.top;
    const scrollTop = Math.max(
      0,
      list.scrollTop +
        rowOffsetInViewport -
        (list.clientHeight - rowBounds.height) / 2,
    );
    list.scrollTop = scrollTop;
    scopeScrollPositions.current.set(scope, list.scrollTop);
  }, [controls.models, current, query, scope]);

  const switchScope = (nextScope: ModelPickerScope) => {
    if (listRef.current) {
      scopeScrollPositions.current.set(activeScope, listRef.current.scrollTop);
    }
    onScopeChange(nextScope);
  };

  const select = async (model: ModelOption) => {
    setError(undefined);
    try {
      await controls.selectModel(model);
    } catch (selectError) {
      setError(String(selectError));
    }
  };

  const toggleFavorite = async (model: ModelOption) => {
    setError(undefined);
    setFavoritePending(true);
    try {
      await controls.setModelFavorite(model, !model.favorite);
    } catch (favoriteError) {
      setError(String(favoriteError));
    } finally {
      setFavoritePending(false);
    }
  };

  return (
    <div
      className="model-picker"
      ref={rootRef}
      role="dialog"
      aria-label="Choose a model"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="model-picker__tabs" role="group" aria-label="Models">
        <button
          type="button"
          className="model-picker__tab"
          aria-pressed={activeScope === "favorites"}
          onClick={() => switchScope("favorites")}
        >
          Favorites
        </button>
        <button
          type="button"
          className="model-picker__tab"
          aria-pressed={activeScope === "all"}
          onClick={() => switchScope("all")}
        >
          All models
        </button>
      </div>
      <label className="visually-hidden" htmlFor={inputId}>
        Search models
      </label>
      <input
        id={inputId}
        ref={inputRef}
        className="model-picker__input"
        placeholder="search models…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && filtered.length > 0) {
            void select(filtered[0]);
          }
        }}
      />
      {(error ?? controls.modelError) && (
        <div className="model-picker__note model-picker__note--error">
          {error ?? controls.modelError}
        </div>
      )}
      <div>
        {controls.models === undefined ? (
          <div className="model-picker__note">loading models…</div>
        ) : controls.models.length === 0 ? (
          <div className="model-picker__note">
            No authenticated models found.
          </div>
        ) : activeScope === "favorites" && scopedModels.length === 0 ? (
          <div className="model-picker__note">
            Star models under All models to add favorites.
          </div>
        ) : filtered.length === 0 ? (
          <div className="model-picker__note">no matches</div>
        ) : (
          <ul
            className="model-picker__list"
            ref={listRef}
            onScroll={(event) =>
              scopeScrollPositions.current.set(
                activeScope,
                event.currentTarget.scrollTop,
              )
            }
          >
            {filtered.map((model) => {
              const key = `${model.provider}/${model.id}`;
              const source = toModelSource(model);
              const isCurrent =
                model.provider === current?.provider && model.id === current.id;
              return (
                <li
                  className="model-picker__row"
                  key={key}
                  data-current-model={isCurrent ? "true" : undefined}
                >
                  <button
                    type="button"
                    className="model-picker__option"
                    aria-current={isCurrent ? "true" : undefined}
                    onClick={() => void select(model)}
                  >
                    <span className="model-picker__name" title={model.name}>
                      <span className="model-picker__label">{model.name}</span>
                      {isCurrent && (
                        <>
                          <span
                            className="model-picker__current"
                            aria-hidden="true"
                          >
                            ✓
                          </span>
                          <span className="visually-hidden">
                            , current model
                          </span>
                        </>
                      )}
                    </span>
                    <span className="model-picker__source" title={source}>
                      {source}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="model-picker__favorite"
                    aria-label={`${model.favorite ? "Remove" : "Add"} ${model.name} (${source}) ${model.favorite ? "from" : "to"} favorites`}
                    aria-pressed={model.favorite}
                    disabled={favoritePending}
                    onClick={() => void toggleFavorite(model)}
                  >
                    <span aria-hidden="true">{model.favorite ? "★" : "☆"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <button
        type="button"
        className="model-picker__connect"
        onClick={onConnect}
      >
        Connect to a provider…
      </button>
    </div>
  );
}
