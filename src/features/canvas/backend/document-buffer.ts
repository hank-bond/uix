// canvas document buffer (session state).
//
// Holds one AnchoredDocument per canvas document id touched by the activated
// Canvas feature generation. Mutable current content stays plain HTML; immutable
// versions persist exact anchor state so turn-state restoration can recreate the
// working projection without renumbering historical anchors.
//
// Operations keep the canonical-form invariant by normalizing content before it
// reaches the core and persisting plain, un-anchored HTML as current content.

import {
  type AnchoredChange,
  type AnchoredEdit,
  type AnchoredDocumentSnapshot,
  type AnchoredLine,
  AnchoredDocument,
  diffAnchoredSnapshots,
} from "./anchors/document";

import type { DocumentStore, DocumentVersion } from "@uix/api/documents";
import { canonicalizeHtml } from "./normalize";

export interface DocumentVersionMeta {
  readonly anchors: AnchoredDocumentSnapshot;
}

export class CanvasDocumentBuffer {
  readonly #store: DocumentStore;
  readonly #docs = new Map<string, AnchoredDocument>();
  readonly #documentOperationQueues = new Map<string, Promise<void>>();

  constructor(store: DocumentStore) {
    this.#store = store;
  }

  // Syncs to the store first so a read never returns content a human edit has
  // superseded.
  async read(
    docId: string,
    start?: number,
    end?: number,
  ): Promise<readonly AnchoredLine[]> {
    return this.#enqueueDocumentOperation(docId, async () => {
      await this.#sync(docId);
      const doc = await this.#load(docId);
      return doc.read(start, end);
    });
  }

  // Clobber the document with a full authored HTML body and persist it. Returns
  // fresh anchored lines for the whole new document.
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

  // Syncs to the store first: an edit computed against a stale cache would
  // re-save the agent's whole view and silently revert a concurrent human edit
  // to an untouched line. If the human touched the line being edited, the
  // boundary match-guard rejects it.
  //
  // Replacement text is spliced first and the resulting whole document is then
  // canonicalized. Canonicalizing the replacement as a standalone fragment is
  // not equivalent for HTML: a replacement like
  // `<option>…</option>\n</select>` is valid in document context when replacing
  // a `</select>` line, but a fragment parser drops the unmatched closing tag.
  async edit(
    docId: string,
    edit: AnchoredEdit,
  ): Promise<readonly AnchoredChange[]> {
    return this.#enqueueDocumentOperation(docId, async () => {
      await this.#sync(docId);
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
        await this.#sync(docId);
        const doc = await this.#load(docId);
        // Make the mutable latest byte-match the anchor state we are about to
        // store. This canonicalizes cosmetic iframe/file rewrites at the
        // durable boundary instead of creating a snapshot whose content and metadata disagree.
        await this.#store.setCurrent(docId, plainText(doc.read()));
        result.set(
          docId,
          await this.#store.createSnapshot<DocumentVersionMeta>(docId, {
            anchors: doc.toSnapshot(),
          }),
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

  // No setCurrent — the content came *from* the store. Returns [] when already in
  // sync, so it is cheap to call on every read/edit. Canonicalizing before the
  // compare keeps a human's non-canonical HTML from registering as a spurious
  // diff.
  async #sync(docId: string): Promise<readonly AnchoredChange[]> {
    const doc = await this.#load(docId);
    const current = await this.#store.getCurrent(docId);
    const canonical = current === null ? "" : canonicalizeHtml(current);
    if (plainText(doc.read()) === canonical) return [];
    return doc.reconcile(canonical);
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
    operation: () => Promise<T>,
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
      const current = await this.#store.getCurrent(docId);
      doc = new AnchoredDocument(
        current === null ? "" : canonicalizeHtml(current),
      );
      this.#docs.set(docId, doc);
    }
    return doc;
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
