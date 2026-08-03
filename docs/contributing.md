---
summary: "Place code-related knowledge at its narrowest owner and author discrete documents through retrieval units, frontmatter, generated indexes, writing profiles, conventions, and living design threads."
kind: how-to
status: active
---

# Contributing to the docs

Use this reference to write and maintain repository documentation. [`AGENTS.md`](./AGENTS.md) maps the repository-level layers, and the root [`AGENTS.md`](../AGENTS.md) maps every documentation tree.

## Place knowledge at its narrowest owner

Code is the primary description of implemented structure and behavior. Names, types, imports, and control flow carry knowledge _of_ the code. Documentation carries knowledge _about_ the code: responsibility, correct usage, ownership, rationale, coordination, constraints, and external context.

Place each item at the narrowest boundary whose correctness changes with that information:

| Scope | Owner |
| --- | --- |
| One implementation choice or constraint | A line comment beside the code. |
| Direct use of one exported contract | JSDoc above the export. |
| One file's stable responsibility | The source-file header. |
| Ownership, dependency direction, or coordination within one source directory | That directory's `AGENTS.md`. |
| One source directory's multi-file context | A local Markdown leaf indexed by that directory's `AGENTS.md`. |
| A multi-boundary workflow, convention, invariant, external constraint, decision, or design history | Repository documentation. |

Direct code relationships remain imports. Do not maintain prose importer lists. Use a JSDoc `{@link}` or directory guidance only when a conceptual relationship is necessary for correct use and is not evident from imports and types.

### Source-file headers

Every indexed authored source file starts with one indexable line that states its stable responsibility. The summary is physically the first line, without exceptions. For TypeScript and JavaScript, use one `//` sentence that names the domain responsibility, operation, result, or authority boundary without repeating the path or filename.

Source indexes cover authored TypeScript and JavaScript files, including tests and declarations, plus CSS and HTML. CSS uses one single-line `/* */` summary, while HTML uses one single-line `<!-- -->` summary. JSON, binary assets, and static data are not indexed. Local Markdown and child `AGENTS.md` entries derive summaries from frontmatter.

The summary must distinguish the file from its siblings and remain true when implementation mechanics or callers change. Do not enumerate exports, narrate control flow, describe future intent, or add guessed search synonyms. If one coherent summary cannot describe the file, reconsider its responsibilities.

The header may continue with one concise paragraph of file-wide context. Preserve hidden guarantees, external constraints, failure boundaries, rationale, and other knowledge that is not cheap or reliable to infer from the implementation. Do not use the paragraph as an export inventory or control-flow narration.

### Contract and implementation comments

JSDoc serves callers. Document preconditions, lifetimes, ownership, ordering, errors, defaults, special outcomes, and direct examples that callers need. Do not duplicate names, fields, parameter types, or return types.

A TypeScript `export` keyword does not by itself create a supported public boundary. Document every supported `@uix/api` contract. Document an internal export when correct use or a conceptual relationship is not evident from its name and type.

Line comments serve implementation readers. Explain a non-obvious reason, external quirk, load-bearing order, or hidden constraint. The implementation already shows its ordinary process, so do not narrate syntax or control flow.

An update trigger records the known validity boundary of an artifact that is complete and correct under present conditions. Use the exact `Update when:` label, followed by one observable condition and the required update or removal. Before that condition occurs, the marker creates no pending work. Do not use it for unfinished work, desired improvements, speculative changes, or plan stages.

### Directory guidance and local leaves

A source `AGENTS.md` states its directory's ownership, boundary, dependency direction, composition points, and non-obvious conceptual coordination. Its generated index lists direct source files, local Markdown leaves, and immediate child `AGENTS.md` summaries. A parent does not flatten every descendant source file.

A local Markdown leaf earns its place when several files under one source owner must be understood together. Put broader workflows and context in repository documentation. Do not create hand-maintained source listings before the generator and first migration land together under [`code-proximate-documentation.md`](../plans/code-proximate-documentation.md).

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
5. If one directory owns the coordination, improve its `AGENTS.md` or add one local retrieval unit.
6. If the task or context crosses ownership boundaries, write a repository document.

## The four document layers

Each document layer has its own filename convention, summary template, and lifecycle. If the file is a point-in-time event, put the date in its filename. If it contains dated events, keep dates inside it.

| Layer | Filename | Summary states | Mutability |
| --- | --- | --- | --- |
| `decisions/` | `YYYY-MM-DD-slug` | the conclusion | write-once (only `status` may change) |
| `design/` | `problem-name` | the open question + axes | synthesis mutable, `## Log` append-only |
| `architecture/` | `constraint-name` | a current cross-cutting invariant or hard-won context | living, always = HEAD |
| `../plans/` | `deliverable` | the deliverable + units | active → landed or archived under `../plans/archive/` |

