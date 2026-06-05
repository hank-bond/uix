// UIX cockpit — anchored document channel (session state).
//
// Holds one AnchoredDocument per document id for the life of the agent session.
// The anchor<->line map inside each document is regenerable from content and is
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
  type AnchoredLine,
  AnchoredDocument,
} from "../anchors/document";

import type { ContentStore } from "./content-store";
import { canonicalizeFragment, canonicalizeHtml } from "./normalize";

export class DocumentChannel {
  readonly #store: ContentStore;
  readonly #docs = new Map<string, AnchoredDocument>();

  constructor(store: ContentStore) {
    this.#store = store;
  }

  // Read an optionally sliced anchored snapshot. Loads the document from the
  // store on first touch; never mutates or commits.
  async read(
    docId: string,
    start?: number,
    end?: number,
  ): Promise<readonly AnchoredLine[]> {
    const doc = await this.#load(docId);
    return doc.read(start, end);
  }

  // Clobber the document with a full authored HTML body and persist it. Returns
  // fresh anchored lines for the whole new document.
  async write(docId: string, html: string): Promise<readonly AnchoredLine[]> {
    const doc = await this.#load(docId);
    const lines = doc.write(canonicalizeHtml(html));
    await this.#store.commit(docId, plainText(lines));
    return lines;
  }

  // Replace an inclusive anchor range, preserving the anchors of unchanged
  // lines, and persist the result. Returns the changed hunks with fresh anchors
  // for the touched lines.
  async edit(
    docId: string,
    edit: AnchoredEdit,
  ): Promise<readonly AnchoredChange[]> {
    const doc = await this.#load(docId);
    const changes = doc.edit({
      ...edit,
      replacement: canonicalizeFragment(edit.replacement),
    });
    await this.#store.commit(docId, plainText(doc.read()));
    return changes;
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

function plainText(lines: readonly AnchoredLine[]): string {
  return lines.map((line) => line.text).join("\n");
}
