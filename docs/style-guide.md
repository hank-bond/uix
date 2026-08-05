---
summary: "UIX documentation uses concise current-state prose, retrieval-oriented structure, consistent Markdown, and mechanically enforced vocabulary."
kind: reference
---

# Doc style guide

How this repo writes and formats documentation. We built this guide from the repo's own practice, section by section.

The reference hierarchy: tree-specific authoring structure, the layers, frontmatter, retrieval units, and the AGENTS.md overview-plus-index, lives in [`contributing.md`](./contributing.md) and outranks this guide.

These are guidelines, not rules. Depart deliberately when it serves readers, and be consistent when you depart.

Prose follows the direction of Simplified Technical English (STE), not its contract. The goal is simple, consistent, unambiguous prose, not a controlled language for life-critical documents. Prettier enforces formatting. Vale enforces the mechanical prose rules we encode.

Docs here are read by both humans and agents, and orientation docs are often preloaded into the agent's context. Concise, self-contained prose serves the corpus twice over.

## Markdown formatting

### Principles

**Docs are current state:** a doc describes what exists now. When it is wrong or stale, fix it or delete it. Cruft is the enemy.

**References resolve:** a document references only artifacts that exist. Deleting an artifact removes its references in the same change. Moving a target updates link destinations, including those in immutable records. Migration history belongs in dated decisions or design logs, not current-state documents.

**Keep knowledge with its owner:** update documentation in the same change as the code that it constrains. This includes source headers, JSDoc, implementation comments, directory guidance, and broader documents.

**Plans are not docs:** planning artifacts live outside the docs tree, in the root-level `plans/`, and archive when done.

**The context budget is the shaping principle:** only frontmatter summaries are cheap enough to preload. We organize the tree around what is cheap to load. We do not pin docs into the agent's context.

### Capitalization

The product name is **Pi**, capitalized at any position in a sentence. That is the official form. `UIX` stays uppercase, and other official names keep their own forms (`Electron`, `React`, `TypeBox`, `Prettier`).

Headings are sentence case. Prose has no all-caps and no camel case. Those appear only in code.

Normative keywords are lowercase and bold, per RFC 2119 (Request for Comments 2119). We adopt the full keyword set by reference: **must**, **must not**, **required**, **shall**, **shall not**, **should**, **should not**, **recommended**, **may**, **optional**. A one-line "normative keywords follow RFC 2119" plus the TLDR is enough, since agents already know the standard. Their meanings live in the `contributing.md` doc.

### Document layout

Encode ownership and scope. Source-coupled guidance lives beside its owning code. The `docs/` tree contains cross-boundary workflows, architecture, decisions, design threads, external context, and documentation practice. Root-level `plans/` tracks builds, and `website/` documents the marketing site. Decisions are write-once and dated, design threads place mutable synthesis over append-only logs, and architecture tracks HEAD.

The `src/docs/` tree hosts user-implementation how-tos. Do not add a face-value implementation inventory there merely because the page is feature-facing: reference facts live in the contracts and generated indexes.

Every doc follows its layer's conventions: frontmatter with a `summary` first, an H1 title close to the filename, then the layer's shape. Details live in [`contributing.md`](./contributing.md).

### Headings

ATX only, one H1 per doc, sentence case, no end punctuation. No em dashes in headings: use a colon or a comma. No code in headings.

Task headings start with an imperative verb ("Add a channel"). Concept headings are noun phrases ("Channel contracts"). The rule is parallel structure: same-kind sections get same-form headings, and the form encodes the kind. Carve-outs: fixed structural labels ("## Current synthesis", "## Where to read") and terms whose gerund is the established name ("Logging").

### Lists

Numbered lists when order matters or the list implies full enumeration, bulleted otherwise. The axes are order and exhaustiveness: a numbered list says "all of these, in this order", a bulleted list says "some of these, no order".

Run-in lead-ins use **bold term + colon** ("**Term:** description"). Every item ends with a period, except items that are entirely code or link text. Items are parallel in syntax and start with a capital letter.

### Code

Fenced blocks for anything longer than a line, with the language always declared. Fence, do not indent. Introduce a code sample with a complete sentence, and show omissions with a comment in the sample's language.

