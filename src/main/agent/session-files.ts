import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

interface RecentSessionFile {
  path: string;
  modifiedAt: Date;
}

export async function listRecentSessionFiles(
  sessionDir: string,
  limit: number,
): Promise<RecentSessionFile[]> {
  let entries;
  try {
    entries = await readdir(sessionDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files = (
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
        .map(async (entry): Promise<RecentSessionFile | undefined> => {
          const path = join(sessionDir, entry.name);
          try {
            return { path, modifiedAt: (await stat(path)).mtime };
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
              return undefined;
            }
            throw error;
          }
        }),
    )
  )
    .filter((file): file is RecentSessionFile => file !== undefined)
    .sort(
      (a, b) =>
        b.modifiedAt.getTime() - a.modifiedAt.getTime() ||
        b.path.localeCompare(a.path),
    );

  return files.slice(0, limit);
}

export async function resolveSessionFileById(
  sessionDir: string,
  sessionId: string,
): Promise<string | undefined> {
  const suffix = `_${sessionId}.jsonl`;
  let entries;
  try {
    entries = await readdir(sessionDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const match = entries.find(
    (entry) => entry.isFile() && entry.name.endsWith(suffix),
  );
  return match ? join(sessionDir, match.name) : undefined;
}
