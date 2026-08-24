// Document store contract.
//
// Features receive this factory through their context. Workspace factories use
// Workspace current bytes. Agent factories use viewpoint-scoped current bytes
// while immutable versions remain shared. Features never import storage or host
// implementations.

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
  /** Persist caller-owned content and metadata as an immutable version. */
  createSnapshot<TMeta>(
    documentId: string,
    content: string,
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
