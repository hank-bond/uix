// UIX cockpit — local canvas content store.
//
// This is the only canvas module that knows how today's local persistence maps
// keys to files. Everything above this layer addresses canvases by key so the
// backing store can later become a DB/object-store/remote document without
// changing the agent or renderer contract.
//
// Canvases live under the workspace state root (see src/main/workspace.ts), not
// the agent cwd: they are conversation state that must survive a worktree shift.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { assertCanvasKey, isCanvasKey } from "../../shared/canvas";

export { isCanvasKey };

export function canvasDir(stateRoot: string): string {
  return join(stateRoot, ".uix", "canvas");
}

export async function readCanvas(
  stateRoot: string,
  key: string,
): Promise<string | null> {
  if (!isCanvasKey(key)) return null;

  try {
    return await readFile(canvasPath(stateRoot, key), "utf8");
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeCanvas(
  stateRoot: string,
  key: string,
  html: string,
): Promise<void> {
  assertCanvasKey(key);

  const path = canvasPath(stateRoot, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, html, "utf8");
}

function canvasPath(stateRoot: string, key: string): string {
  return join(canvasDir(stateRoot), `${key}.html`);
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
