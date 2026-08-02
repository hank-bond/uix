---
summary: "The house style guide for UIX documentation: how this repo formats and writes docs, built from the repo's own practice; prose follows the direction of Simplified Technical English and Vale enforces the mechanical rules."
status: active
---

# Doc style guide

How this repo writes and formats documentation. This guide was built from the repo's own practice, section by section.

The reference hierarchy: tree-specific authoring structure, the layers, frontmatter, retrieval units, and the AGENTS.md overview-plus-index, lives in [`contributing.md`](./contributing.md) and outranks this guide.

These are guidelines, not rules. Depart deliberately when it serves readers, and be consistent when you depart.

Prose follows the direction of Simplified Technical English (STE), not its contract. The goal is simple, consistent, unambiguous prose, not a controlled language for life-critical documents. Prettier enforces formatting; Vale enforces the mechanical prose rules as they are encoded.

Docs here are read by both humans and agents, and orientation docs are often preloaded into the agent's context. Concise, self-contained prose serves the corpus twice over.

## Markdown formatting

### Principles

**Docs are current state:** a doc describes what exists now. When it is wrong or stale, fix it or delete it; cruft is the enemy.

**References resolve:** a doc references only artifacts that exist. Deleting an artifact deletes the references to it in the same change, including "came from A" provenance in B once A is gone. Migration history is dated material; it survives in the decision or design log that recorded it, not in the current-state doc.

**Update docs with code:** change documentation in the same change as the code it describes, so the two cannot drift apart.

**Plans are not docs:** planning artifacts live outside the docs tree, in the root-level `plans/`, and archive when done.

**The context budget is the shaping principle:** only frontmatter summaries are cheap enough to preload. The tree is organized around what is cheap to load. Docs are not pinned into the agent's context.

### Capitalization

The product name is **Pi**, capitalized at any position in a sentence; that is the official form. `UIX` stays uppercase, and other official names keep their own forms (`Electron`, `React`, `TypeBox`, `Prettier`).

Headings are sentence case. Prose has no all-caps and no camel case; those appear only in code.

Normative keywords are lowercase and bold, per RFC 2119 (Request for Comments 2119). The full keyword set is adopted by reference: **must**, **must not**, **required**, **shall**, **shall not**, **should**, **should not**, **recommended**, **may**, **optional**. A one-line "normative keywords follow RFC 2119" plus the TLDR is enough, since agents already know the standard. Their meanings live in the `contributing.md` doc.

### Document layout

Encode the existing shape. Two trees: `src/docs/` ships with the app and tracks code; `docs/` is dev-facing meta. Inside `docs/` the layers have their own shapes. `decisions/` are write-once and dated, `design/` threads are a living synthesis over an append-only log, and `architecture/` tracks HEAD. Plans live outside the tree.

Every doc follows its layer's conventions: frontmatter with a `summary` first, an H1 title close to the filename, then the layer's shape. Details live in [`contributing.md`](./contributing.md).

### Headings

ATX only, one H1 per doc, sentence case, no end punctuation. No em dashes in headings: use a colon or a comma. No code in headings.

Task headings start with an imperative verb ("Add a channel"); concept headings are noun phrases ("Channel contracts"). The rule is parallel structure: same-kind sections get same-form headings, and the form encodes the kind. Carve-outs: fixed structural labels ("## Current synthesis", "## Where to read") and terms whose gerund is the established name ("Logging").

### Lists

Numbered lists when order matters or the list implies full enumeration; bulleted otherwise. The axes are order and exhaustiveness: a numbered list says "all of these, in this order", a bulleted list says "some of these, no order".

Run-in lead-ins use **bold term + colon** ("**Term:** description"). Every item ends with a period, except items that are entirely code or link text. Items are parallel in syntax and start with a capital letter.

### Code

Fenced blocks for anything longer than a line, with the language always declared; fence, do not indent. Introduce a code sample with a complete sentence, and show omissions with a comment in the sample's language.

Placeholders in commands use the `{PLACE_HOLDER}` form: all-caps, underscore-separated, inside braces. Not `{{}}`, which collides with template interpolation, and not bare `PROJECT_ID`.

Code items in prose take a qualifying noun and are never inflected or possessed; see Wording.

### Links

