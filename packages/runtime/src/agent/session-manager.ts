// Opens one explicit durable session into its own Pi manager.

import type { SessionManager } from "@earendil-works/pi-coding-agent";

import { resolveSessionFileById } from "./session-files";

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
