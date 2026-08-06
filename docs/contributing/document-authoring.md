---
summary: "Place code-related knowledge at its narrowest owner and author discrete documents through retrieval units, frontmatter, generated indexes, writing profiles, conventions, and living design threads."
kind: how-to
---

# Documentation authoring

Use this reference to write and maintain repository documentation. [`AGENTS.md`](./AGENTS.md) routes documentation contribution practice, [`AGENTS.md`](../AGENTS.md) maps the repository-level layers, and the root [`AGENTS.md`](../../AGENTS.md) maps every documentation tree.

## Place knowledge at its narrowest owner

Code is the primary description of implemented structure and behavior. Names, types, imports, and control flow carry knowledge _of_ the code. Documentation carries knowledge _about_ the code: responsibility, correct usage, ownership, rationale, coordination, constraints, and external context.

Place each item at the narrowest boundary whose correctness changes with that information:

| Scope | Owner |
| --- | --- |
| One implementation choice or constraint | A line comment beside the code. |
| Direct use of one exported contract | JSDoc above the export. |
| One file's stable responsibility | The source-file header. |
| Routing among immediate production owners, or coordination spanning files or subsystem boundaries | That directory's `AGENTS.md`. |
| One source directory's cross-file context | A local Markdown leaf indexed by that directory's `AGENTS.md`. |
| A multi-boundary workflow, convention, invariant, external constraint, decision, or design history | Repository documentation. |

Direct code relationships remain imports. Do not maintain prose importer lists. Use a JSDoc `{@link}` or directory guidance only when a conceptual relationship is necessary for correct use and is not evident from imports and types.

### Source-file headers

Every indexed authored production source file starts with one indexable line that states its stable responsibility. The summary is physically the first line, without exceptions. For TypeScript and JavaScript, use one `//` sentence that names the domain responsibility, operation, result, or authority boundary without repeating the path or filename.

Source indexes cover authored production TypeScript and JavaScript files, including declarations, plus CSS and HTML. They exclude colocated `*.test.*` and `*.spec.*` files because the production owner already routes an agent to its tests by basename. Tests need no summary. Add test comments only for context the test structure cannot carry. JSON, binary assets, and static data are not indexed. Local Markdown and child `AGENTS.md` entries derive summaries from frontmatter.

The summary must distinguish the file from its siblings and remain true when implementation mechanics or callers change. Do not enumerate exports, narrate control flow, describe future intent, or add guessed search synonyms. If one coherent summary cannot describe the file, reconsider its responsibilities.

The header is the summary sentence plus at most one elaboration paragraph, whose length scales with the file's size. The elaboration extends the claim with the file-level concepts the sentence cannot hold: mechanism, hidden guarantees, external constraints, failure boundaries, and rationale. It stays at the file's medium abstraction level. Lower-level detail belongs in code comments. It never restates the summary. Do not use the paragraph as an export inventory or control-flow narration.

### Contract and implementation comments

JSDoc serves callers. Document preconditions, lifetimes, ownership, ordering, errors, defaults, special outcomes, and direct examples that callers need. Do not duplicate names, fields, parameter types, or return types.

A TypeScript `export` keyword does not by itself create a supported public boundary. Document every supported `@uix/api` contract. Document an internal export when correct use or a conceptual relationship is not evident from its name and type.

Line comments serve implementation readers. Explain a non-obvious reason, external quirk, load-bearing order, or hidden constraint. The implementation already shows its ordinary process, so do not narrate syntax or control flow.

An update trigger records the known validity boundary of an artifact that is complete and correct under present conditions. Use the exact `Update when:` label, followed by one observable condition and the required update or removal. Before that condition occurs, the marker creates no pending work. Do not use it for unfinished work, desired improvements, speculative changes, or plan stages.

### Directory guidance and local leaves

A source `AGENTS.md` is a routing and coordination map for a directory that owns multiple production files or child boundaries. It identifies those immediate owners and records ownership, dependency direction, composition points, or conceptual coordination whose correctness spans more than one of them. Behavior owned by one source file belongs in that file's header, JSDoc, or implementation comments instead.

