// Renders the shared pre-workspace launcher over host-provided catalog capabilities.

import type { JSX } from "react";
import { useEffect, useState } from "react";

import type {
  LauncherActionOutcome,
  LauncherAdapter,
  LauncherWorkspace,
} from "./adapter";

export function Launcher({
  adapter,
}: {
  adapter: LauncherAdapter;
}): JSX.Element {
  const [workspaces, setWorkspaces] = useState<
    readonly LauncherWorkspace[] | null
  >(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void adapter
      .listWorkspaces()
      .then((listed) => {
        if (alive) setWorkspaces(listed);
      })
      .catch(() => {
        if (alive) setWorkspaces([]);
      });
    return () => {
      alive = false;
    };
  }, [adapter]);

  const createWorkspace = adapter.createWorkspace;
  const act = async (
    operation: () => Promise<LauncherActionOutcome>,
  ): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      // Accepted means the host is transitioning. Canceled leaves this page live.
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="launcher">
      <header className="launcher__header">
        <h1>UIX</h1>
        <p>Open a workspace to begin.</p>
      </header>

      <section className="launcher__section">
        <h2>Recent</h2>
        {workspaces === null ? (
          <p className="launcher__empty">…</p>
        ) : workspaces.length === 0 ? (
          <p className="launcher__empty">No recent workspaces.</p>
        ) : (
          <ul className="launcher__recents">
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(() => adapter.openWorkspace(workspace.id))
                  }
                >
                  <span className="launcher__recent-name">
                    {workspace.name}
                  </span>
                  {workspace.description && (
                    <span className="launcher__recent-path">
                      {workspace.description}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {createWorkspace && (
        <section className="launcher__section">
          <h2>New workspace</h2>
          <form
            className="launcher__create"
            onSubmit={(event) => {
              event.preventDefault();
              void act(() => createWorkspace({ name }));
            }}
          >
            <input
              type="text"
              value={name}
              placeholder="Workspace name (defaults to folder name)"
              disabled={busy}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            <button type="submit" disabled={busy}>
              Choose folder…
            </button>
          </form>
          <p className="launcher__hint">
            Picking a folder that already contains a workspace opens it instead.
          </p>
        </section>
      )}

      {error && <p className="launcher__error">{error}</p>}
    </main>
  );
}
