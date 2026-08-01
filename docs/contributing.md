---
summary: "How to author and maintain repository docs: layers and retrieval units, frontmatter and rollups, normative language and writing profiles, convention-rule and lexicon formats, prose formatting, and living design-note threads."
kind: how-to
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

## Documents are retrieval units

A leaf document is the smallest set of information that a reader should load together to perform one kind of work correctly. Choose document boundaries by retrieval and application, not by heading count, source-directory layout, or similar subject matter.

Evaluate each candidate section on four axes:

- **Trigger:** What activity makes a reader open it?
- **Scope:** Which audience, process, layer, or kind of code does it govern?
- **Dependency:** Which other information must a reader load to understand or apply it?
- **Change coupling:** Which other rules or claims normally change with it?

Keep sections together when a reader normally needs them for the same decision, when one depends on the other, or when their summaries and reading triggers would be substantially the same. Split them when they have materially different triggers or scopes, change independently, and can each state a distinct thesis.

Use the frontmatter as the boundary test. A good leaf has one summary that states its thesis and, when needed, one clear `read_when` trigger. A summary that must enumerate unrelated claims or a trigger that must list unrelated activities indicates that the leaf is not one retrieval unit.

Document length is a constraint, not the organizing principle. One substantial rule can be its own leaf when it has an independent trigger. A short rule without an independent trigger should remain with the rules that a reader applies with it.

## Normative language and writing profiles

Use `MUST`, `SHOULD`, and `MAY` only for normative requirements:

- **`MUST`** marks a requirement. A conforming change cannot violate it.
- **`SHOULD`** marks the required default when a valid, stated reason can justify an exception.
- **`MAY`** marks an explicitly permitted choice.

Uppercase these words only when they have these meanings. Use ordinary lowercase words in informative prose. Keep the requirement separate from its rationale so a reader can identify what is mandatory without interpreting the explanation.

Apply one of these writing profiles to each section. A document can use different profiles for different sections.

### Strict profile

Use the strict profile for conventions, API reference, architecture invariants, and contract comments.

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
### naming.callable-role — Name callable types by role

**Rule — MUST.** Name a callable type with a noun that states its callable role.

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

**Term.** Give the exact approved spelling and part of speech. Give each word form and each approved meaning its own row. Sort terms alphabetically within their class.

**Approved meaning / alternatives.** Start with a positive boundary definition. State the property that distinguishes the term from its nearest alternatives, and name those alternatives explicitly. Do not define the term through a current implementation or file location. Do not name an undefined alternative; admit it in the same change or link to its existing entry.

**Approved example.** Use the smallest realistic example that demonstrates the distinguishing property. Prefer an existing UIX identifier or a planned replacement from an active migration. Show a call site when the identifier alone does not demonstrate the meaning. Do not add unrelated details.

**Nonconforming example.** Show a plausible mistake that a competent author might make. Change only the semantic axis that the entry defines when practical. State the approved replacement when it is not obvious. Do not use a strawman, malformed syntax, generally poor code, or only the reverse spelling of the approved example.

Before admitting a row, apply these quality tests:

1. **Choice:** Can a reviewer choose between this term and its nearest alternative?
2. **Role:** Does the term have one grammatical role?
3. **Boundary:** Does the nonconforming example cross the exact boundary described?
4. **Plausibility:** Could this mistake reasonably appear in UIX?
5. **Replacement:** Is the compliant replacement evident?
6. **Independence:** Does the definition survive an implementation change?
7. **Completeness:** Are all named alternatives already defined?
8. **Orthogonality:** For an operation/result pair, does the verb identify the transition independently from the noun's result role, and does the noun identify the result independently from the verb?
9. **Leverage:** Does the term collapse a real recurring choice across contexts instead of restating a result type, downstream use, or local implementation detail?

If a row cannot provide a strong nonconforming example, its boundary is not settled or the term does not yet need controlled-lexicon status.

Maintain separate tables for these term classes:

- **UIX-owned terms** have one approved meaning and grammatical role.
- **Imported terms** retain the meaning and grammar of the named source API, such as Pi, Electron, React, or a browser standard.
- **Retired terms** identify the approved replacement and remain only while they help review or automated checks prevent regression.

Add a UIX-owned term when it first becomes exported, architectural, or recurrent. Add it in the same change that introduces that use. Do not add every local implementation word. If the term's boundary cannot be stated with an approved and a nonconforming example, continue the design work before admitting the term.

Do not preserve a retired alias in code only because it remains in the lexicon. The retired entry supports migration and review; it does not provide compatibility.

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

## Open framework gaps

Sections identified to build together by going through them reactively — listed here as placeholders, not yet authored:

- **Compass test** — the "what kind is this?" classification procedure for new and moved docs (action or cognition? acquisition or application?), per the four kinds.
- **Migration rules** — the triggers that move content between kinds: reference traffic spawning a how-to, rationale graduating out of a how-to, repeated comments becoming convention cards, decisions graduating to creed.
- **Loop protocol** — the commit-time steps of the decision loop: capture, distill residue, index regeneration, backport scan, verify pass.
- **Budget tests** — the creed admission test and the always-loaded root size discipline.