Do not create a source directory or `AGENTS.md` for one production file plus its tests. Keep that file and its tests in the parent, where the production file appears in the parent's index.

An `AGENTS.md` generated index lists direct production source files, local Markdown leaves, and immediate child `AGENTS.md` summaries. It excludes colocated tests. Handwritten guidance must not repeat or paraphrase those file or child summaries. The generated index is their sole directory-level description. Guidance starts where individual summaries stop: relationships, sequencing, shared invariants, composition, and dependency direction. A parent does not flatten the contents of a real child ownership boundary.

A local Markdown leaf earns its place when several files under one source owner must be understood together. Put broader workflows and context in repository documentation. [`docs-index.mjs`](../../scripts/docs-index.mjs) generates source indexes. Never hand-maintain them.

## What earns a discrete document

First find the narrowest durable owner. If the information belongs in a discrete Markdown leaf, use Diátaxis to classify the reader need. File summaries, code comments, and routing indexes do not need a Diátaxis kind.

A discrete document must provide information that source inspection cannot cheaply and reliably recover. It earns its maintenance cost through at least one of these roles:

- A convention or invariant prescribes choices across multiple source units.
- A how-to joins several boundaries into one concrete, multi-step workflow.
- A tutorial provides an ordered learning experience rather than one contract's direct usage.
- A design note or plan describes future work and unresolved choices.
- A decision preserves rationale, rejected alternatives, and the constraint that followed.
- External context explains a dependency, protocol, platform behavior, or product requirement not owned by this repository.
- A hard-won lesson records a trap, failure mode, or non-obvious reason that prevents a plausible mistake.

Face-value synthesis of implemented code does not qualify. Neither does a prose inventory whose main value is listing what exists today.

Before deleting a descriptive document, preserve anything the code cannot reveal. Look for rationale, rejected alternatives, external constraints, failure history, invariants, and counterintuitive behavior. Move each item to its narrowest durable home. Valid homes include JSDoc, implementation comments, directory guidance, local leaves, conventions, decisions, design logs, and cross-boundary how-tos.

Use this placement test:

1. If the code already answers the question cheaply, improve its names, types, or structure instead of adding prose.
2. If correct use of one export needs explanation, improve its JSDoc.
3. If one implementation site owns the reason, add a line comment there.
4. If one file owns the responsibility, improve its header.
5. If knowledge coordinates several owners in one directory, improve its `AGENTS.md` or add one local retrieval unit.
6. If the task or context crosses ownership boundaries, write a repository document.

## Frontmatter

The filename already carries the slug (and, for decisions, the date), so frontmatter adds only what position can't:

```yaml
---
summary: "What this document establishes: its thesis, not its topic."
read_when: "Read before {ACTIVITY} when the trigger is not obvious from the summary." # optional
status: accepted | exploring | resolved | landed | archived | stub | superseded # optional override
---
```

One rule governs the fields: **don't duplicate what's already in the reader's context when they read the field.** The slug is in the link, the category is in the directory, and the summary sits next to `read_when` once the index is in scope. Restating any of those wastes the line.

- **`summary` (required):** The document's _recall surface_. An agent scans it to decide whether the document is relevant. It states the thesis rather than the topic. Summarize the body, but optimize for first-read understanding rather than maximum compression. Prefer concrete actors and actions over stacked modifiers or abstract nouns. Use enough plain language to make the sentence readable without opening the document, and keep specialized terms only when they preserve an important distinction. Make each summary findable by concept and distinct from siblings. Interchangeable sibling summaries indicate a boundary problem.
- **`read_when` (optional):** The _external trigger_ that adds precision. Author it only when the summary does not reveal why to open the document:
- **`status` (optional):** The lifecycle position when it differs from the default _current_ state. Omit it on documents without a lifecycle (each `AGENTS.md`, evergreen reference and how-to docs). Author it only on lifecycle layers: decisions (`accepted`, `superseded`, `archived`), design threads (`exploring`, `resolved`), and plans (`stub`, `landed`, `archived`).
- A **cross-vocabulary** trigger: the task uses words the thesis does not.
- A **preventive** one: read before starting down a path the doc constrains.
- A **counterintuitive** trigger: The document rejects an obvious path. Omit a trigger that only repeats the subject because it adds no retrieval value.

