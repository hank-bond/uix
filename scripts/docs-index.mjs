#!/usr/bin/env node
// Generates (or checks) the per-directory AGENTS.md indexes from each doc's
// frontmatter. The filename is the slug (and, for decisions, the date); the
// frontmatter carries summary + status (and an optional read_when). The index is derived from those,
// so adding a doc means editing one place (its own frontmatter + name), and CI
// can fail when an index drifts from the docs it claims to list.
//
//   node scripts/docs-index.mjs           # rewrite the INDEX blocks in place
//   node scripts/docs-index.mjs --check   # exit 1 if any block is stale
//
// Every repo-owned markdown file carries that frontmatter, including AGENTS.md
// files; indexed directories additionally have an AGENTS.md whose hand-written overview prose sits
// above a managed region:
//   <!-- INDEX:START --> ... <!-- INDEX:END -->
// Everything outside the markers is prose and left untouched.

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  statSync,
} from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Indexed directories, relative to the repo root, and how each index sorts.
// A "container" indexes its child layers (each subdir via its own AGENTS.md)
// plus any top-level docs; an explicit `children` list curates membership and
// order (otherwise children are auto-discovered and sorted by name). Leaf layers
// index the docs directly inside them: decisions are a dated log (newest first),
// everything else sorts by slug.
const layers = [
  { dir: ".", kind: "container", children: ["src/docs", "docs", "website"] },
  { dir: "docs", kind: "container" },
  { dir: "docs/decisions", sort: "date-desc" },
  { dir: "docs/design", sort: "slug-asc" },
  { dir: "docs/architecture", sort: "slug-asc" },
  { dir: "docs/plans", sort: "slug-asc" },
  { dir: "src/docs", sort: "slug-asc" },
  { dir: "website", sort: "slug-asc" },
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
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
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
  // summary and status are required; read_when is optional — it's authored only
  // when the trigger to open a doc isn't already inferable from its summary.
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
    .map((e) => {
      // read_when is optional; only docs with a non-obvious trigger carry one.
      const trigger = e.read_when ? ` _${e.read_when}_` : "";
      return `- **[${e.slug}](./${e.file})** _(${e.status})_ — ${e.summary}${trigger}`;
    })
    .join("\n");
}

// A container's children are its immediate subdirectories that carry an AGENTS.md
// plus its immediate top-level docs (AGENTS.md itself excluded).
function autoChildren(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (existsSync(join(path, "AGENTS.md"))) out.push(name);
    } else if (name.endsWith(".md") && name !== "AGENTS.md") {
      out.push(name);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

// Build the entries for a container index. A child is either a subdir (indexed
// by its AGENTS.md's frontmatter, linked to that overview) or a top-level doc
// (indexed by its own frontmatter). Curated children keep their listed order.
function collectContainer(layer) {
  const dir = join(root, layer.dir);
  if (!existsSync(dir)) return [];
  const names = layer.children ?? autoChildren(dir);
  return names.map((name) => {
    const path = join(dir, name);
    if (!existsSync(path)) {
      throw new Error(
        `${layer.dir}/AGENTS.md: indexed child not found: ${name}`,
      );
    }
    const isDir = statSync(path).isDirectory();
    const fmPath = isDir ? join(path, "AGENTS.md") : path;
    const fm = parseFrontmatter(
      readFileSync(fmPath, "utf8"),
      relative(root, fmPath),
    );
    return isDir
      ? { label: `${name}/`, link: `./${name}/AGENTS.md`, ...fm }
      : { label: identify(name).slug, link: `./${name}`, ...fm };
  });
}

function renderContainer(entries) {
  if (entries.length === 0) return "_(none yet)_";
  return entries
    .map((e) => {
      const trigger = e.read_when ? ` _${e.read_when}_` : "";
      return `- **[${e.label}](${e.link})** _(${e.status})_ — ${e.summary}${trigger}`;
    })
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

function markdownFiles(dir) {
  // CLAUDE.md is a local tooling pointer (an `@./AGENTS.md` import), not a
  // repo-owned doc, so it carries no frontmatter and is skipped.
  const ignored = new Set([
    ".git",
    "node_modules",
    "out",
    "dist",
    "coverage",
    "CLAUDE.md",
  ]);
  const files = [];
  for (const name of readdirSync(dir)) {
    if (ignored.has(name)) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...markdownFiles(path));
    } else if (stat.isFile() && name.endsWith(".md")) {
      files.push(path);
    }
  }
  return files;
}

function checkAllFrontmatter() {
  for (const path of markdownFiles(root)) {
    parseFrontmatter(readFileSync(path, "utf8"), relative(root, path));
  }
}

const check = process.argv.includes("--check");
let stale = false;

checkAllFrontmatter();

for (const layer of layers) {
  const agentsPath = join(root, layer.dir, "AGENTS.md");
  if (!existsSync(agentsPath)) continue;
  const body =
    layer.kind === "container"
      ? renderContainer(collectContainer(layer))
      : renderIndex(collect(layer));
  const { text, next } = applyIndex(agentsPath, body);
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
