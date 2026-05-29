// Trellis cockpit — top-level layout.
//
// Two panes, side by side: the conversation (left, live) and the canvas
// (right, still placeholder). The layout itself is plain CSS grid in
// styles.css so we don't take on a styling system before we need one.

import { Conversation } from "./Conversation";

export function App() {
  return (
    <div className="cockpit">
      <section className="pane pane--conversation" aria-label="Conversation">
        <header className="pane__header">conversation</header>
        <div className="pane__body pane__body--conversation">
          <Conversation />
        </div>
      </section>
      <section className="pane pane--canvas" aria-label="Canvas">
        <header className="pane__header">canvas</header>
        <div className="pane__body pane__body--placeholder">
          .trellis/canvas/main.html will render here
        </div>
      </section>
    </div>
  );
}
