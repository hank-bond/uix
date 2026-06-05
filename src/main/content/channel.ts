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

  // Syncs to the store first so a read never returns content a human edit has
  // superseded.
  async read(
    docId: string,
    start?: number,
    end?: number,
  ): Promise<readonly AnchoredLine[]> {
    await this.#sync(docId);
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

  // Syncs to the store first: an edit computed against a stale cache would
  // re-commit the agent's whole view and silently revert a concurrent human edit
  // to an untouched line. If the human touched the line being edited, the core's
  // match-guard rejects it.
  async edit(
    docId: string,
    edit: AnchoredEdit,
  ): Promise<readonly AnchoredChange[]> {
    await this.#sync(docId);
    const doc = await this.#load(docId);
    const changes = doc.edit({
      ...edit,
      replacement: canonicalizeFragment(edit.replacement),
    });
    await this.#store.commit(docId, plainText(doc.read()));
    return changes;
  }

  // Drives the per-turn context injection (see content/binding.ts). Only
  // touched documents are in scope: the agent has no anchors for the rest and
  // reads them fresh when needed.
  async collectChanges(): Promise<
    ReadonlyMap<string, readonly AnchoredChange[]>
  > {
    const result = new Map<string, readonly AnchoredChange[]>();
    for (const docId of this.#docs.keys()) {
      const changes = await this.#sync(docId);
      if (changes.length) result.set(docId, changes);
    }
    return result;
  }

  // No commit — the content came *from* the store. Returns [] when already in
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
