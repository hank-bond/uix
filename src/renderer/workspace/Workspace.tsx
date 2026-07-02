// workspace surface composition.
//
// Renders surfaces declared in layout.ts. Each surface provides a render
// function; the workspace composes them into a CSS grid. Channel clients
// are created by SurfaceMount, not by feature code.

import { layout, SurfaceMount } from "./layout";

export function Workspace() {
  return (
    <div className="workspace">
      {layout.map((surface) => (
        <section
          key={surface.name}
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