The distillation pipeline runs left-to-right in time: _design note → decision → plan → architecture_. Each step becomes more distilled and stable. Only the design note preserves every rejected alternative. Later records carry the applicable conclusion or enduring constraint.

## Frontmatter

The filename already carries the slug (and, for decisions, the date), so frontmatter adds only what position can't:

```yaml
---
summary: "What this document establishes: its thesis, not its topic."
read_when: "Read before {ACTIVITY} when the trigger is not obvious from the summary." # optional
status: accepted | exploring | resolved | active | landed | archived | stub | superseded
---
```

One rule governs both fields: **don't duplicate what's already in the reader's context when they read the field.** The slug is in the link, the category is in the directory, and the summary sits next to `read_when` once the index is in scope. Restating any of those wastes the line.

- **`summary` (required):** The document's _recall surface_. An agent scans it to decide whether the document is relevant. It states the thesis rather than the topic. Compressing the body is appropriate because the body is not yet in context. Make each summary findable by concept and distinct from siblings. Interchangeable sibling summaries indicate a boundary problem.
- **`read_when` (optional):** The _external trigger_ that adds precision. Author it only when the summary does not reveal why to open the document:
- A **cross-vocabulary** trigger: the task is phrased in words the thesis doesn't use.
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

This guidance applies to every repository-owned Markdown file, including each `AGENTS.md` file and the `README.md` file. _Decisions freeze their frontmatter and prose at acceptance_; only `status` may change. Link destinations may change when files move so references continue to resolve. _Living docs stay current._ Cross-link documents with ordinary inline Markdown links, not a frontmatter field.

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

Use ordinary lowercase words in informative prose. Keep the requirement separate from its rationale so a reader can identify what is mandatory without interpreting the explanation. They are typeset lowercase and bold, per the rule in [`style-guide.md`](./style-guide.md).

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

## Convention rule cards

Give each convention rule a stable semantic identifier. Use a lowercase dotted identifier such as `naming.callable-role`. Do not use sequential numbers that change when rules move or new rules are inserted.

Use this structure:

```markdown
### naming.callable-role: Name callable types by role

**Rule: must.** Name a callable type with a noun that states its callable role.

**Approved example** ...

**Nonconforming example** ...

**Reason** ...

**Exceptions** ...

**Enforcement** ...
```

The **Rule** is normative. The other sections are informative unless they contain an explicit normative keyword.

Include **Scope** after **Rule** when a rule applies to less than the containing document's stated scope. Include approved and nonconforming examples when a plausible boundary mistake exists. Include **Exceptions** only for accepted exceptions. Include **Enforcement** only when review, a repository check, a type-system constraint, or another concrete mechanism can verify the rule. Omit a section when it adds no information.

Keep one independently enforceable requirement in each rule card. Split requirements that have different scopes, exceptions, or enforcement mechanisms. Keep closely related cards in one retrieval unit when readers normally apply them together.

## Controlled lexicon entries

The identifier grammar that code authors apply lives in [`naming-and-comments.md`](./architecture/conventions/naming-and-comments.md). This section governs changing that grammar and its controlled lexicon.

Use an STE-style contrast table for controlled architectural vocabulary:

| Term (part of speech) | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- |
| `Handler` (noun) | Callable that processes one occurrence. Use `Handle` for a consumer-held capability. | `ChannelRequestHandler` | `ChannelTransportHandle` |

The approved meaning defines the term's permitted boundary. The alternatives identify the approved term for a meaning that this term does not cover. The nonconforming example shows a plausible use that violates the boundary; it is not an example of generally poor code.

### Lexicon row requirements

**Term:** Give the exact approved spelling and part of speech. Give each word form and each approved meaning its own row. Sort terms alphabetically within their class.

**Approved meaning and alternatives:** Start with a positive boundary definition. State the property that distinguishes the term from its nearest alternatives, and name those alternatives explicitly. Do not define the term through a current implementation or file location. Do not name an undefined alternative; admit it in the same change or link to its existing entry.

**Approved example:** Use the smallest realistic example that demonstrates the distinguishing property. Prefer an existing UIX identifier or a planned replacement from an active migration. Show a call site when the identifier alone does not demonstrate the meaning. Do not add unrelated details.

**Nonconforming example:** Show a plausible mistake that a competent author might make. Change only the semantic axis that the entry defines when practical. State the approved replacement when it is not obvious. Do not use a strawman, malformed syntax, generally poor code, or only the reverse spelling of the approved example.

