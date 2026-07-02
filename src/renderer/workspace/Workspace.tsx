// workspace surface composition.
//
// Renders the composed surface list from useSurfaces(). Each surface
// provides a render function; the workspace composes them into a CSS grid.
// Channel clients are created by SurfaceMount, not by feature code.

import { useSurfaces, SurfaceMount } from "./layout";

export function Workspace() {
  const surfaces = useSurfaces();
  return (
    <div className="workspace">
      {surfaces.map((surface, i) => (
        <section
          key={`${surface.name}:${String(i)}`}
          className={`pane pane--${surface.name}`}
          data-uix-pane={surface.name}
          aria-label={surface.name}
        >
          <header className="pane__header">{surface.name}</header>
          <div className={`pane__body pane__body--${surface.name}`}>
            <SurfaceMount surface={surface} />
          </div>
        </section>
      ))}
    </div>
  );
}
