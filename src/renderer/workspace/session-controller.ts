import type {
  AgentEvent,
  SessionHistoryResponse,
  SessionSummary,
  TranscriptSnapshot,
} from "@uix/api/agent-channels";

interface WorkspaceSessionControllerOptions {
  requestActiveHistory: () => Promise<SessionHistoryResponse>;
  requestRecentSessions: () => Promise<SessionSummary[]>;
  requestNewSession: () => Promise<SessionSummary>;
  requestSwitchSession: (sessionId: string) => Promise<SessionSummary>;
}

interface WorkspaceSessionSnapshot {
  readonly activeSession: SessionSummary | undefined;
  readonly recentSessions: readonly SessionSummary[] | undefined;
  readonly sessionSelectionVersion: number;
  readonly isAgentRunning: boolean;
  readonly isSessionMutationPending: boolean;
  readonly canSwitchSession: boolean;
}

type Listener = () => void;

/** Renderer owner for the active-session projection and session mutations. */
export class WorkspaceSessionController {
  readonly #requestActiveHistory: () => Promise<SessionHistoryResponse>;
  readonly #requestRecentSessions: () => Promise<SessionSummary[]>;
  readonly #requestNewSession: () => Promise<SessionSummary>;
  readonly #requestSwitchSession: (
    sessionId: string,
  ) => Promise<SessionSummary>;
  readonly #listeners = new Set<Listener>();
  #snapshot: WorkspaceSessionSnapshot = {
    activeSession: undefined,
    recentSessions: undefined,
    sessionSelectionVersion: 0,
    isAgentRunning: false,
    isSessionMutationPending: false,
    canSwitchSession: true,
  };
  #recentSessionsRequestVersion = 0;
  #inFlightActiveHistory:
    | {
        sessionSelectionVersion: number;
        promise: Promise<SessionHistoryResponse>;
      }
    | undefined;

  constructor(opts: WorkspaceSessionControllerOptions) {
    this.#requestActiveHistory = opts.requestActiveHistory;
    this.#requestRecentSessions = opts.requestRecentSessions;
    this.#requestNewSession = opts.requestNewSession;
    this.#requestSwitchSession = opts.requestSwitchSession;
  }

  getSnapshot = (): WorkspaceSessionSnapshot => this.#snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  isAgentRunning(): boolean {
    return this.#snapshot.isAgentRunning;
  }

  canSwitchSession(): boolean {
    return this.#snapshot.canSwitchSession;
  }

  updateAgentActivity(event: AgentEvent): void {
    let isAgentRunning = this.#snapshot.isAgentRunning;
    if (event.type === "agent_start") isAgentRunning = true;
    if (event.type === "agent_end") isAgentRunning = false;
    if (isAgentRunning === this.#snapshot.isAgentRunning) return;
    this.#publish({ isAgentRunning });
  }

  loadActiveHistory(): Promise<TranscriptSnapshot> {
    const { sessionSelectionVersion } = this.#snapshot;
    const existing = this.#inFlightActiveHistory;
    if (existing?.sessionSelectionVersion === sessionSelectionVersion) {
      return existing.promise.then(({ transcript }) => transcript);
    }

    const promise = this.#requestActiveHistory()
      .then((result) => {
        if (
          sessionSelectionVersion === this.#snapshot.sessionSelectionVersion
        ) {
          this.#publish({ activeSession: result.session });
        }
        return result;
      })
      .finally(() => {
        if (this.#inFlightActiveHistory?.promise === promise) {
          this.#inFlightActiveHistory = undefined;
        }
      });
    this.#inFlightActiveHistory = { sessionSelectionVersion, promise };
    return promise.then(({ transcript }) => transcript);
  }

  async loadRecentSessions(): Promise<readonly SessionSummary[]> {
    const requestVersion = ++this.#recentSessionsRequestVersion;
    const sessions = await this.#requestRecentSessions();
    if (requestVersion === this.#recentSessionsRequestVersion) {
      this.#publish({ recentSessions: [...sessions] });
    }
    return sessions;
  }

  async newSession(): Promise<SessionSummary> {
    if (this.#snapshot.isSessionMutationPending) {
      throw new Error("A session mutation is already in progress");
    }
    return this.#runSessionMutation(this.#requestNewSession);
  }

  async switchSession(sessionId: string): Promise<SessionSummary | undefined> {
    if (!this.canSwitchSession()) return undefined;
    if (sessionId === this.#snapshot.activeSession?.sessionId) {
      return this.#snapshot.activeSession;
    }
    return this.#runSessionMutation(() =>
      this.#requestSwitchSession(sessionId),
    );
  }

  async #runSessionMutation(
    request: () => Promise<SessionSummary>,
  ): Promise<SessionSummary> {
    this.#publish({ isSessionMutationPending: true });
    try {
      const activeSession = await request();
      this.#publish({
        activeSession,
        recentSessions: undefined,
        sessionSelectionVersion: this.#snapshot.sessionSelectionVersion + 1,
        isSessionMutationPending: false,
      });
      void this.loadRecentSessions().catch(() => {});
      return activeSession;
    } catch (error) {
      this.#publish({ isSessionMutationPending: false });
      throw error;
    }
  }

  #publish(update: Partial<WorkspaceSessionSnapshot>): void {
    const next = { ...this.#snapshot, ...update };
    this.#snapshot = {
      ...next,
      canSwitchSession: !next.isAgentRunning && !next.isSessionMutationPending,
    };
    for (const listener of this.#listeners) listener();
  }
}
