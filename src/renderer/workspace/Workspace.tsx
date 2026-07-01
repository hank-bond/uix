// workspace surface composition.
//
// Renders surfaces declared in layout.ts. Each surface provides a render
// function; the workspace composes them into a CSS grid.

import { layout } from "./layout";

export function Workspace() {
  return (
    <div className="workspace">
      {layout.map(({ name, render }) => (
        <section
          key={name}
          className={`pane pane--${name}`}
          data-uix-pane={name}
          aria-label={name}
        >
          <header className="pane__header">{name}</header>
          <div className={`pane__body pane__body--${name}`}>{render()}</div>
        </section>
      ))}
    </div>
  );
}
