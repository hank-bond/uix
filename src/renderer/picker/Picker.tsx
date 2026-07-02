// start picker.
//
// Recents plus create-new over the substrate picker channels. A successful
// action means main is tearing this window down; the component only has to
// surface errors and dialog cancellations.

import { useEffect, useState } from "react";

import {
  Channels,
  type PickerActionResult,
  type PickerState,
  type RecentWorkspace,
} from "#shared/ipc";

export function Picker() {
  const [recents, setRecents] = useState<RecentWorkspace[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.channels
      .request(Channels.pickerState, undefined)
      .then((state) => setRecents((state as PickerState).recents))
      .catch(() => setRecents([]));
  }, []);

  const act = async (channel: string, payload: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const result = (await window.channels.request(
        channel,
        payload,
      )) as PickerActionResult;
      if (!result.ok && result.error) setError(result.error);
      // ok: main is transitioning; canceled: nothing to do.
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="picker">
      <header className="picker__header">
        <h1>UIX</h1>
        <p>Open a workspace to begin.</p>
      </header>

      <section className="picker__section">
        <h2>Recent</h2>
        {recents === null ? (
          <p className="picker__empty">…</p>
        ) : recents.length === 0 ? (
          <p className="picker__empty">No recent workspaces.</p>
        ) : (
          <ul className="picker__recents">
            {recents.map((recent) => (
              <li key={recent.manifestPath}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(Channels.pickerOpen, {
                      manifestPath: recent.manifestPath,
                    })
                  }
                >
                  <span className="picker__recent-name">{recent.name}</span>
                  <span className="picker__recent-path">
                    {recent.manifestPath}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="picker__section">
        <h2>New workspace</h2>
        <form
          className="picker__create"
          onSubmit={(e) => {
            e.preventDefault();
            void act(Channels.pickerCreate, { name });
          }}
        >
          <input
            type="text"
            value={name}
            placeholder="Workspace name (defaults to folder name)"
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" disabled={busy}>
            Choose folder…
          </button>
        </form>
        <p className="picker__hint">
          Picking a folder that already contains a workspace opens it instead.
        </p>
      </section>

      {error && <p className="picker__error">{error}</p>}
    </main>
  );
}
