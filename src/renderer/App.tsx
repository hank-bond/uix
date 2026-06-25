// top-level layout.
//
// Two panes, side by side: the chat (left, live) and the canvas
// (right, hardcoded Stage-1 iframe). The layout itself is plain CSS grid in
// styles.css so we don't take on a styling system before we need one.

import { parseCanvasKey } from "#features/canvas/shared/addressing";
import { Canvas } from "#features/canvas/workspace/Canvas";
import { Chat } from "./chat/Chat";
import { useWorkspaceClient } from "./workspace/context";

const MainCanvasKey = parseCanvasKey("main");

export function App() {
  const workspace = useWorkspaceClient();

  return (
    <div className="cockpit">
      <section
        className="pane pane--chat"
        data-uix-pane="chat"
        aria-label="Chat"
      >
        <header className="pane__header">chat</header>
        <div className="pane__body pane__body--chat">
          <Chat />
        </div>
      </section>
      <section className="pane pane--canvas" aria-label="Canvas">
        <header className="pane__header">canvas</header>
        <div className="pane__body pane__body--canvas">
          <Canvas canvasKey={MainCanvasKey} workspace={workspace} />
        </div>
      </section>
    </div>
  );
}
