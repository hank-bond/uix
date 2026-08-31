// Bridges accepted shared-client sessions with host-owned browser locations.

/** Reflects accepted session changes in host navigation and routes host navigation back into session selection. */
export interface SessionLocationAdapter {
  /** Idempotently reflect an accepted client session in the host location. */
  readonly synchronize: (sessionId: string) => void;
  /** Route host-location navigation through the shared session controller. */
  readonly subscribe: (
    navigate: (sessionId: string) => Promise<void>,
  ) => () => void;
}
