// Generates repository AGENTS.md indexes from document frontmatter and production source-owner summaries.
//
// Documentation layers are configured explicitly, while source ownership indexes are discovered under supported roots. Each AGENTS.md keeps hand-written guidance outside one generated INDEX block.

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Indexed directories, relative to the repo root, and how each index sorts.
// A "container" indexes its child layers (each subdir via its own AGENTS.md)
// plus any top-level docs; an explicit `children` list curates membership and
// order (otherwise children are auto-discovered and sorted by name). Leaf layers
// index the docs directly inside them: decisions are a dated log (newest first),
// everything else sorts by slug.
const layers = [
  {
    dir: ".",
    kind: "container",
    children: [
      "src/main",
      "src/docs",
      "docs",
      "plans",
      "website",
      "packages",
      "hosts",
      "apps",
    ],
  },
  { dir: "docs", kind: "container" },
  { dir: "docs/contributing", kind: "container" },
  { dir: "docs/decisions", sort: "date-desc" },
  { dir: "docs/design", sort: "slug-asc" },
  { dir: "docs/architecture", kind: "container" },
  { dir: "docs/architecture/conventions", kind: "container" },
  { dir: "docs/architecture/conventions/rules", sort: "slug-asc" },
  { dir: "docs/architecture/conventions/lexicon", sort: "slug-asc" },
  { dir: "plans", sort: "slug-asc" },
  { dir: "src/docs", sort: "slug-asc" },
  { dir: "website", sort: "slug-asc" },
  { dir: "hosts", kind: "container" },
  { dir: "apps", kind: "container" },
];

const SOURCE_ROOTS = ["src", "scripts", "templates", "packages"];
// Directories under a source root that carry a hand-authored AGENTS.md without a
// generated source index. src/docs is a documentation layer. The package roots
// are empty ownership roots until later plan units fill them: remove a
// packages/* entry when that package earns at least two production source owners.
const SOURCE_EXCLUDED_DIRECTORIES = new Set([
  "src/docs",
  "packages/api",
  "packages/runtime",
  "packages/client",
  "packages/host",
]);

const START = "<!-- INDEX:START -->";
const END = "<!-- INDEX:END -->";
// Stamped as the first line of every managed block so the warning lives where
// someone would be tempted to hand-edit. Part of the generated body, so --check
// stays consistent.
const NOTE =
  "<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->";
const SOURCE_NOTE =
  "<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->";
// Status is an optional override on the default "current" state: author it
// only when a document's lifecycle position differs from active. Docs without
// a lifecycle (AGENTS.md files, evergreen reference and how-to docs) omit it.
const STATUSES = new Set([
  "accepted",
  "archived",
  "exploring",
  "landed",
  "resolved",
  "stub",
  "superseded",
]);
const KINDS = new Set(["explanation", "how-to", "reference", "tutorial"]);

// Documentation Indexes

// "2026-05-31-foo.md" -> { date: "2026-05-31", slug: "foo" }
// "logging.md"        -> { date: null, slug: "logging" }
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
  // summary is required; read_when, kind, and status are optional overrides on
  // defaults (no trigger, no kind, status = current/active).
  if (!fm.summary) throw new Error(`${file}: frontmatter missing "summary"`);
  return fm;
}

function collect(layer) {
  const dir = join(root, layer.dir);
  if (!existsSync(dir)) return [];
  const entries = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".md") || name === "AGENTS.md" || name === "README.md")
      continue;
    const file = `${layer.dir}/${name}`;
    const fm = parseFrontmatter(readFileSync(join(dir, name), "utf8"), file);
    if (layer.dir !== "plans" && !fm.kind) {
      throw new Error(`${file}: indexed documentation missing "kind"`);
    }
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
      // read_when and kind are optional; status is authored only when it differs
      // from the default current state. The parenthetical renders when either a
      // status or a kind is present.
      const trigger = e.read_when ? ` _${e.read_when}_` : "";
      const state = [e.status, e.kind].filter(Boolean).join(", ");
      const position = state ? ` _(${state})._` : "";
      return `- **[${e.slug}](./${e.file})**${position} ${e.summary}${trigger}`;
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
    } else if (
      name.endsWith(".md") &&
      name !== "AGENTS.md" &&
      name !== "README.md"
    ) {
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
    const fmFile = relative(root, fmPath);
    const fm = parseFrontmatter(readFileSync(fmPath, "utf8"), fmFile);
    if (!isDir && !fm.kind) {
      throw new Error(`${fmFile}: indexed documentation missing "kind"`);
    }
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
      const state = [e.status, e.kind].filter(Boolean).join(", ");
      const position = state ? ` _(${state})._` : "";
      return `- **[${e.label}](${e.link})**${position} ${e.summary}${trigger}`;
    })
    .join("\n");
}

