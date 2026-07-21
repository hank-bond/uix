import { stat } from "node:fs/promises";

import type { SessionManager } from "@earendil-works/pi-coding-agent";
import type { SessionSummary } from "@uix/api/agent-channels";

import { extractTranscriptText, getMessageRole } from "./transcript";

const MaxFallbackLabelLength = 80;

export async function readSessionSummary(
  manager: SessionManager,
): Promise<SessionSummary> {
  const header = manager.getHeader();
  if (!header) throw new Error("Session is missing its header");

  const displayName = manager.getSessionName();
  const firstUserMessage = deriveFirstUserMessage(manager);
  const displayLabel = displayName ?? firstUserMessage ?? "New conversation";
  const modifiedAt = await readModifiedAt(
    manager.getSessionFile(),
    header.timestamp,
  );

  return {
    sessionId: manager.getSessionId(),
    ...(displayName !== undefined && { displayName }),
    displayLabel,
    createdAt: header.timestamp,
    modifiedAt,
  };
}

function deriveFirstUserMessage(manager: SessionManager): string | undefined {
  for (const entry of manager.getEntries()) {
    if (entry.type !== "message" || getMessageRole(entry.message) !== "user") {
      continue;
    }
    const text = extractTranscriptText(entry.message)
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    if (text.length <= MaxFallbackLabelLength) return text;
    return `${text.slice(0, MaxFallbackLabelLength - 1).trimEnd()}…`;
  }
  return undefined;
}

async function readModifiedAt(
  sessionFile: string | undefined,
  fallback: string,
): Promise<string> {
  if (!sessionFile) return fallback;
  try {
    return (await stat(sessionFile)).mtime.toISOString();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}
