// workspace surface layout.
//
// Hardcoded two-column grid — chat on the left, canvas on the right. This
// layout moves into the Workspace iframe at W3 and becomes a surface
// composition at W4–W5.

import { parseCanvasKey } from "#features/canvas/shared/addressing";
import { Canvas } from "#features/canvas/workspace/Canvas";
import { Chat } from "#features/chat/workspace/Chat";
import { useWorkspaceClient } from "./context";

const MainCanvasKey = parseCanvasKey("main");

export function Workspace() {
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
