// Captures each read's bytes and image type under Pi's shared file-mutation queue.

import type { Buffer } from "node:buffer";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";

import {
  detectSupportedImageMimeTypeFromFile,
  type ReadOperations,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";

interface ReadSnapshot {
  bytes: Buffer;
  mimeType: string | null;
}

/** Create fresh operations for one Pi read execution; never reuse across calls. */
export function createQueuedReadOperations(
  signal: AbortSignal | undefined,
): ReadOperations {
  let snapshot: ReadSnapshot | undefined;

  function getSnapshot(): ReadSnapshot {
    if (!snapshot)
      throw new Error("Read snapshot requested before access completed");
    return snapshot;
  }

  return {
    async access(absolutePath) {
      // Pi resolves its path aliases before calling access. Capture both MIME
      // and bytes in one turn so a mutation cannot separate the two reads.
      snapshot = await withFileMutationQueue(absolutePath, async () => {
        signal?.throwIfAborted();
        await access(absolutePath, constants.R_OK);
        signal?.throwIfAborted();
        const mimeType =
          await detectSupportedImageMimeTypeFromFile(absolutePath);
        signal?.throwIfAborted();
        // Pi may report cancellation immediately, but this queue callback must
        // retain its turn until the actual filesystem operation has settled.
        const bytes = await readFile(absolutePath);
        signal?.throwIfAborted();
        return { bytes, mimeType };
      });
    },
    detectImageMimeType: () => Promise.resolve(getSnapshot().mimeType),
    readFile: () => Promise.resolve(getSnapshot().bytes),
  };
}
