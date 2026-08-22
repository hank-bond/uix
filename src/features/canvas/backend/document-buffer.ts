// Holds one Agent viewpoint's Canvas HTML, anchors, and immutable version operations.
//
// Each Agent factory creates one buffer. Mutable HTML and anchors remain local
// to that instance. Turn-state commits persist plain HTML and exact anchor state
// as immutable document versions, and restoration rebuilds the local projection.

import type { DocumentStore, DocumentVersion } from "@uix/api/documents";

import {
  type AnchoredChange,
  AnchoredDocument,
  type AnchoredDocumentSnapshot,
  type AnchoredEdit,
  type AnchoredLine,
  diffAnchoredSnapshots,
} from "./anchors/document";
import { canonicalizeHtml } from "./normalize";

export interface DocumentVersionMeta {
  readonly anchors: AnchoredDocumentSnapshot;
}

export class CanvasDocumentBuffer implements Disposable {
  readonly #store: DocumentStore;
  readonly #docs = new Map<string, AnchoredDocument>();
  readonly #documentOperationQueues = new Map<string, Promise<void>>();

  constructor(store: DocumentStore) {
    this.#store = store;
  }

  async read(
    docId: string,
    start?: number,
    end?: number,
  ): Promise<readonly AnchoredLine[]> {
    return this.#enqueueDocumentOperation(docId, async () => {
      const doc = await this.#load(docId);
      return doc.read(start, end);
    });
  }

  // Replace the viewpoint document with a full authored HTML body.
  async write(docId: string, html: string): Promise<readonly AnchoredLine[]> {
    return this.#enqueueDocumentOperation(docId, async () => {
      const doc = await this.#load(docId);
      const lines = doc.write(canonicalizeHtml(html));
      await this.#store.setCurrent(docId, plainText(lines));
      return lines;
    });
  }

  // Apply a pane-originated whole-document writeback. If the agent has an
  // active anchor projection for this document, reconcile instead of clobbering
  // so later snapshot diffs can keep stable anchored hunks.
  async writeback(docId: string, html: string): Promise<void> {
    await this.#enqueueDocumentOperation(docId, async () => {
      const canonical = canonicalizeHtml(html);
      const doc = await this.#load(docId);
      doc.reconcile(canonical);
      await this.#store.setCurrent(docId, plainText(doc.read()));
    });
  }

  // The boundary match guard rejects an edit against stale anchored text.
  //
  // The buffer splices replacement text first, then canonicalizes the
  // resulting whole document. Canonicalizing the replacement as a standalone fragment is
  // not equivalent for HTML: a replacement like
  // `<option>…</option>\n</select>` is valid in document context when replacing
  // a `</select>` line, but a fragment parser drops the unmatched closing tag.
  async edit(
    docId: string,
    edit: AnchoredEdit,
  ): Promise<readonly AnchoredChange[]> {
    return this.#enqueueDocumentOperation(docId, async () => {
      const doc = await this.#load(docId);
      const currentLines = doc.read();
      const { startIndex, endIndex } = findMatchingRange(currentLines, edit);
      const replacementLines = splitText(edit.replacement);
      const nextText = [
        ...currentLines.slice(0, startIndex).map((line) => line.text),
        ...replacementLines,
        ...currentLines.slice(endIndex + 1).map((line) => line.text),
      ].join("\n");
      const changes = doc.reconcile(canonicalizeHtml(nextText));
      await this.#store.setCurrent(docId, plainText(doc.read()));
      return changes;
    });
  }

  // Persist current content plus exact anchor state for the working documents
  // that should be durable at this run boundary.
  async createSnapshots(
    docIds: Iterable<string>,
  ): Promise<ReadonlyMap<string, DocumentVersion<DocumentVersionMeta>>> {
    const result = new Map<string, DocumentVersion<DocumentVersionMeta>>();
    for (const docId of new Set(docIds)) {
      await this.#enqueueDocumentOperation(docId, async () => {
        const doc = await this.#load(docId);
        const content = plainText(doc.read());
        await this.#store.setCurrent(docId, content);
        result.set(
          docId,
          await this.#store.createSnapshot<DocumentVersionMeta>(
            docId,
            content,
            { anchors: doc.toSnapshot() },
          ),
        );
      });
    }
    return result;
  }

  listLoadedDocumentIds(): readonly string[] {
    return [...this.#docs.keys()];
  }

  async restoreVersions(
    versions: ReadonlyMap<string, string>,
  ): Promise<readonly string[]> {
    const targetIds = new Set(versions.keys());
    const resetDocumentIds = [...this.#docs.keys()].filter(
      (docId) => !targetIds.has(docId),
    );
    const affectedDocumentIds: string[] = [];

    for (const [docId, versionId] of versions) {
      await this.#enqueueDocumentOperation(docId, async () => {
        const version = await this.#requireVersion(docId, versionId);
        const restored = new AnchoredDocument(version.meta.anchors);
        const restoredContent = plainText(restored.read());
        if (restoredContent !== canonicalizeHtml(version.content)) {
          throw new Error(
            `Canvas document version content does not match its anchor state: ${docId}@${versionId}`,
          );
        }
        await this.#store.setCurrent(docId, restoredContent);
        this.#docs.set(docId, restored);
        affectedDocumentIds.push(docId);
      });
    }

    for (const docId of resetDocumentIds) {
      await this.#enqueueDocumentOperation(docId, async () => {
        await this.#store.setCurrent(docId, "");
        this.#docs.delete(docId);
        affectedDocumentIds.push(docId);
      });
    }

    return affectedDocumentIds;
  }

  async diffVersions(
    docId: string,
    fromVersionId: string,
    toVersionId: string,
  ): Promise<readonly AnchoredChange[]> {
    const from = await this.#requireVersion(docId, fromVersionId);
    const to = await this.#requireVersion(docId, toVersionId);
    return diffAnchoredSnapshots(from.meta.anchors, to.meta.anchors);
  }

  readHtml(docId: string): Promise<string> {
    return this.#enqueueDocumentOperation(docId, async () => {
      const document = this.#docs.get(docId);
      if (document) return plainText(document.read());
      return canonicalizeHtml((await this.#store.getCurrent(docId)) ?? "");
    });
  }

  async #requireVersion(
    docId: string,
    versionId: string,
  ): Promise<DocumentVersion<DocumentVersionMeta>> {
    const version = await this.#store.getVersion<DocumentVersionMeta>(
      docId,
      versionId,
    );
    if (!version) {
      throw new Error(
        `Canvas document version not found: ${docId}@${versionId}`,
      );
    }
    return version;
  }

  #enqueueDocumentOperation<T>(
    docId: string,
    operation: () => T | PromiseLike<T>,
  ): Promise<T> {
    const previous =
      this.#documentOperationQueues.get(docId) ?? Promise.resolve();
    const result = previous.then(operation);
    const completion = result.then(
      () => undefined,
      () => undefined,
    );
    this.#documentOperationQueues.set(docId, completion);
    void completion.then(() => {
      if (this.#documentOperationQueues.get(docId) === completion) {
        this.#documentOperationQueues.delete(docId);
      }
    });
    return result;
  }

  async #load(docId: string): Promise<AnchoredDocument> {
    let doc = this.#docs.get(docId);
    if (!doc) {
      doc = new AnchoredDocument(
        canonicalizeHtml((await this.#store.getCurrent(docId)) ?? ""),
      );
      this.#docs.set(docId, doc);
    }
    return doc;
  }

  [Symbol.dispose](): void {
    this.#docs.clear();
    this.#documentOperationQueues.clear();
  }
}

function findMatchingRange(
  lines: readonly AnchoredLine[],
  edit: AnchoredEdit,
): { readonly startIndex: number; readonly endIndex: number } {
  const startIndex = findMatchingLine(lines, edit.start);
  const endIndex = findMatchingLine(lines, edit.end);
  if (endIndex < startIndex) {
    throw new Error(
      `Invalid anchor range: ${edit.start.anchor} does not precede ${edit.end.anchor}`,
    );
  }
  return { startIndex, endIndex };
}

function findMatchingLine(
  lines: readonly AnchoredLine[],
  target: AnchoredLine,
): number {
  const index = lines.findIndex((line) => line.anchor === target.anchor);
  if (index === -1) throw new Error(`Unknown anchor: ${target.anchor}`);
  const live = lines[index];
  if (live.text !== target.text) {
    throw new Error(
      `Anchor ${target.anchor} text mismatch: document has ${JSON.stringify(
        live.text,
      )} but edit referenced ${JSON.stringify(target.text)}`,
    );
  }
  return index;
}

function plainText(lines: readonly AnchoredLine[]): string {
  return lines.map((line) => line.text).join("\n");
}

function splitText(text: string): readonly string[] {
  if (text === "") return [];
  return text.split("\n");
}
