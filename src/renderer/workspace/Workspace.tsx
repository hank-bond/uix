// workspace surface composition.
//
// Renders the composed surface list from useSurfaces(). Each surface
// provides a render function; the workspace composes them into a CSS grid.
// Channel clients are created by SurfaceMount, not by feature code. An
// empty composition renders an explanatory card instead of a blank window —
// which of the two empty states (no manifest vs. no surfaces) it names, so
// the create-manifest-after-boot flow is visible instead of dark.

import type { ReactNode } from "react";

import {
  useRuntimeSurface,
  useSurfaces,
  type SurfaceComposition,
} from "./layout";
import type { SurfaceEntry } from "#shared/ipc";

export function Workspace() {
  const composition = useSurfaces();
  // Not yet fetched — render the bare shell, no empty-state flash.
  if (!composition) return <div className="workspace" />;
  return (
    <div className="workspace">
      {composition.surfaces.length === 0 ? (
        <EmptyWorkspaceCard composition={composition} />
      ) : (
        composition.surfaces.map((entry, i) => (
          <RuntimeSurfacePane
            // The URL is content-hashed, so it doubles as the remount key: a
            // reload that changed the module remounts, an unchanged one doesn't.
            key={entry.url ?? `${entry.featureId}:${String(i)}`}
            entry={entry}
          />
        ))
      )}
    </div>
  );
}

function EmptyWorkspaceCard({
  composition,
}: {
  composition: SurfaceComposition;
}) {
  return (
    <div className="workspace-empty">
      <p className="workspace-empty__title">
        {composition.manifestFound
          ? "No feature surfaces in this workspace"
          : "This folder has no workspace manifest"}
      </p>
      <p className="workspace-empty__detail">
        {composition.manifestFound
          ? "The manifest loaded no surface contributions — add feature entries (or check the logs for failed features), then reload."
          : "Create the manifest listing feature entry files, then reload."}
      </p>
      <p className="workspace-empty__path">
        <code>{composition.manifestPath}</code>
      </p>
    </div>
  );
}

function SurfacePane({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`pane pane--${name}`}
      data-uix-pane={name}
      aria-label={name}
    >
      <header className="pane__header">{name}</header>
      <div className={`pane__body pane__body--${name}`}>{children}</div>
    </section>
  );
}

function RuntimeSurfacePane({ entry }: { entry: SurfaceEntry }) {
  const { name, body } = useRuntimeSurface(entry);
  return <SurfacePane name={name}>{body}</SurfacePane>;
}
