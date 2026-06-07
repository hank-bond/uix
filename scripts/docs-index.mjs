#!/usr/bin/env node
// Generates (or checks) the per-directory AGENTS.md indexes from each doc's
// frontmatter. The filename is the slug (and, for decisions, the date); the
// frontmatter carries only summary + status. The index is derived from both,
// so adding a doc means editing one place (its own frontmatter + name), and CI
// can fail when an index drifts from the docs it claims to list.
//
//   node scripts/docs-index.mjs           # rewrite the INDEX blocks in place
//   node scripts/docs-index.mjs --check   # exit 1 if any block is stale
//
// Each indexed directory has an AGENTS.md whose hand-written overview prose sits
// above a managed region:
//   <!-- INDEX:START --> ... <!-- INDEX:END -->
// Everything outside the markers is prose and left untouched.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Indexed directories, relative to the repo root, and how each index sorts.
// Decisions are a dated log: newest first. Everything else sorts by slug.
const layers = [
  { dir: "docs/decisions", sort: "date-desc" },
  { dir: "docs/design", sort: "slug-asc" },
  { dir: "docs/architecture", sort: "slug-asc" },
  { dir: "docs/plans", sort: "slug-asc" },
  { dir: "src/docs", sort: "slug-asc" },
];

const START = "<!-- INDEX:START -->";
const END = "<!-- INDEX:END -->";
// Stamped as the first line of every managed block so the warning lives where
// someone would be tempted to hand-edit. Part of the generated body, so --check
// stays consistent.
const NOTE =
  "<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->";

// "2026-05-31-foo.md" -> { date: "2026-05-31", slug: "foo" }
// "conventions.md"    -> { date: null, slug: "conventions" }
function identify(name) {
  const base = name.replace(/\.md$/, "");
  const dated = base.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  return dated
    ? { date: dated[1], slug: dated[2] }
    : { date: null, slug: base };
}

function parseFrontmatter(text, file) {
  if (!text.startsWith("---")) throw new Error(`${file}: missing frontmatter`);
  const end = text.indexOf("\n---", 3);
  if (end === -1) throw new Error(`${file}: unterminated frontmatter`);
  const fm = {};
  for (const line of text.slice(3, end).split("\n")) {
    const m = line.match(/^([a-z]+):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    // Decode the two YAML scalar styles Prettier emits, so the index reads the
    // same text regardless of which quoting Prettier chose for the frontmatter.
    if (v.startsWith('"') && v.endsWith('"')) {
      v = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    } else if (v.startsWith("'") && v.endsWith("'")) {
      v = v.slice(1, -1).replace(/''/g, "'");
    }
    fm[m[1]] = v;
  }
  for (const req of ["summary", "status"]) {
    if (!fm[req]) throw new Error(`${file}: frontmatter missing "${req}"`);
  }
  return fm;
}

function collect(layer) {
  const dir = join(root, layer.dir);
  if (!existsSync(dir)) return [];
  const entries = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".md") || name === "AGENTS.md") continue;
    const fm = parseFrontmatter(
      readFileSync(join(dir, name), "utf8"),
      `${layer.dir}/${name}`,
    );
    entries.push({ file: name, ...identify(name), ...fm });
  }
  if (layer.sort === "date-desc") {
    entries.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  } else {
    entries.sort((a, b) => a.slug.localeCompare(b.slug));
  }
  return entries;
}

function renderIndex(entries) {
  if (entries.length === 0) return "_(none yet)_";
  return entries
    .map((e) => `- **[${e.slug}](./${e.file})** _(${e.status})_ — ${e.summary}`)
    .join("\n");
}

function applyIndex(agentsPath, body) {
  const text = readFileSync(agentsPath, "utf8");
  const s = text.indexOf(START);
  const e = text.indexOf(END);
  if (s === -1 || e === -1) {
    throw new Error(`${agentsPath}: missing ${START}/${END} markers`);
  }
  const next = `${text.slice(0, s + START.length)}\n\n${NOTE}\n\n${body}\n\n${text.slice(e)}`;
  return { text, next };
}

const check = process.argv.includes("--check");
let stale = false;

for (const layer of layers) {
  const agentsPath = join(root, layer.dir, "AGENTS.md");
  if (!existsSync(agentsPath)) continue;
  const { text, next } = applyIndex(agentsPath, renderIndex(collect(layer)));
  if (text === next) continue;
  if (check) {
    stale = true;
    console.error(`stale index: ${layer.dir}/AGENTS.md`);
  } else {
    writeFileSync(agentsPath, next);
    console.log(`updated ${layer.dir}/AGENTS.md`);
  }
}

if (check && stale) {
  console.error('Run "npm run docs:index" to regenerate.');
  process.exit(1);
}
