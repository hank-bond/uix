import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function resolveSessionFileById(
  sessionDir: string,
  sessionId: string,
): Promise<string | undefined> {
  const suffix = `_${sessionId}.jsonl`;
  const entries = await readdir(sessionDir, { withFileTypes: true });
  const match = entries.find(
    (entry) => entry.isFile() && entry.name.endsWith(suffix),
  );
  return match ? join(sessionDir, match.name) : undefined;
}
