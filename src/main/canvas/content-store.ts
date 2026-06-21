// UIX cockpit — content-store seam for canvas documents.
//
// A document is addressed by id behind getCurrent/setCurrent; the backing store
// is hidden so it can later become a versioned or remote store without touching
// the canvas document buffer above it. The only backing today is the local
// canvas files the canvas:// protocol already serves.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { assertCanvasKey } from "../../shared/canvas";

import { readCanvas, writeCanvas } from "../canvas/store";

export interface ContentVersion<TMeta = unknown> {
  readonly id: string;
  readonly docId: string;
  readonly content: string;
  readonly meta: TMeta;
  readonly createdAt: string;
}

export interface ContentStore {
  // Current plain content for a document, or null if it does not exist yet.
  getCurrent(docId: string): Promise<string | null>;
  // Replace the current mutable latest content.
  setCurrent(docId: string, content: string): Promise<void>;
  // Persist the current content plus caller-owned metadata as an immutable version.
  snapshotCurrent<TMeta>(
    docId: string,
    meta: TMeta,
  ): Promise<ContentVersion<TMeta>>;
  // Load a previously snapshotted immutable version, or null when absent.
  getVersion<TMeta>(
    docId: string,
    versionId: string,
  ): Promise<ContentVersion<TMeta> | null>;
}

// Mutable-latest plus immutable snapshots over the local canvas files the
// canvas:// protocol reads. A docId is a canvas key here, so current writes land
// exactly where the protocol serves from and the pane reflects current content. Snapshots live beside the latest files under .uix; this simple JSON
// object store is the C2 seam that a git-backed store can replace later.
export function createCanvasContentStore(stateRoot: string): ContentStore {
  return {
    async getCurrent(docId) {
      assertCanvasKey(docId);
      return readCanvas(stateRoot, docId);
    },
    async setCurrent(docId, content) {
      assertCanvasKey(docId);
      await writeCanvas(stateRoot, docId, content);
    },
    async snapshotCurrent<TMeta>(docId: string, meta: TMeta) {
      assertCanvasKey(docId);
      const content = (await readCanvas(stateRoot, docId)) ?? "";
      const id = versionId(docId, content, meta);
      const path = versionPath(stateRoot, docId, id);
      try {
        const raw = await readFile(path, "utf8");
        return JSON.parse(raw) as ContentVersion<TMeta>;
      } catch (err) {
        if (!isNotFound(err)) throw err;
      }
      const version: ContentVersion<TMeta> = {
        id,
        docId,
        content,
        meta,
        createdAt: new Date().toISOString(),
      };
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(version, null, 2), "utf8");
      return version;
    },
    async getVersion<TMeta>(docId: string, versionId: string) {
      assertCanvasKey(docId);
      assertVersionId(versionId);
      try {
        const raw = await readFile(
          versionPath(stateRoot, docId, versionId),
          "utf8",
        );
        return JSON.parse(raw) as ContentVersion<TMeta>;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
  };
}

function versionRoot(stateRoot: string): string {
  return join(stateRoot, ".uix", "canvas-versions");
}

function versionPath(
  stateRoot: string,
  docId: string,
  versionId: string,
): string {
  return join(versionRoot(stateRoot), ...docId.split("/"), `${versionId}.json`);
}

function versionId(docId: string, content: string, meta: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify({ docId, content, meta }))
    .digest("hex");
}

function assertVersionId(versionId: string): void {
  if (!/^[a-f0-9]{64}$/.test(versionId)) {
    throw new Error(`Invalid content version id: ${versionId}`);
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}
