// canvas document buffer (session state).
//
// Holds one AnchoredDocument per canvas document id for the activated Canvas
// feature generation. The anchor<->line map inside each document is regenerable from content and is
// never persisted (so the filesystem stays non-load-bearing): a document is
// (re)built by canonicalizing the store's current content the first time the
// session touches it.
//
// All three operations keep the canonical-form invariant by normalizing content
// before it reaches the core, and persist *plain* (un-anchored) content back to
// the store — anchors are an agent-facing wire detail, not stored state.

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
  readonly #documentOperations = new Map<string, Promise<void>>();

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
    return this.#runDocumentOperation(docId, async () => {
      await this.#sync(docId);
      const doc = await this.#load(docId);
      return doc.read(start, end);
    });
  }

  // Clobber the document with a full authored HTML body and persist it. Returns
  // fresh anchored lines for the whole new document.
  async write(docId: string, html: string): Promise<readonly AnchoredLine[]> {
    return this.#runDocumentOperation(docId, async () => {
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
    await this.#runDocumentOperation(docId, async () => {
      const canonical = canonicalizeHtml(html);
      const doc = this.#docs.get(docId);
      if (!doc) {
        await this.#store.setCurrent(docId, canonical);
        return;
      }

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
    return this.#runDocumentOperation(docId, async () => {
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

  // Persist current content plus the exact anchor state as immutable versions.
  // Callers pass the document ids that are durable at this run boundary (open
  // canvases today; dynamic pane ids once the pane host lands).
  async snapshotCurrent(
    docIds: Iterable<string>,
  ): Promise<ReadonlyMap<string, DocumentVersion<DocumentVersionMeta>>> {
    const result = new Map<string, DocumentVersion<DocumentVersionMeta>>();
    for (const docId of new Set(docIds)) {
      await this.#runDocumentOperation(docId, async () => {
        await this.#sync(docId);
        const doc = await this.#load(docId);
        // Make the mutable latest byte-match the anchor state we are about to
        // store. This canonicalizes cosmetic iframe/file rewrites at the
        // durable boundary instead of snapshotting content/meta that disagree.
        await this.#store.setCurrent(docId, plainText(doc.read()));
        result.set(
          docId,
          await this.#store.snapshotCurrent<DocumentVersionMeta>(docId, {
            anchors: doc.toSnapshot(),
          }),
        );
      });
    }
    return result;
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

  #runDocumentOperation<T>(
    docId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.#documentOperations.get(docId) ?? Promise.resolve();
    const result = previous.then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.#documentOperations.set(docId, tail);
    void tail.then(() => {
      if (this.#documentOperations.get(docId) === tail) {
        this.#documentOperations.delete(docId);
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
