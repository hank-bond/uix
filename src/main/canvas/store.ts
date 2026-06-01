// UIX cockpit — local canvas content store.
//
// This is the only canvas module that knows how today's local persistence maps
// keys to files. Everything above this layer addresses canvases by key so the
// backing store can later become a DB/object-store/remote document without
// changing the agent or renderer contract.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";

import { assertCanvasKey, isCanvasKey } from "../../shared/canvas";

export { isCanvasKey };

export function canvasDir(): string {
  return join(process.cwd(), ".uix", "canvas");
}

export async function readCanvas(key: string): Promise<string | null> {
  if (!isCanvasKey(key)) return null;

  try {
    return await readFile(canvasPath(key), "utf8");
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeCanvas(key: string, html: string): Promise<void> {
  assertCanvasKey(key);

  const path = canvasPath(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, html, "utf8");
}

function canvasPath(key: string): string {
  return join(canvasDir(), `${key}.html`);
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
