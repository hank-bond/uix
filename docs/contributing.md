---
summary: "How to author and maintain repository docs: the four layers' lifecycles, frontmatter summary/read_when rules, prose formatting, the AGENTS.md overview-plus-index shape, and living design-note threads."
status: active
---

# Contributing to the docs

How to write and maintain the documentation in this tree. The routing map — which layer answers which question — is in [`AGENTS.md`](./AGENTS.md); this is the authoring reference behind it.

## The four layers

Each layer has its own filename convention, summary template, and lifecycle. The rule for where a date goes: **if the _file_ is a point-in-time event, the date is in the filename; if the file _contains_ dated events, the dates live inside it.**

| Layer | Filename | Summary states | Mutability |
| --- | --- | --- | --- |
| `decisions/` | `YYYY-MM-DD-slug` | the conclusion | write-once (only `status` may change) |
| `design/` | `problem-name` | the open question + axes | synthesis mutable, `## Log` append-only |
| `architecture/` | `subsystem` | current subsystem state | living, always = HEAD |
| `plans/` | `deliverable` | the deliverable + units | active → `plans/archive/` |

The distillation pipeline runs left-to-right in time: **design note → decision → plan → architecture.** Each step is more distilled and more stable than the last. The design note is the only place rejected alternatives and the full reasoning survive; everything downstream records conclusions.

## Frontmatter

The filename already carries the slug (and, for decisions, the date), so frontmatter adds only what position can't:

```yaml
---
summary: "What this document establishes — its thesis, not its topic."
read_when: "Read … — only when the trigger isn't obvious from the summary." # optional
status: accepted | exploring | resolved | active | archived | stub | superseded
---
```

One rule governs both fields: **don't duplicate what's already in the reader's context when they read the field.** The slug is in the link, the category is in the directory, and — once the index is in scope — the summary sits right next to `read_when`. Restating any of those wastes the line.

- **`summary` (required)** is the document's **recall surface** — the line an agent scans to decide the doc is relevant, and the only field cheap enough to preload across the whole tree. It states the **thesis** (the conclusion, the shape, the responsibility), not the topic. Compressing the body is fine here — the body _isn't_ in context when the summary is read. Write it to be **findable by concept** and **distinct from its siblings**; if two siblings' summaries are interchangeable, the boundary between the documents is wrong, not the wording.
- **`read_when` (optional)** is the **external trigger** — the precision step. Author it _only_ when the reason to open the doc isn't inferable from the summary: a **cross-vocabulary** trigger (the task is phrased in words the thesis doesn't use), a **preventive** one (read before starting down a path the doc constrains), or a **counterintuitive** one (the doc says _don't_ do the obvious thing). If the trigger is just "read when working on the thing this is obviously about," omit it — that's the `// increment i` of frontmatter.

Each layer's summary fills a different template, because each answers a different question — decisions state the conclusion ("X, over Y"), design states the open question and its axes, architecture states what the subsystem currently _is_, plans state the deliverable and its units, and `src/docs/` states how to use the shipped surface today. Same template within a layer forces siblings to differ on topic; different templates across layers keep one subject's recurrence (a decision, its design thread, its current state, its plan) distinct by role.

A summary's length tracks the number of independently-addressable **claims** the document exposes — the hooks a task might match on — not its word count. A long single-thesis decision still gets one line; a multi-unit plan enumerates its units. The layer template sets the baseline (a conclusion is short, a deliverable-plus-units is long), and the shared preload budget caps it: spend length only where the doc has more hooks. A summary that has to balloon to stay distinct is usually a **split signal** — the document is bundling unrelated claims and wants to become several — except in plans and design threads, where multi-unit is the recognized shape.

This applies to every repo-owned markdown file, including `AGENTS.md` and `README.md`. **Decisions freeze frontmatter at acceptance** (only `status` changes later); **living docs keep it current**. Cross-link between docs with ordinary inline markdown links, not a frontmatter field.

## Formatting

**Do not hard-wrap prose.** Write each paragraph and list item as a single line and let the editor soft-wrap it. Prettier enforces this (`proseWrap: "never"` unwraps any manual line breaks in prose), so a hard-wrapped paragraph will fail `npm run format:check`. Tables, code fences, and list structure are exempt — only running prose is unwrapped.

## Every AGENTS.md is overview + index

The shape repeats at every level: an `AGENTS.md` is frontmatter plus **hand-written overview prose** — a high-level summary of everything below it, plus any item too small to deserve its own file — followed by a **generated index**. The root [`AGENTS.md`](../AGENTS.md) overviews the project and routes to these dir-level files; each dir-level file overviews its dir and routes to its docs.

The index sits between `<!-- INDEX:START -->` / `<!-- INDEX:END -->` and is derived from each doc's frontmatter by [`scripts/docs-index.mjs`](../scripts/docs-index.mjs), which covers `docs/decisions`, `docs/design`, `docs/architecture`, `docs/plans`, and `src/docs`. Add or edit a doc, then:

```sh
npm run docs:index     # regenerate the index blocks
npm run docs:check     # CI: fail if any index is stale or frontmatter is missing
```

Prose outside the markers is yours; the block between them is derived — **never hand-edit it.** Do not add, reword, reorder, or delete entries inside the markers: the block is regenerated from frontmatter, so a manual edit is either silently overwritten by `npm run docs:index` or fails `npm run docs:check` when it drifts. To change an entry, edit the doc's frontmatter `summary`/`read_when`/`status` (or rename the file) and regenerate. A small idea can live as a line in the overview prose; when it grows past a line, promote it to its own file — the index then carries it — and delete the prose line, so it's never maintained in both places. Top-level docs in `docs/` (like this one) sit outside the indexed layers and are reached by prose links from `AGENTS.md`, not an index.

## Design notes are living threads

A design note is **a current synthesis on top of an append-only dated log**:

```markdown
## Current synthesis <- rewritten freely; frontmatter tracks this

## Log <- append-only; never rewritten

### 2026-06-01 — framing

### 2026-07-… — revisited
```

Revisit a topic across sessions by appending a dated `## Log` entry and updating the synthesis. When it resolves, flip `status: resolved` and link the decisions and plans it spawned.
