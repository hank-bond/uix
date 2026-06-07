// UIX cockpit — content-store seam for anchored documents.
//
// A document is addressed by id behind getCurrent/commit; the backing store is
// hidden so it can later become a versioned or remote store without touching the
// channel above it (see docs/design/pane-and-file-versioning.md). The first cut
// is the trivial single-version store below, backed by the local canvas files
// the canvas:// protocol already serves. A `diff` method and commit metadata
// join this seam when human writeback and versioning land — not before (we don't
// grow the interface ahead of a caller).

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
