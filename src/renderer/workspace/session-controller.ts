import type { SessionSummary } from "@uix/api/agent-channels";

type RequestNewSession = () => Promise<SessionSummary>;
type Listener = () => void;

/** Renderer owner for the active-session projection and session mutations. */
export class WorkspaceSessionController {
  readonly #requestNewSession: RequestNewSession;
  readonly #listeners = new Set<Listener>();
  #activeSession: SessionSummary | undefined;

  constructor(requestNewSession: RequestNewSession) {
    this.#requestNewSession = requestNewSession;
  }

  getActiveSessionSnapshot = (): SessionSummary | undefined =>
    this.#activeSession;

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  async newSession(): Promise<SessionSummary> {
    const activeSession = await this.#requestNewSession();
    this.#activeSession = activeSession;
    for (const listener of this.#listeners) listener();
    return activeSession;
  }
}