// Source Indexes

function sourceSummaryStyle(name) {
  if (/\.(?:[cm]?[jt]sx?)$/.test(name)) return "slash";
  if (name.endsWith(".css")) return "css";
  if (name.endsWith(".html")) return "html";
  return undefined;
}

function isTestSource(name) {
  return /\.(?:test|spec)\./.test(name);
}

export function parseSourceSummary(name, text, file = name) {
  const style = sourceSummaryStyle(name);
  if (!style) return undefined;

  const line = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/, 1)[0]
    .trim();

  let summary;
  if (style === "slash") {
    const match = line.match(/^\/\/\s+(.+)$/);
    summary = match?.[1].trim();
  } else if (style === "css") {
    const match = line.match(/^\/\*\s*(.+?)\s*\*\/$/);
    if (!line.startsWith("/**")) summary = match?.[1].trim();
  } else {
    const match = line.match(/^<!--\s*(.+?)\s*-->$/);
    summary = match?.[1].trim();
  }

  if (!summary) {
    throw new Error(`${file}: missing one-line source summary`);
  }
  return summary;
}

export function collectSourceDirectory(repositoryRoot, directory) {
  const absoluteDirectory = join(repositoryRoot, directory);
  const directories = [];
  const documents = [];
  const files = [];

  for (const name of readdirSync(absoluteDirectory).sort((a, b) =>
    a.localeCompare(b),
  )) {
    if (name === "AGENTS.md" || name === "README.md") continue;
    const path = join(absoluteDirectory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      const agentsPath = join(path, "AGENTS.md");
      if (!existsSync(agentsPath)) continue;
      const fmFile = relative(repositoryRoot, agentsPath);
      const fm = parseFrontmatter(readFileSync(agentsPath, "utf8"), fmFile);
      directories.push({
        label: `${name}/`,
        link: `./${name}/AGENTS.md`,
        ...fm,
      });
      continue;
    }

    if (name.endsWith(".md")) {
      const fmFile = relative(repositoryRoot, path);
      const fm = parseFrontmatter(readFileSync(path, "utf8"), fmFile);
      documents.push({ label: name, link: `./${name}`, ...fm });
      continue;
    }

    if (!sourceSummaryStyle(name) || isTestSource(name)) continue;
    const file = relative(repositoryRoot, path);
    const summary = parseSourceSummary(name, readFileSync(path, "utf8"), file);
    if (!summary) continue;
    files.push({ label: name, link: `./${name}`, summary });
  }

  return { directories, documents, files };
}

function renderSourceFiles(entries) {
  return entries
    .map((entry) => `- **[${entry.label}](${entry.link})** ${entry.summary}`)
    .join("\n");
}

export function assertSourceBoundary(directory, { directories, files }) {
  if (directories.length + files.length < 2) {
    throw new Error(
      `${directory}/AGENTS.md: source boundary must route at least two production owners`,
    );
  }
}

export function renderSourceIndex({ directories, documents, files }) {
  const sections = [];
  if (directories.length > 0) {
    sections.push(`### Directories\n\n${renderContainer(directories)}`);
  }
  if (documents.length > 0) {
    sections.push(`### Local documentation\n\n${renderContainer(documents)}`);
  }
  if (files.length > 0) {
    sections.push(`### Source files\n\n${renderSourceFiles(files)}`);
  }
  return sections.join("\n\n") || "_(none yet)_";
}

function collectSourceIndexDirectories(repositoryRoot) {
  const directories = [];

  function visit(directory) {
    const absoluteDirectory = join(repositoryRoot, directory);
    if (!existsSync(absoluteDirectory)) return;
    // Excluded directories are not source-indexed themselves, but their children
    // still are: src/docs is a doc layer, and the empty package roots keep
    // hand-authored AGENTS.md until they earn production source.
    if (
      !SOURCE_EXCLUDED_DIRECTORIES.has(directory) &&
      existsSync(join(absoluteDirectory, "AGENTS.md"))
    ) {
      directories.push(directory);
    }
    for (const name of readdirSync(absoluteDirectory)) {
      const child = join(absoluteDirectory, name);
      if (statSync(child).isDirectory()) visit(relative(repositoryRoot, child));
    }
  }

  for (const sourceRoot of SOURCE_ROOTS) visit(sourceRoot);
  return directories.sort((a, b) => a.localeCompare(b));
}

