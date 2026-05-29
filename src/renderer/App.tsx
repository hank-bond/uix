// Trellis cockpit — top-level layout.
//
// Two panes, side by side: the conversation (left) and the canvas (right).
// Both are placeholders for now. Wiring lands in later commits:
//   - conversation: milestone 2 (pi runtime + IPC)
//   - canvas:       milestone 4 (file watcher + sandboxed iframe)
//
// The layout itself is intentionally trivial CSS grid in styles.css so we
// don't take on a styling system before we know what we need.
export function App() {
  return (
    <div className="cockpit">
      <section className="pane pane--conversation" aria-label="Conversation">
        <header className="pane__header">conversation</header>
        <div className="pane__body pane__body--placeholder">
          pi events will stream here
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