Internal docs link by relative path, including `../` where needed. Link text is the target's filename in code font ("[`contributing.md`](./contributing.md)"), which opens in the editor and stays machine-checkable. Never "here", "link", or a bare URL as link text; do not link the same destination twice on one page.

Inline links by default; reference links only for long destinations (typically table cells) or repeats.

### Tables

Tables are for scannable comparison data: primitives, layers, lookups. Prefer lists when the same information reads as well in list form. Introduce a table with a complete sentence before it, use sentence-case column heads, keep cells short, and sort rows in a logical order. Wide reference lookups are fine; cells stay short unless the lookup needs prose.

### Prefer Markdown to HTML

Standard Markdown everywhere. HTML appears only where HTML is the content being documented (spec artifacts, JSX in code samples).

### Line wrapping

Do not hard-wrap prose. Write each paragraph and list item as a single line and let the editor soft-wrap it. Prettier enforces this (`proseWrap: "never"` unwraps any manual line breaks in prose), so a hard-wrapped paragraph will fail `npm run format:check`. Tables, code fences, and list structure are exempt; only running prose is unwrapped.

## Prose style

### Voice and tone

The following are banned.

- Exclamation marks.
- "Please", "simply", "it's easy", and "quickly" in procedures.
- Placeholder phrases ("please note", "at this time").
- Cutesy phrasing.
- Buzzwords and unexplained jargon.
- Superlatives and unverifiable claims ("designed for", not "guarantees").

Singular "they" covers a generic person.

### Prescriptive writing

The repo's own framework governs: the writing profiles and the RFC 2119 keywords in [`contributing.md`](./contributing.md) decide how prescriptive a document is. Design threads exist to weigh alternatives, and ordinary "should" in explanatory prose is fine; normative text uses the bold lowercase keywords.

### Timelessness and future features

Present tense for what exists. No "currently", "now", "new", "recently", or "as of this writing" as doc-time anchors; the present tense implies them. "Will" only for genuinely future behavior, and "currently" is fine when it describes live runtime state rather than document time. Decisions and design logs are date-anchored by design.

`src/docs/` is current state only: a not-yet-built surface lives in `plans/`, not as a stub in shipped docs.

### Person

The register is split. Reference and descriptive prose is impersonal ("the substrate registers each facet under the feature id"). Instructions and read-when triggers are imperative ("Add or edit a doc"). "You" appears where the reader is the actor. "We" and "our" may refer to the UIX project when the reader is not the actor. "user" is reserved for the cockpit's end user, never the doc reader.

### Active voice

The doer is the subject ("the substrate registers each facet under the feature id", not "each facet is registered"). Passive voice is fine to emphasize the object ("the file is saved"), to de-emphasize the actor, or when the actor does not matter. Name the actor when it affects the contract, which the strict profile in [`contributing.md`](./contributing.md) requires. The citation idiom "captured in [decision]" stays.

### Anthropomorphism

Mental-state verbs, wants, decides, prefers, believes, are reserved for agents, which genuinely act and can be steered. Machinery gets behavior verbs: derives, registers, loads, resolves, functions. The test: does the verb imply a mind? If it does, it is out for non-agents.

### Sentences and paragraphs

A sliding scale. Instructions and normative text are short and direct, one instruction per sentence, one requirement per sentence. Explanation and design prose are fluid but not chained: em-dash and clause stacking is hard to read and out. Explanation and design prose vary their rhythm: merge related claims with conjunctions and subordination, and keep short sentences for landing the point. Uniform short sentences read as machine prose. Aim at STE's plain vocabulary and directness, not its one-claim-per-sentence exactness; explanation and design prose flow.

**Bad:** one claim per sentence.

The explanation quadrant serves the human. It records reasoning, product judgment, and taste. The how-to and reference quadrants serve the agent. They state what to do and how the machinery behaves.

**Good:** the same claims, merged with conjunctions and subordination.

The explanation quadrant serves the human and records reasoning, product judgment, and taste. The how-to and reference quadrants serve the agent and state what to do and how the machinery behaves.

Keep articles and relative pronouns ("the `README.md` file", "the rules that you defined").

### Pronouns

Repeat the noun when "it" or "this" alone would be ambiguous; follow "this" and "these" with a noun ("this value", not "this"). Singular "they" for a generic person.

