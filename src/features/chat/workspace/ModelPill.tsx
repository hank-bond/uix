// model pill — the first real status-bar cell (plan: agent-controls A3).
//
// Shows the current model (live session model, else workspace default, else
// an explicit "select model" empty state — UIX invents no fallback) and
// opens a small anchored picker over pi's available models. Selection goes
// through the substrate `select_model` channel; the pill never mutates
// workspace settings itself.

import { useEffect, useRef, useState } from "react";

import type {
  agentChannels,
  AgentStatus,
  ModelOption,
} from "@uix/api/agent-channels";
import type { ChannelClient } from "@uix/api/workspace";

type AgentChannelClient = ChannelClient<typeof agentChannels>;

export function ModelPill({ client }: { client: AgentChannelClient }) {
  const [status, setStatus] = useState<AgentStatus>();
  const [models, setModels] = useState<ModelOption[]>();
  const [listError, setListError] = useState<string>();
  const [open, setOpen] = useState(false);

  // Subscribe before seeding so a status_changed that lands during the
  // seed await isn't lost; the seed response and events carry the same
  // whole-status shape, so last-write-wins is safe either way.
  useEffect(() => client.events.status_changed(setStatus), [client]);
  useEffect(() => {
    let cancelled = false;
    void client.requests
      .agent_status(undefined)
      .then((seed) => {
        if (!cancelled) setStatus((prev) => prev ?? seed);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client]);

  // Fetched once per surface mount, not per picker open: model availability
  // changes when auth or models.json changes, and the substrate's refresh
  // path for that is /reload (which remounts the surface and re-runs this).
  useEffect(() => {
    let cancelled = false;
    void client.requests
      .list_models(undefined)
      .then((list) => {
        if (!cancelled) setModels(list.models);
      })
      .catch((err: unknown) => {
        if (!cancelled) setListError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const current = status?.model ?? status?.defaultModel;
  return (
    <span className="model-pill">
      <button
        type="button"
        className="status-bar__item model-pill__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {current ? `${current.provider}/${current.id}` : "select model"}
      </button>
      {open && (
        <ModelPicker
          client={client}
          models={models}
          listError={listError}
          onStatus={setStatus}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

function ModelPicker({
  client,
  models,
  listError,
  onStatus,
  onClose,
}: {
  client: AgentChannelClient;
  /** Available models, undefined while the pill's mount fetch is in flight. */
  models: ModelOption[] | undefined;
  listError: string | undefined;
  onStatus: (status: AgentStatus) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Light-dismiss: pointer down anywhere outside the picker closes it.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  const filter = query.trim().toLowerCase();
  const filtered = (models ?? []).filter(
    (model) =>
      !filter ||
      model.provider.toLowerCase().includes(filter) ||
      model.id.toLowerCase().includes(filter) ||
      model.name.toLowerCase().includes(filter),
  );

  const select = async (model: ModelOption) => {
    try {
      const status = await client.requests.select_model({
        provider: model.provider,
        id: model.id,
      });
      onStatus(status);
      onClose();
    } catch (err) {
      setError(String(err));
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
      {(error ?? listError) ? (
        <span className="model-picker__note model-picker__note--error">
          {error ?? listError}
        </span>
      ) : models === undefined ? (
        <span className="model-picker__note">loading models…</span>
      ) : models.length === 0 ? (
        <span className="model-picker__note">
          No authenticated models found. Configure pi auth, then reload.
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
    </span>
  );
}
