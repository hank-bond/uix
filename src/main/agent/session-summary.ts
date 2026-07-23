import { Buffer } from "node:buffer";
import { readFile, stat } from "node:fs/promises";

import type { SessionManager } from "@earendil-works/pi-coding-agent";
import type { SessionSummary } from "@uix/api/agent-channels";

import { listRecentSessionFiles } from "./session-files";
import { extractTranscriptText, getMessageRole } from "./transcript";

const MaxFirstUserMessagePreviewLength = 512;
const SessionInfoTypeBytes = Buffer.from('"type":"session_info"');
const MessageTypeBytes = Buffer.from('"type":"message"');
const UserRoleBytes = Buffer.from('"role":"user"');

interface SessionSummaryHeader {
  sessionId: string;
  createdAt: string;
}

export async function readSessionSummary(
  manager: SessionManager,
): Promise<SessionSummary> {
  const header = manager.getHeader();
  if (!header) throw new Error("Session is missing its header");

  const title = manager.getSessionName();
  const firstUserMessage = deriveFirstUserMessage(manager);
  const modifiedAt = await readModifiedAt(
    manager.getSessionFile(),
    header.timestamp,
  );

  return {
    sessionId: manager.getSessionId(),
    ...(title !== undefined && { title }),
    ...(firstUserMessage !== undefined && { firstUserMessage }),
    createdAt: header.timestamp,
    modifiedAt,
  };
}

export async function readRecentSessionSummaries(
  sessionDir: string,
  limit: number,
): Promise<SessionSummary[]> {
  const files = await listRecentSessionFiles(sessionDir, limit);
  const summaries: SessionSummary[] = [];
  // Files are selected by mtime first; parse that bounded set sequentially so
  // only one whole-file buffer is live at a time.
  for (const file of files) {
    const summary = await readSessionFileSummary(file.path, file.modifiedAt);
    if (summary) summaries.push(summary);
  }
  return summaries;
}

/** Read only summary-bearing JSONL records from one already-selected file. */
export async function readSessionFileSummary(
  path: string,
  modifiedAt: Date,
): Promise<SessionSummary | undefined> {
  let content: Buffer;
  try {
    content = await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }

  let hasReadFirstRecord = false;
  let header: SessionSummaryHeader | undefined;
  let title: string | undefined;
  let firstUserMessage: SessionSummary["firstUserMessage"];
  let hasReadFirstUserMessage = false;

  forEachBufferLine(content, (line) => {
    if (line.length === 0) return;
    if (!hasReadFirstRecord) {
      hasReadFirstRecord = true;
      header = parseSessionSummaryHeader(parseJsonRecord(line));
      return;
    }
    if (!header) return;

    if (line.includes(SessionInfoTypeBytes)) {
      const entry = parseJsonRecord(line);
      if (entry?.["type"] === "session_info") {
        const name = entry["name"];
        title = typeof name === "string" ? name.trim() || undefined : undefined;
      }
    }

    if (
      !hasReadFirstUserMessage &&
      line.includes(MessageTypeBytes) &&
      line.includes(UserRoleBytes)
    ) {
      const entry = parseJsonRecord(line);
      if (entry?.["type"] !== "message") return;
      const message = entry["message"];
      if (getMessageRole(message) !== "user") return;
      hasReadFirstUserMessage = true;
      firstUserMessage = deriveFirstUserMessagePreview(message);
    }
  });

  if (!header) return undefined;

  return {
    sessionId: header.sessionId,
    ...(title !== undefined && { title }),
    ...(firstUserMessage !== undefined && { firstUserMessage }),
    createdAt: header.createdAt,
    modifiedAt: modifiedAt.toISOString(),
  };
}

function deriveFirstUserMessage(
  manager: SessionManager,
): SessionSummary["firstUserMessage"] {
  for (const entry of manager.getEntries()) {
    if (entry.type !== "message" || getMessageRole(entry.message) !== "user") {
      continue;
    }
    return deriveFirstUserMessagePreview(entry.message);
  }
  return undefined;
}

function deriveFirstUserMessagePreview(
  message: unknown,
): SessionSummary["firstUserMessage"] {
  const text = extractTranscriptText(message).trim();
  if (!text) return undefined;
  const codePoints = Array.from(text);
  const truncated = codePoints.length > MaxFirstUserMessagePreviewLength;
  return {
    preview: codePoints.slice(0, MaxFirstUserMessagePreviewLength).join(""),
    truncated,
  };
}

function forEachBufferLine(
  content: Buffer,
  visit: (line: Buffer) => void,
): void {
  let start = 0;
  while (start < content.length) {
    const newline = content.indexOf(0x0a, start);
    const end = newline === -1 ? content.length : newline;
    visit(content.subarray(start, end));
    if (newline === -1) return;
    start = newline + 1;
  }
}

function parseSessionSummaryHeader(
  value: Record<string, unknown> | undefined,
): SessionSummaryHeader | undefined {
  if (
    value?.["type"] !== "session" ||
    typeof value["id"] !== "string" ||
    typeof value["timestamp"] !== "string"
  ) {
    return undefined;
  }
  return { sessionId: value["id"], createdAt: value["timestamp"] };
}

function parseJsonRecord(line: Buffer): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(line.toString("utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
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
