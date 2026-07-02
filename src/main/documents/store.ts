// substrate document store.
//
// A document is addressed by namespace + id behind getCurrent/setCurrent; the
// backing store is hidden so it can later become a git-backed or remote store
// without touching feature-owned buffers above it.
//
// The type-only contract (DocumentStoreFactory, DocumentStore, DocumentVersion,
// DocumentStoreOptions) lives in @uix/api/documents and is re-exported
// here so existing call sites keep compiling. The local implementation
// (createLocalDocumentStoreFactory) satisfies those interfaces.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type {
  DocumentVersion,
  DocumentStore,
  DocumentStoreOptions,
  DocumentStoreFactory,
} from "@uix/api/documents";

import type {
  DocumentStore,
  DocumentVersion,
  DocumentStoreOptions,
  DocumentStoreFactory,
} from "@uix/api/documents";

export function createLocalDocumentStoreFactory(
  stateRoot: string,
): DocumentStoreFactory {
  return {
    createStore: (opts) => createLocalDocumentStore(stateRoot, opts),
  };
}

export function createLocalDocumentStore(
  stateRoot: string,
  opts: DocumentStoreOptions,
): DocumentStore {
  const extension = opts.extension ?? "txt";

  return {
    async getCurrent(documentId) {
      opts.validateDocumentId?.(documentId);
      try {
        return await readFile(
          currentPath(stateRoot, opts, documentId, extension),
          "utf8",
        );
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    async setCurrent(documentId, content) {
      opts.validateDocumentId?.(documentId);
      const path = currentPath(stateRoot, opts, documentId, extension);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
    },
    async snapshotCurrent<TMeta>(documentId: string, meta: TMeta) {
      opts.validateDocumentId?.(documentId);
      const content =
        (await readOptionalFile(
          currentPath(stateRoot, opts, documentId, extension),
        )) ?? "";
      const id = versionId(opts.namespace, documentId, content, meta);
      const path = versionPath(stateRoot, opts, documentId, id);
      try {
        const raw = await readFile(path, "utf8");
        return JSON.parse(raw) as DocumentVersion<TMeta>;
      } catch (err) {
        if (!isNotFound(err)) throw err;
      }
      const version: DocumentVersion<TMeta> = {
        id,
        documentId,
        content,
        meta,
        createdAt: new Date().toISOString(),
      };
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(version, null, 2), "utf8");
      return version;
    },
    async getVersion<TMeta>(documentId: string, versionId: string) {
      opts.validateDocumentId?.(documentId);
      assertVersionId(versionId);
      try {
        const raw = await readFile(
          versionPath(stateRoot, opts, documentId, versionId),
          "utf8",
        );
        return JSON.parse(raw) as DocumentVersion<TMeta>;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
  };
}

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

function documentRoot(stateRoot: string): string {
  return join(stateRoot, ".uix", "documents");
}

function currentPath(
  stateRoot: string,
  opts: DocumentStoreOptions,
  documentId: string,
  extension: string,
): string {
  return join(
    documentRoot(stateRoot),
    "current",
    opts.namespace,
    ...documentId.split("/"),
    `document.${extension}`,
  );
}

function versionPath(
  stateRoot: string,
  opts: DocumentStoreOptions,
  documentId: string,
  versionId: string,
): string {
  return join(
    documentRoot(stateRoot),
    "versions",
    opts.namespace,
    ...documentId.split("/"),
    `${versionId}.json`,
  );
}

function versionId(
  namespace: string,
  documentId: string,
  content: string,
  meta: unknown,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ namespace, documentId, content, meta }))
    .digest("hex");
}

function assertVersionId(versionId: string): void {
  if (!/^[a-f0-9]{64}$/.test(versionId)) {
    throw new Error(`Invalid document version id: ${versionId}`);
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
