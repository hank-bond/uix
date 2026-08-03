// Derives stable absolute and workspace-relative locations for transcript rows from read and write tool paths.

import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import type { ToolFileLocation } from "@uix/api/agent-channels";

const UnicodeSpaces = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const FileToolNames = new Set(["read", "write"]);

/** Derives a stable lexical file location from a filesystem tool invocation. */
export function deriveToolFileLocation(
  toolName: string,
  args: unknown,
  cwd: string,
): ToolFileLocation | undefined {
  if (!FileToolNames.has(toolName)) return undefined;
  const path = asRecord(args)?.["path"];
  if (typeof path !== "string") return undefined;

  let normalizedPath: string;
  try {
    normalizedPath = normalizeToolPath(path);
  } catch {
    return undefined;
  }

  const resolvedCwd = resolve(cwd);
  const absolutePath = isAbsolute(normalizedPath)
    ? resolve(normalizedPath)
    : resolve(resolvedCwd, normalizedPath);
  const relativePath = relative(resolvedCwd, absolutePath);
  const isInsideCwd =
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath));

  return {
    absolutePath,
    displayPath: isInsideCwd ? relativePath || "." : absolutePath,
  };
}

function normalizeToolPath(path: string): string {
  let normalized = path.replace(UnicodeSpaces, " ");
  if (normalized.startsWith("@")) normalized = normalized.slice(1);

  if (normalized === "~") return homedir();
  if (
    normalized.startsWith("~/") ||
    (process.platform === "win32" && normalized.startsWith("~\\"))
  ) {
    return join(homedir(), normalized.slice(2));
  }
  if (/^file:\/\//.test(normalized)) return fileURLToPath(normalized);
  return normalized;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