Each layer's summary fills a different template, because each answers a different question:

- Decisions state the conclusion ("X, over Y").
- Design states the open question and its axes.
- Architecture states an invariant or context that remains necessary at HEAD and is not obvious from source.
- Plans state the deliverable and its units.
- A source-local leaf states one owning directory's multi-file context. A repository leaf states a cross-boundary reader need. Direct API facts remain in code comments.

The same template within a layer forces siblings to differ by topic. Different templates keep one subject's decision, design, constraint, and plan distinct by role.

Summary length follows the number of independently addressable claims, not body length. A long single-thesis decision still gets one short summary. A multi-unit plan can enumerate its units.

The layer template sets a baseline, and the shared preload budget sets a cap. Spend words only on additional retrieval hooks.

A summary that must grow to remain distinct is a _split signal_. The document probably bundles unrelated claims. Plans and design threads remain the accepted multi-unit forms.

This guidance applies to every repository-owned documentation Markdown file, including each `AGENTS.md` file. `README.md` files are public GitHub-facing documentation and are intentionally excluded from the agent indexes and documentation validation. _Decisions freeze their frontmatter and prose at acceptance_. Only `status` may change. Link destinations may change when files move so references continue to resolve. _Living docs stay current._ Cross-link documents with ordinary inline Markdown links, not a frontmatter field.

## Documents are retrieval units

First apply the placement test above. Do not create a document retrieval unit when one source file, contract comment, or directory overview should own the information.

A leaf document is the smallest information set a reader should load to perform one kind of work correctly. Choose boundaries by retrieval and application, not heading count or source layout.

Evaluate each candidate section on four axes:

- **Trigger:** What activity makes a reader open it?
- **Scope:** Which audience, process, layer, or kind of code does it govern?
- **Dependency:** Which other information must a reader load to understand or apply it?
- **Change coupling:** Which other rules or claims normally change with it?

Keep sections together when a reader normally needs them for the same decision, or when one depends on the other. Also keep them when their summaries and reading triggers would be substantially the same. Split them when they have materially different triggers or scopes, change independently, and can each state a distinct thesis.

Use the frontmatter as the boundary test. A good leaf has one summary that states its thesis and, when needed, one clear `read_when` trigger. A summary that must enumerate unrelated claims or a trigger that must list unrelated activities indicates that the leaf is not one retrieval unit.

Document length is a constraint, not the organizing principle. One substantial rule can be its own leaf when it has an independent trigger. A short rule without an independent trigger should remain with the rules that a reader applies with it.

## Normative language and writing profiles

Use **must**, **should**, and **may** only for normative requirements:

- **must** marks a requirement. A conforming change cannot violate it.
- **should** marks the required default when a valid, stated reason can justify an exception.
- **may** marks an explicitly permitted choice.

Use ordinary lowercase words in informative prose. Keep the requirement separate from its rationale so a reader can identify what is mandatory without interpreting the explanation. They are typeset lowercase and bold, per the rule in [`doc-style-guide.md`](./doc-style-guide.md).

Apply one of these writing profiles to each section. A document can use different profiles for different sections.

### Strict profile

Use the strict profile for conventions, generated reference, architecture invariants, and contract comments.

- Use approved technical terms with one meaning and grammatical role.
- Use active voice and present tense.
- Name the actor or owner when it affects the contract.
- Put a condition before the action or result that it controls.
- Put one requirement or independently testable claim in each sentence.
- Use the same term for the same concept. Do not introduce synonyms for variation.
- Pair a rule with an approved example and a nonconforming example when the boundary is not obvious.
- Keep normative requirements separate from informative reasons, notes, and examples.

