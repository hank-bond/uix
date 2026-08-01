#!/usr/bin/env node
// Checks mechanically recognizable current vocabulary rules. Nuanced naming
// remains a review concern; this script reserves extension vocabulary for Pi.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function collectFiles(path, extensions) {
  const files = [];
  for (const name of readdirSync(path)) {
    const entry = join(path, name);
    if (statSync(entry).isDirectory()) {
      files.push(...collectFiles(entry, extensions));
    } else if (extensions.has(extname(name))) {
      files.push(entry);
    }
  }
  return files;
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

const violations = [];

function check(file, pattern, message) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(pattern)) {
    violations.push(
      `${relative(root, file)}:${lineNumber(text, match.index)}: ${message}: ${match[0]}`,
    );
  }
}

const activeDocFiles = [
  join(root, "AGENTS.md"),
  ...collectFiles(join(root, "docs", "architecture"), new Set([".md"])),
  ...collectFiles(join(root, "src", "docs"), new Set([".md"])),
];

for (const file of activeDocFiles) {
  check(
    file,
    /\b(?:UIX|frontend) extensions?\b/gi,
    "UIX loads features; extension is reserved for Pi",
  );
}

if (violations.length > 0) {
  console.error("Vocabulary check failed:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
}
