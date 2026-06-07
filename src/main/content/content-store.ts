// UIX cockpit — content-store seam for anchored documents.
//
// A document is addressed by id behind getCurrent/commit; the backing store is
// hidden so it can later become a versioned or remote store without touching the
// channel above it. The only backing today is the local canvas files the
// canvas:// protocol already serves.

import { assertCanvasKey } from "../../shared/canvas";

import { readCanvas, writeCanvas } from "../canvas/store";

export interface ContentStore {
  // Current plain content for a document, or null if it does not exist yet.
  getCurrent(docId: string): Promise<string | null>;
  // Replace the current content. Single-version today: no history is kept.
  commit(docId: string, content: string): Promise<void>;
}

// Single-version store mapping document ids onto the canvas files the canvas://
// protocol reads. A docId is a canvas key here, so commits land exactly where
// the protocol serves from and the pane reflects committed content. Bound to the
// workspace state root so canvases stay put across a worktree shift.
export function createCanvasContentStore(stateRoot: string): ContentStore {
  return {
    async getCurrent(docId) {
      assertCanvasKey(docId);
      return readCanvas(stateRoot, docId);
    },
    async commit(docId, content) {
      assertCanvasKey(docId);
      await writeCanvas(stateRoot, docId, content);
    },
  };
}
