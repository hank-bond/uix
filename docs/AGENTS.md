# Dev documentation

This tree is **dev-facing meta documentation**: how we reason about UIX, what we decided and why, what we're about to build, and how the codebase is shaped. It is **not shipped** with the app and **not pinned into the agent's context**. The user-facing substrate docs that ship live in [`../src/docs/`](../src/docs/); this directory is the layer behind them.

## The four layers

Each answers a different question and has a different lifecycle. The rule for where a date goes: **if the _file_ is a point-in-time event, the date is in the filename; if the file _contains_ dated events, the dates live inside it.**

| Layer | Answers | Filename | Summary | Mutability |
| --- | --- | --- | --- | --- |
| [`decisions/`](./decisions/) | "What did we decide, finally, and why?" | `YYYY-MM-DD-slug` | routing + frozen conclusion | write-once (only `status` may change) |
| [`design/`](./design/) | "How did we get here — options weighed, roads not taken?" | `problem-name` | routing blurb (detail lives in the synthesis) | synthesis mutable, `## Log` append-only |
| [`architecture/`](./architecture/) | "What _is_ the system now?" | `subsystem` | routing blurb (detail lives in the doc) | living, always = HEAD |
| [`plans/`](./plans/) | "What are we about to build?" | `deliverable` | routing blurb | active → `plans/archive/` |

The distillation pipeline runs left-to-right in time: **design note → decision → plan → architecture.** Each step is more distilled and more stable than the last. The design note is the only place rejected alternatives and the full reasoning survive; everything downstream records conclusions.

## Frontmatter

The filename is the slug (and, for decisions, the date), so frontmatter carries only two keys:

```yaml
---
summary: "A routing blurb: 1–3 sentences naming the topic, scope, and when it's relevant — enough to decide whether to open the doc."
status: accepted | exploring | resolved | active | superseded
---
```

The summary is a **routing aid, not an abstract**. Its only job is to help a reader (human or agent) decide whether to open the doc for the query at hand. The test: read the summary, then either open the doc or skip it — the summary should never try to _answer_ the query itself.

**Put in:** the subject area, a one-clause statement of what the doc decides/covers, and the trigger — what kind of query or task should open it ("read when…"). **Leave out:** the reasoning and tradeoffs, rejected alternatives, mechanism and code detail, and anything that restates the doc body. If you find yourself explaining _why_ or _how_, that belongs in the doc, not the summary.

A useful length is 1–3 sentences. This applies to every layer, decisions included — a decision summary names the decision and when it's relevant, it does not reproduce the rationale. The only per-layer difference is that **decisions freeze the summary at acceptance** (only `status` may later change, e.g. `superseded`), while **living docs keep it current** — and even then it _routes to_ the doc's synthesis rather than duplicating it, so the same prose isn't maintained twice.

**Shape.** A reliable template: `<one clause naming what the doc covers, optionally a short colon-list of its parts>. Read [before|when] <the task or query that should open it>.` Name the parts as bare labels — do not explain them; the moment a clause says _why_ or _how_, it belongs in the body. Calibrate length by eye against the existing entries in the sibling index: a summary visibly longer than its neighbors is doing too much. (The summary is copied verbatim into the index, so its bloat shows up there first.)

Cross-link between docs with ordinary inline markdown links, not a frontmatter field.

## Formatting

**Do not hard-wrap prose.** Write each paragraph and list item as a single line and let the editor soft-wrap it. Prettier enforces this (`proseWrap: "never"` unwraps any manual line breaks in prose), so a hard-wrapped paragraph will fail `npm run format:check`. Tables, code fences, and list structure are exempt — only running prose is unwrapped.

## Every AGENTS.md is overview + index

The shape repeats at every level: an `AGENTS.md` is **hand-written overview prose** — a high-level summary of everything below it, plus any item too small to deserve its own file — followed by a **generated index**. The root [`AGENTS.md`](../AGENTS.md) overviews the project and routes to these dir-level files; each dir-level file overviews its dir and routes to its docs.

The index sits between `<!-- INDEX:START -->` / `<!-- INDEX:END -->` and is derived from each doc's frontmatter by [`scripts/docs-index.mjs`](../scripts/docs-index.mjs), which covers `docs/decisions`, `docs/design`, `docs/architecture`, `docs/plans`, and `src/docs`. Add or edit a doc, then:

```sh
npm run docs:index     # regenerate the index blocks
npm run docs:check     # CI: fail if any index is stale or frontmatter is missing
```

Prose outside the markers is yours; the block between them is derived — **never hand-edit it.** Do not add, reword, reorder, or delete entries inside the markers: the block is regenerated from frontmatter, so a manual edit is either silently overwritten by `npm run docs:index` or fails `npm run docs:check` when it drifts. To change an entry, edit the doc's frontmatter `summary`/`status` (or rename the file) and regenerate. A small idea can live as a line in the overview prose; when it grows past a line, promote it to its own file — the index then carries it — and delete the prose line, so it's never maintained in both places.

## Design notes are living threads

A design note is **a current synthesis on top of an append-only dated log**:

```markdown
## Current synthesis <- rewritten freely; the summary mirrors this

## Log <- append-only; never rewritten

### 2026-06-01 — framing

### 2026-07-… — revisited
```

Revisit a topic across sessions by appending a dated `## Log` entry and updating the synthesis. When it resolves, flip `status: resolved` and link the decisions and plans it spawned.
