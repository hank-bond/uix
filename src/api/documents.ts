// document store contract.
//
// Type-only definition of the document-store seam. Features declare their
// dependency on DocumentStoreFactory through FeatureContext.documents; the
// cockpit binds the local filesystem implementation (src/main/documents/store.ts)
// at activation time without features importing any Node.js or Electron APIs.

export interface DocumentVersion<TMeta = unknown> {
  readonly id: string;
  readonly documentId: string;
  readonly content: string;
  readonly meta: TMeta;
  readonly createdAt: string;
}

export interface DocumentStore {
  /** Current plain content for a document, or null if it does not exist yet. */
  getCurrent(documentId: string): Promise<string | null>;
  /** Replace the current mutable latest content. */
  setCurrent(documentId: string, content: string): Promise<void>;
  /** Persist the current content plus caller-owned metadata as an immutable version. */
  createSnapshot<TMeta>(
    documentId: string,
    meta: TMeta,
  ): Promise<DocumentVersion<TMeta>>;
  /** Load a previously created immutable version, or null when absent. */
  getVersion<TMeta>(
    documentId: string,
    versionId: string,
  ): Promise<DocumentVersion<TMeta> | null>;
}

export interface DocumentStoreOptions {
  namespace: string;
  extension?: string;
  validateDocumentId?: (documentId: string) => void;
}

export interface DocumentStoreFactory {
  createStore(opts: DocumentStoreOptions): DocumentStore;
}