Before admitting a row, apply these quality tests:

1. **Choice:** Can a reviewer choose between this term and its nearest alternative?
2. **Role:** Does the term have one grammatical role?
3. **Boundary:** Does the nonconforming example cross the exact boundary described?
4. **Plausibility:** Could this mistake reasonably appear in UIX?
5. **Replacement:** Is the compliant replacement evident?
6. **Independence:** Does the definition survive an implementation change?
7. **Completeness:** Are all named alternatives already defined?
8. **Orthogonality:** For an operation/result pair, does the verb identify the transition independently from the noun's result role? Does the noun identify the result independently from the verb?
9. **Leverage:** Does the term collapse a real recurring choice across contexts instead of restating a result type, downstream use, or local implementation detail?

If a row cannot provide a strong nonconforming example, its boundary is not settled or the term does not yet need controlled-lexicon status.

Maintain separate tables for these term classes:

- **UIX-owned terms** have one approved meaning and grammatical role.
- **Imported terms** retain the meaning and grammar of the named source API, such as Pi, Electron, React, or a browser standard.
- **Retired terms** identify the approved replacement and remain only while they help review or automated checks prevent regression.

Add a UIX-owned term when it first becomes exported, architectural, or recurrent. Add it in the same change that introduces that use. Do not add every local implementation word. If the term's boundary cannot be stated with an approved and a nonconforming example, continue the design work before admitting the term.

Do not preserve a retired alias in code only because it remains in the lexicon. The retired entry supports migration and review; it does not provide compatibility.

## Every AGENTS.md is overview + index

An `AGENTS.md` contains hand-written directory guidance followed by a generated index. Guidance states the directory's ownership, boundaries, invariants, dependency direction, composition points, and direct usage. It does not manually summarize every child.

Documentation indexes derive entries from document frontmatter. Source indexes derive direct file entries from first-line source summaries, local Markdown entries from frontmatter, and immediate child-directory entries from nested `AGENTS.md` frontmatter. The source-index tooling lands with its first migrated boundary; do not create those listings by hand.

The root [`AGENTS.md`](../AGENTS.md) orients the project and routes to directory indexes. Each lower index adds only the guidance owned at that level. Parent indexes expose child-directory summaries without recursively copying their file entries.

The index sits between `<!-- INDEX:START -->` and `<!-- INDEX:END -->`. [`docs-index.mjs`](../scripts/docs-index.mjs) currently derives documentation entries from frontmatter. It covers `docs/decisions`, `docs/design`, `docs/architecture`, its convention cards, `plans`, `src/docs`, and `website`. Add or edit a document, then run these commands:

```sh
npm run docs:index     # regenerate the index blocks
npm run docs:check     # fail on stale indexes, malformed docs, or broken links
```

The check requires frontmatter and one H1 in living documents. It also validates relative links, lifecycle values, and `kind` tags on indexed documentation. Archived plans retain their historical body shape.

Prose outside the markers is yours; the block between them is derived. **Never hand-edit it.** Do not add, reword, reorder, or delete entries inside the markers. The block is regenerated from frontmatter, so a manual edit is silently overwritten by `npm run docs:index` or fails `npm run docs:check` when it drifts. To change an entry, edit the doc's frontmatter `summary`/`read_when`/`status` (or rename the file) and regenerate. A small idea can live as a line in the overview prose. When it grows past a line, promote it to its own file and delete the prose line. The index then carries it, so it's never maintained in both places. Top-level docs in `docs/` (like this one) sit outside the indexed layers and are reached by prose links from `AGENTS.md`, not an index.

## Design notes are living threads

A design note is **a current synthesis on top of an append-only dated log**:

```markdown
## Current synthesis <- rewritten freely; frontmatter tracks this

## Log <- append-only; never rewritten

### 2026-06-01: framing

### 2026-07-…: revisited
```

Revisit a topic across sessions by appending a dated `## Log` entry and updating the synthesis. When it resolves, flip `status: resolved` and link the decisions and plans it spawned.

## Deferred framework work

The active [`code-proximate-documentation.md`](../plans/code-proximate-documentation.md) plan covers source-index tooling and ownership-based migration. These framework gaps remain:

- **Compass test:** Define the classification procedure for new and moved documents: action or cognition, then acquisition or application.
- **Migration rules:** Define triggers between kinds. Reference traffic can spawn a how-to, repeated comments can become conventions, and decisions can graduate to creed.
- **Loop protocol:** Define the commit-time loop: capture, distill residue, regenerate indexes, scan backports, and verify.
- **Budget tests:** Define the creed admission test and always-loaded root size discipline.
