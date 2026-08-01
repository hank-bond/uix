#!/usr/bin/env node
// Checks only high-confidence vocabulary regressions. Nuanced naming remains a
// review concern; this script covers retired source identifiers, UIX-owned type
// declarations that revive the `Registration` suffix, and stale phrases that
// unambiguously describe UIX features as extensions.

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

const sourceFiles = collectFiles(join(root, "src"), new Set([".ts", ".tsx"]));

const retiredSourceIdentifiers = [
  "ActionRegistration",
  "ActionRun",
  "AgentSkillRegistration",
  "AgentSystemPromptRegistration",
  "AgentToolRegistration",
  "ChannelRegistration",
  "ChannelTransportHandle",
  "RegisterActionContribution",
  "ResourceAddressBuilder",
  "ResourceTransportHandle",
  "SettingsScopeRegistration",
  "SurfaceRegistration",
  "TurnStateCellRegistration",
  "ToolChatRenderer",
  "TurnStateLifecycle",
  "buildAgentContextMessage",
  "buildAgentContextVocabularySection",
  "buildAgentSystemPromptSection",
  "buildFeatureContext",
  "createResourceAddressBuilder",
  "createTurnStateLifecycle",
  "getToolChatRenderer",
  "normalizeActionContribution",
  "rendererByToolName",
];

for (const file of sourceFiles) {
  check(
    file,
    /\b(?:type|interface|class|enum)\s+[A-Za-z_$][\w$]*Registration\b/g,
    "UIX-owned declarations must not use the retired Registration suffix",
  );
  check(
    file,
    new RegExp(`\\b(?:${retiredSourceIdentifiers.join("|")})\\b`, "g"),
    "retired source identifier",
  );
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