function applyIndex(agentsPath, body, note = NOTE) {
  const text = readFileSync(agentsPath, "utf8");
  const s = text.indexOf(START);
  const e = text.indexOf(END);
  if (s === -1 || e === -1) {
    throw new Error(`${agentsPath}: missing ${START}/${END} markers`);
  }
  const next = `${text.slice(0, s + START.length)}\n\n${note}\n\n${body}\n\n${text.slice(e)}`;
  return { text, next };
}

// Repository Documentation Validation

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
    "README.md",
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
    const file = relative(root, path);
    const frontmatter = parseFrontmatter(readFileSync(path, "utf8"), file);
    if (frontmatter.status && !STATUSES.has(frontmatter.status)) {
      throw new Error(`${file}: unknown documentation status`);
    }
    if (frontmatter.kind && !KINDS.has(frontmatter.kind)) {
      throw new Error(`${file}: unknown documentation kind`);
    }
  }
}

function checkAllDocumentShapes() {
  for (const path of markdownFiles(root)) {
    const file = relative(root, path);
    if (file.startsWith("plans/archive/")) continue;
    const text = readFileSync(path, "utf8");
    const body = text
      .replace(/^---\n[\s\S]*?\n---\n/, "")
      .replace(/```[\s\S]*?```/g, "");
    const titles = body.match(/^# .+$/gm) ?? [];
    if (titles.length !== 1) {
      throw new Error(`${file}: expected exactly one H1 title`);
    }
    if (/[.!?]$/.test(titles[0])) {
      throw new Error(`${file}: H1 title must not end with punctuation`);
    }
  }
}

function checkAllRelativeLinks() {
  const linkPattern = /(?<!!)\[[^\]]*\]\(([^)]+)\)/g;
  for (const path of markdownFiles(root)) {
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(linkPattern)) {
      const target = match[1].split("#", 1)[0];
      if (
        !target ||
        target.startsWith("#") ||
        /^[a-z][a-z0-9+.-]*:/i.test(target)
      ) {
        continue;
      }
      const destination = resolve(dirname(path), decodeURIComponent(target));
      if (!existsSync(destination)) {
        throw new Error(
          `${relative(root, path)}: relative link target not found: ${target}`,
        );
      }
    }
  }
}

// Index Command

function updateIndex(agentsPath, body, note, check) {
  const { text, next } = applyIndex(agentsPath, body, note);
  if (text === next) return false;
  if (check) return true;
  writeFileSync(agentsPath, next);
  console.log(`updated ${relative(root, dirname(agentsPath))}/AGENTS.md`);
  return false;
}

export function main(args = process.argv.slice(2)) {
  const check = args.includes("--check");
  let stale = false;

  checkAllFrontmatter();
  checkAllDocumentShapes();

  for (const layer of layers) {
    const agentsPath = join(root, layer.dir, "AGENTS.md");
    if (!existsSync(agentsPath)) continue;
    const body =
      layer.kind === "container"
        ? renderContainer(collectContainer(layer))
        : renderIndex(collect(layer));
    if (updateIndex(agentsPath, body, NOTE, check)) {
      stale = true;
      console.error(`stale index: ${layer.dir}/AGENTS.md`);
    }
  }

  for (const directory of collectSourceIndexDirectories(root)) {
    const agentsPath = join(root, directory, "AGENTS.md");
    const entries = collectSourceDirectory(root, directory);
    assertSourceBoundary(directory, entries);
    const body = renderSourceIndex(entries);
    if (updateIndex(agentsPath, body, SOURCE_NOTE, check)) {
      stale = true;
      console.error(`stale source index: ${directory}/AGENTS.md`);
    }
  }

  // Generation removes links to deleted indexed children before validation.
  checkAllRelativeLinks();

  if (check && stale) {
    console.error('Run "npm run docs:index" to regenerate.');
    process.exitCode = 1;
  }
  return !stale;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) main();