### Abbreviations and contractions

Spell out an abbreviation on first use in each document. No "e.g.", "i.e.", or "etc.": use "for example", "that is", and name the set. No periods in acronyms; pluralize them as words ("APIs").

Contractions split by register: none in reference, normative, or AGENTS docs ("it is", "does not"); allowed in design and plan prose ("doesn't", "can't").

### Numbers and dates

Spell out zero through nine; numerals for 10 and up, and always numerals for technical quantities (measurements, versions, dates, percentages, labels). Ordinals are spelled out ("first", not "1st"). Ranges use a hyphen with no spaces ("2012-2016"), enforced by Vale. Filenames and inline dates use `YYYY-MM-DD`.

### Punctuation

Two sentences beat interruption. The em dash is a last resort, not a default. A compound sentence reads better split in two, or joined with a semicolon when the clauses sit side by side. Em-dash chaining is garbled and out. Semicolons are fine when a long clause genuinely needs them, but usually two sentences are better.

Serial comma; comma after an introductory phrase; comma before "and" or "but" joining two independent clauses. A colon, not a dash, sets off a lead-in or a description-list item.

Straight quotes, not curly; commas and periods go inside the quotes. No slashes in prose ("and/or" becomes "or both"), no ellipses, no "&" as a conjunction. Keep parentheticals short, one space between sentences.

Bold for lead-ins and directional emphasis; italics for emphasis and for marking a new term. UI element names are bold. End punctuation goes outside link text.

### Notices

Blockquote banners mark lifecycle status: "> **Archived 2026-06-02.** Stage 1 shipped and is recorded in [...]".

A "**Note:**" is rare: one paragraph of information that is relevant but not necessary, where the reader succeeds without it. Never for cross-references, prerequisites, procedural steps, or anything in flow with the surrounding text. Never stack notices.

### Jargon and terms

A new term is introduced in _italics_ on first use; italics mark novelty without changing semantics. Bold is for lead-ins and directional emphasis, not term introduction. Do not use quotation marks for terms.

Code vocabulary is controlled by the lexicon in [`naming-and-comments.md`](./architecture/conventions/naming-and-comments.md). Vale enforces prose vocabulary as rules are built.

### Wording

The simplest word that works, always. Plainness reduces needless variation; these are not poems. STE is the direction, not the contract.

Code items in prose take a qualifying noun. They are never inflected or possessed ("`set`s" becomes "calls `set` on"), and never appear as optional plurals ("API(s)" becomes "one or more APIs"). The controlled lexicon adds semantic information to code identifiers; it is not a prose word list.

### Accessibility

Directional references in named form are house style: "the spikes above", "the entry below" name the content and point at it. Unnamed positional pointers ("the table above") are bad. Alt text waits until there are images; UI-target guidance waits for procedures.

## Deferred

- The positive voice target and the LLM-ese avoidance list (Voice and tone).
- A Procedures section, to be authored when the how-tos are built.

## Conformance backlog

- Drop the `_(stub)_` pages from `src/docs/` (`add-a-channel`, `add-a-feature`, `channels`, `first-feature`); not-yet-built surfaces are tracked in `plans/`.
- Set up Vale as the prose linter. Live: `extension` and `sentence-length`. Starter rules still to encode:
  - `utilize` to `use`.
  - `e.g.` to `for example`.
  - `i.e.` to `that is`.
  - `and/or` to `or both`.
  - `please` and `simply` to omit.
  - Curly quotes to straight quotes.
  - `Pi` capitalization.
  - `UIX` consistency.
  - Range hyphens. New rules come from this guide as sections land.
- Convert normative keywords to lowercase bold (RFC 2119) in `docs/architecture/conventions/naming-and-comments.md` (contributing.md done).
- Reformat em-dash headings: design log entries to colon form, convention cards to identifier without code font and a colon separator, including `contributing.md`'s templates.
- Remove em dashes from prose: split em-dash compounds into two sentences or semicolons; lead-ins and cards keep their colon forms.
- Convert run-in bold lead-ins from period to colon across the corpus.
- Convert bold term introductions to italics in `AGENTS.md` files and design threads.
- De-inflect code items in design prose ("`set`s registrations" becomes "calls `set` on registrations").
