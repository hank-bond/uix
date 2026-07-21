import type {
  AgentEvent,
  SessionHistoryResponse,
  SessionSummary,
  TranscriptSnapshot,
} from "@uix/api/agent-channels";

interface WorkspaceSessionControllerOptions {
  requestActiveHistory: () => Promise<SessionHistoryResponse>;
  requestNewSession: () => Promise<SessionSummary>;
}

type Listener = () => void;

/** Renderer owner for the active-session projection and session mutations. */
export class WorkspaceSessionController {
  readonly #requestActiveHistory: () => Promise<SessionHistoryResponse>;
  readonly #requestNewSession: () => Promise<SessionSummary>;
  readonly #listeners = new Set<Listener>();
  #activeSession: SessionSummary | undefined;
  #sessionSelectionVersion = 0;
  #inFlightActiveHistory:
    | {
        sessionSelectionVersion: number;
        promise: Promise<SessionHistoryResponse>;
      }
    | undefined;
  #agentRunning = false;

  constructor(opts: WorkspaceSessionControllerOptions) {
    this.#requestActiveHistory = opts.requestActiveHistory;
    this.#requestNewSession = opts.requestNewSession;
  }

  getActiveSessionSnapshot = (): SessionSummary | undefined =>
    this.#activeSession;

  getSessionSelectionVersion(): number {
    return this.#sessionSelectionVersion;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  isAgentRunning(): boolean {
    return this.#agentRunning;
  }

  updateAgentActivity(event: AgentEvent): void {
    if (event.type === "agent_start") this.#agentRunning = true;
    if (event.type === "agent_end") this.#agentRunning = false;
  }

  loadActiveHistory(): Promise<TranscriptSnapshot> {
    const sessionSelectionVersion = this.#sessionSelectionVersion;
    const existing = this.#inFlightActiveHistory;
    if (existing?.sessionSelectionVersion === sessionSelectionVersion) {
      return existing.promise.then(({ transcript }) => transcript);
    }

    const promise = this.#requestActiveHistory()
      .then((result) => {
        if (sessionSelectionVersion === this.#sessionSelectionVersion) {
          this.#publishActiveSession(result.session);
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

  async newSession(): Promise<SessionSummary> {
    const activeSession = await this.#requestNewSession();
    this.#sessionSelectionVersion += 1;
    this.#publishActiveSession(activeSession);
    return activeSession;
  }

  #publishActiveSession(activeSession: SessionSummary): void {
    this.#activeSession = activeSession;
    for (const listener of this.#listeners) listener();
  }
}
