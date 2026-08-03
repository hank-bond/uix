---
summary: "Author repository documentation through retrieval units, standard frontmatter, generated indexes, writing profiles, convention cards, lexicons, and living design threads."
kind: how-to
status: active
---

# Contributing to the docs

Use this reference to write and maintain repository documentation. [`AGENTS.md`](./AGENTS.md) maps the dev-facing layers, and the root [`AGENTS.md`](../AGENTS.md) maps every documentation tree.

## Put descriptive knowledge next to code

Code is the primary description of implemented behavior. Agents can inspect source cheaply, while a separate prose description creates synchronization cost.

Do not maintain a discrete document only to enumerate files, types, request paths, contribution fields, or current control flow. Put that knowledge at the narrowest owning source boundary:

- A source file states its stable responsibility in a one-line file summary.
- An exported contract explains what it is and how to use it directly in JSDoc.
- A source directory's `AGENTS.md` explains the directory's ownership, boundary, and direct usage.
- A generated directory index lists source files from their file summaries.

Required headers, shebangs, and license notices may precede a file summary. Otherwise, the summary is the first line. For TypeScript and JavaScript, use one `//` comment that states responsibility rather than repeating the filename.

Contract comments document preconditions, lifetimes, ordering, errors, defaults, and direct examples that callers need. They do not narrate the implementation or duplicate types.

A source `AGENTS.md` adds only directory-level guidance. Its generated listing provides recall and routing without a second hand-maintained implementation inventory.

This source-index model is approved but deferred until the post-sprint documentation migration. Do not create partial hand-maintained listings before the generator and migration path land together.

## What earns a discrete document

A discrete document must provide information that source inspection cannot cheaply and reliably recover. It earns its maintenance cost through at least one of these roles:

- A convention or invariant prescribes choices across multiple source units.
- A how-to joins several boundaries into one concrete, multi-step workflow.
- A design note or plan describes future work and unresolved choices.
- A decision preserves rationale, rejected alternatives, and the constraint that followed.
- External context explains a dependency, protocol, platform behavior, or product requirement not owned by this repository.
- A hard-won lesson records a trap, failure mode, or non-obvious reason that prevents a plausible mistake.

Face-value synthesis of implemented code does not qualify. Neither does a prose inventory whose main value is listing what exists today.

Before deleting a descriptive document, preserve anything the code cannot reveal. Look for rationale, rejected alternatives, external constraints, failure history, invariants, and counterintuitive behavior. Move each item to its narrowest durable home: a contract comment, convention, decision, design log, or cross-boundary how-to.

Use this placement test:

1. If one file answers the question, improve that file's names or comments.
2. If one directory answers it, improve that directory's `AGENTS.md` guidance.
3. If direct use of one export needs explanation, improve its contract JSDoc.
4. If a task crosses boundaries, write a concrete how-to.
5. If the value is prescription, rationale, external context, or future direction, write a discrete document.

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
- `src/docs/` states a public workflow or contract boundary that spans source units. Direct API facts remain in code comments.

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

An `AGENTS.md` contains hand-written directory guidance followed by a generated index. Guidance states the directory's ownership, boundaries, invariants, and direct usage. It does not manually summarize every child.

Documentation indexes derive entries from document frontmatter. Source indexes will derive file entries from first-line source summaries after the deferred source-index tooling lands.

The root [`AGENTS.md`](../AGENTS.md) orients the project and routes to directory indexes. Each lower index adds only the guidance owned at that level.

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

Apply these items after the current documentation sprint:

- **Source indexes:** Define the supported source-file summary syntax, generate directory listings, and introduce source `AGENTS.md` files along ownership boundaries.
- **Descriptive-doc migration:** Move direct usage into contract comments and directory guidance. Delete face-value synthesis only after preserving hard-won context.
- **Summary and `read_when`:** Define which documents require a trigger and how the thesis differs from the retrieval condition.

These framework gaps also remain:

- **Compass test:** Define the classification procedure for new and moved documents: action or cognition, then acquisition or application.
- **Migration rules:** Define triggers between kinds. Reference traffic can spawn a how-to, repeated comments can become conventions, and decisions can graduate to creed.
- **Loop protocol:** Define the commit-time loop: capture, distill residue, regenerate indexes, scan backports, and verify.
- **Budget tests:** Define the creed admission test and always-loaded root size discipline.