Placeholders in commands use the `{PLACE_HOLDER}` form: all-caps, underscore-separated, inside braces. Not `{{}}`, which collides with template interpolation, and not bare `PROJECT_ID`.

Code items in prose take a qualifying noun and are never inflected or possessed. See Wording.

### Links

Internal docs link by relative path, including `../` where needed. In prose, use the target filename in code font by default. For example, write "[`contributing.md`](./contributing.md)."

Generated indexes and directory routes use descriptive slugs because repeated `AGENTS.md` labels would hide destinations. Never use "here", "link", or bare URLs. Avoid repeating a destination within one short section. Repeat it in a long reference only when readers need a local route. Generated indexes may repeat authored overview links.

Inline links by default. Reference links only for long destinations (typically table cells) or repeats.

### Tables

Tables are for scannable comparison data: primitives, layers, lookups. Prefer lists when the same information reads as well in list form. Introduce a table with a complete sentence before it, use sentence-case column heads, keep cells short, and sort rows in a logical order. Wide reference lookups are fine. Cells stay short unless the lookup needs prose.

### Prefer Markdown to HTML

Standard Markdown everywhere. HTML appears only where HTML is the documented content (spec artifacts, JSX in code samples).

### Line wrapping

Do not hard-wrap prose. Write each paragraph and list item as a single line and let the editor soft-wrap it. Prettier enforces this (`proseWrap: "never"` unwraps any manual line breaks in prose), so a hard-wrapped paragraph will fail `npm run format:check`. Tables, code fences, and list structure are exempt. Only running prose is unwrapped.

## Prose style

### Voice and tone

We ban the following.

- Exclamation marks.
- "Please", "simply", "it's easy", and "quickly" in procedures.
- Placeholder phrases ("please note", "at this time").
- Cutesy phrasing.
- Buzzwords and unexplained jargon.
- Superlatives and unverifiable claims ("designed for", not "guarantees").

Singular "they" covers a generic person.

### Prescriptive writing

The repo's own framework governs: the writing profiles and the RFC 2119 keywords in [`contributing.md`](./contributing.md) decide how prescriptive a document is. Design threads exist to weigh alternatives, and ordinary "should" in explanatory prose is fine. Normative text uses the bold lowercase keywords.

### Timelessness and future features

Present tense for what exists. No "currently", "now", "new", "recently", or "as of this writing" as doc-time anchors. The present tense implies them. "Will" only for genuinely future behavior, and "currently" is fine when it describes live runtime state rather than document time. Decisions and design logs are date-anchored by design.

Living reference and source-local guidance describe current state only. A not-yet-built surface lives in `plans/`, not as a documentation stub.

### Person

The register is split. Reference and descriptive prose is impersonal ("the substrate registers each facet under the feature id"). Instructions and read-when triggers are imperative ("Add or edit a doc"). "You" appears where the reader is the actor. "We" and "our" may refer to the UIX project when the reader is not the actor. "user" is reserved for the software's end user, never the doc reader.

### Active voice

The doer is the subject ("the substrate registers each facet under the feature id", not "each facet is registered"). Passive voice is fine to emphasize the object ("the file is saved"), to de-emphasize the actor, or when the actor does not matter. Name the actor when it affects the contract, which the strict profile in [`contributing.md`](./contributing.md) requires. Source comments follow the same rule. [`comments.md`](./architecture/conventions/comments.md) states it for code. The citation idiom "captured in [decision]" stays.

### Anthropomorphism

Reserve mental-state verbs, wants, decides, prefers, believes, for agents, which genuinely act and can be steered. Machinery gets behavior verbs: derives, registers, loads, resolves, functions. The test: does the verb imply a mind? If it does, it is out for non-agents.

### Sentences and paragraphs

A sliding scale. Instructions and normative text are short and direct, one instruction per sentence, one requirement per sentence. Explanation and design prose are fluid but not chained: em-dash and clause stacking is hard to read and out. Explanation and design prose vary their rhythm: merge related claims with conjunctions and subordination, and keep short sentences for landing the point. Uniform short sentences read as machine prose. Aim at STE's plain vocabulary and directness, not its one-claim-per-sentence exactness. Explanation and design prose flow.

