// Opens one explicit durable session into its own Pi manager.

import type { SessionManager } from "@earendil-works/pi-coding-agent";

import { resolveSessionFileById } from "./session-files";
import { type SessionTarget, toSessionId } from "../workspace";

/**
 * Open an independent manager for one existing session id. Returns undefined
 * when it no longer exists. Selection fallback policy belongs to the caller.
 */
export async function openExistingSessionManager(
  sessionDir: string,
  sessionId: string,
): Promise<SessionManager | undefined> {
  const sessionFile = await resolveSessionFileById(sessionDir, sessionId);
  if (!sessionFile) return undefined;

  // Pi is ESM-only while the Electron main bundle is CJS. Dynamic import is
  // preserved by the bundler and Node caches the module after its first load.
  const sdk = await import("@earendil-works/pi-coding-agent");
  return sdk.SessionManager.open(sessionFile, sessionDir);
}

export interface OpenedPrimarySession {
  readonly target: SessionTarget;
  readonly manager: SessionManager;
}

interface OpenWorkspaceFallbackSessionOptions {
  readonly cwd: string;
  readonly sessionDir: string;
}

/** Open the workspace fallback session, recovering through recent then new. */
export async function openWorkspaceFallbackSession(
  opts: OpenWorkspaceFallbackSessionOptions,
): Promise<OpenedPrimarySession> {
  const sdk = await import("@earendil-works/pi-coding-agent");
  let manager: SessionManager;
  try {
    manager = sdk.SessionManager.continueRecent(opts.cwd, opts.sessionDir);
  } catch {
    manager = sdk.SessionManager.create(opts.cwd, opts.sessionDir);
  }

  return {
    target: { sessionId: toSessionId(manager.getSessionId()) },
    manager,
  };
}
