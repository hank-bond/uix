// workspace surface composition.
//
// Renders the composed surface list from useSurfaces(). Each surface
// provides a render function; the workspace composes them into a CSS grid.
// Channel clients are created by SurfaceMount, not by feature code.

import type { ReactNode } from "react";

import { useRuntimeSurface, useSurfaces } from "./layout";
import type { SurfaceEntry } from "#shared/ipc";

export function Workspace() {
  const surfaces = useSurfaces();
  return (
    <div className="workspace">
      {surfaces.map((entry, i) => (
        <RuntimeSurfacePane
          // The URL is content-hashed, so it doubles as the remount key: a
          // reload that changed the module remounts, an unchanged one doesn't.
          key={entry.url ?? `${entry.featureId}:${String(i)}`}
          entry={entry}
        />
      ))}
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