### Explanatory profile

Use the explanatory profile for architecture synthesis, decision rationale, plan framing, and the current synthesis of a design thread.

Use canonical technical terms and state current claims precisely. Longer causal explanations, comparisons, alternatives, and analogies are permitted when they preserve distinctions that the strict profile would hide.

### Historical and expressive profile

Use the historical and expressive profile for append-only design logs, archived material, quoted source context, and marketing prose.

Preserve the original reasoning and voice when they are part of the record. Do not rewrite historical text only to apply a later language rule. Use current canonical terms when new text describes current architecture.

## Conventions formats

The conventions tree splits into rule cards, the lexicon, and guidance. The authoring spec lives in [`contributing.md`](../architecture/conventions/contributing.md), the tree's narrowest owner, because it matters only when proposing changes to conventions files.

## The contributing.md convention

`contributing.md` is a reserved name for the authoring spec of one nested documentation level. Tree-level instances keep the lowercase spelling, as in `conventions/contributing.md`. Each instance carries the formats, admission tests, and structural checks for its level, and is read when proposing changes to that level's documents. The repository-wide practice lives in this contribution subtree. Do not use the reserved name for content documents.

## Every AGENTS.md is overview + index

An `AGENTS.md` contains hand-written directory guidance followed by a generated index. Guidance routes among multiple immediate production owners and records only cross-file or cross-boundary ownership, invariants, dependency direction, and composition points. File-local behavior remains with its source owner. A directory with one production file does not earn an `AGENTS.md`. Keep the file at the parent ownership boundary instead.

Documentation indexes derive entries from document frontmatter. Source indexes derive direct production-file entries from first-line source summaries, local Markdown entries from frontmatter, and immediate child-directory entries from nested `AGENTS.md` frontmatter. The tooling excludes `README.md` files from both indexing and validation because they serve public GitHub-facing documentation rather than agent retrieval. Agents find colocated test and spec files from the routed production file, which receive no index entries. The source-index tooling lands with its first migrated boundary. Do not create those listings by hand.

The root [`AGENTS.md`](../../AGENTS.md) orients the project and routes to directory indexes. Each lower index adds only the guidance owned at that level. Parent indexes expose child-directory summaries without recursively copying their file entries.

The index sits between `<!-- INDEX:START -->` and `<!-- INDEX:END -->`. [`docs-index.mjs`](../../scripts/docs-index.mjs) currently derives documentation entries from frontmatter. It covers the documentation containers and layers under `docs`, plus `plans`, `src/docs`, and `website`. Add or edit a document, then run these commands:

```sh
npm run docs:index     # regenerate the index blocks
npm run docs:check     # fail on stale indexes, malformed docs, or broken links
```

The check requires frontmatter and one H1 in living documentation Markdown files, except `README.md`. It also validates relative links, lifecycle values, and `kind` tags on indexed documentation. Archived plans retain their historical body shape.

Prose outside the markers is yours. The block between them is derived. **Never hand-edit it.** Do not add, reword, reorder, or delete entries inside the markers. The generator rebuilds the block from frontmatter, so `npm run docs:index` silently overwrites a manual edit, or `npm run docs:check` fails when it drifts. To change an entry, edit the doc's frontmatter `summary`/`read_when`/`status` (or rename the file) and regenerate. A small idea can live as a line in the overview prose. When it grows past a line, promote it to its own file and delete the prose line. The index then carries it, so it's never maintained in both places. Container indexes include immediate child directories and top-level documents.

## Design notes

The design-note authoring spec lives in [`AGENTS.md`](../design/AGENTS.md), the layer's narrowest owner, because it matters only when writing or revising design threads.

## Deferred framework work

The [plans backlog](../../plans/backlog.md) tracks documentation framework gaps (the compass test, kind-migration rules, the commit-time loop protocol, and budget tests).