**Bad:** one claim per sentence.

The explanation quadrant serves the human. It records reasoning, product judgment, and taste. The how-to and reference quadrants serve the agent. They state what to do and how the machinery behaves.

**Good:** the same claims, merged with conjunctions and subordination.

The explanation quadrant serves the human and records reasoning, product judgment, and taste. The how-to and reference quadrants serve the agent and state what to do and how the machinery behaves.

Keep articles and relative pronouns ("the `README.md` file", "the rules that you defined").

### Pronouns

Repeat the noun when "it" or "this" alone would be ambiguous. Follow "this" and "these" with a noun ("this value", not "this"). Singular "they" for a generic person.

### Abbreviations and contractions

Spell out an abbreviation on first use in each document. No "e.g.", "i.e.", or "etc.": use "for example", "that is", and name the set. No periods in acronyms. Pluralize them as words ("APIs").

Contractions split by register: none in reference, normative, or AGENTS docs ("it is", "does not"). Allowed in design and plan prose ("doesn't", "can't").

### Numbers and dates

Spell out zero through nine. Numerals for 10 and up, and always numerals for technical quantities (measurements, versions, dates, percentages, labels). Ordinals are spelled out ("first", not "1st"). Ranges use a hyphen with no spaces ("2012-2016"). Vale enforces this. Filenames and inline dates use `YYYY-MM-DD`.

### Punctuation

Two sentences beat interruption. The em dash and the semicolon are out. A compound sentence reads better split in two, or joined with a comma or colon when the clauses sit side by side. Em-dash chaining is garbled and out. The allowed sentence punctuation is `,` `.` `?` `!` and `:`.

Serial comma, comma after an introductory phrase, comma before "and" or "but" joining two independent clauses. A colon, not a dash, sets off a lead-in or a description-list item.

Straight quotes, not curly. Commas and periods go inside the quotes. No slashes in prose ("and/or" becomes "or both"), no ellipses, no "&" as a conjunction. Keep parentheticals short, one space between sentences.

Bold for lead-ins and directional emphasis. Italics for emphasis and for marking a new term. UI element names are bold. End punctuation goes outside link text.

### Notices

Blockquote banners mark lifecycle status: "> **Archived 2026-06-02.** Stage 1 shipped and is recorded in [...]".

An update notice marks content that is complete and correct under present conditions but has a known invalidation trigger. It does not record unfinished work or a desired future improvement. Use the exact `> **Update when:**` label, followed by one observable condition and the required update or removal. Place it immediately before the smallest affected paragraph or section. Use one trigger per notice when practical. Do not use it for speculative changes, ordinary living content, generic TODOs, decisions, or plans. A supporting plan link may provide context, but it does not replace the observable condition.

A "**Note:**" is rare: one paragraph of information that is relevant but not necessary, where the reader succeeds without it. Never for cross-references, prerequisites, procedural steps, or anything in flow with the surrounding text. Never stack notices.

### Jargon and terms

Introduce a new term in _italics_ on first use. Italics mark novelty without changing semantics. Bold is for lead-ins and directional emphasis, not term introduction. Do not use quotation marks for terms.

The lexicon in [`lexicon.md`](./architecture/conventions/lexicon.md) controls code vocabulary. Vale enforces prose vocabulary as we build rules.

### Wording

The simplest word that works, always. Plainness reduces needless variation. These are not poems. STE is the direction, not the contract.

Code items in prose take a qualifying noun. They are never inflected or possessed ("`set`s" becomes "calls `set` on"), and never appear as optional plurals ("API(s)" becomes "one or more APIs"). The controlled lexicon adds semantic information to code identifiers. It is not a prose word list.

### Accessibility

Directional references in named form are house style: "the spikes above", "the entry below" name the content and point at it. Unnamed positional pointers ("the table above") are bad. Alt text waits until there are images. UI-target guidance waits for procedures.

## Deferred

- The positive voice target and the LLM-ese avoidance list (Voice and tone).
- A Procedures section, to author when the how-tos are built.
