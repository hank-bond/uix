---
summary: "UIX prose uses concise current-state language, stable terminology, direct sentence structure, and mechanically enforced wording and punctuation."
kind: reference
read_when: "Read before writing or reviewing documentation prose, terminology, voice, or punctuation, or before adding a prose-style rule."
---

# Prose style

These guidelines define how the repository writes documentation. Depart deliberately when it serves readers, and remain consistent when departing.

Prose follows the direction of Simplified Technical English (STE), but does not implement it concretely. Vale enforces the mechanical prose rules that the repository encodes. Humans review the documentation, and agents apply it. Concise, self-contained prose serves both.

## Capitalization

The product name is **Pi**, capitalized at any position in a sentence. `UIX` stays uppercase, and other official names keep their forms, including `Electron`, `React`, `TypeBox`, and `Prettier`.

Headings are sentence case. Prose has no all-caps or camel case. Those forms appear only in code.

Normative keywords are lowercase and bold. The [`writing-profiles.md`](./writing-profiles.md) reference defines their meaning and use.

## Voice and tone

Do not use:

- Exclamation marks.
- "Please," "simply," "it's easy," or "quickly" in procedures.
- Placeholder phrases such as "please note" and "at this time."
- Cutesy phrasing.
- Buzzwords or unexplained jargon.
- Superlatives or unverifiable claims. Write "designed for" rather than "guarantees."

Use singular "they" for a generic person.

## Prescriptive writing

The writing profiles decide how prescriptive a section is. Design threads exist to weigh alternatives, and ordinary "should" in explanatory prose is informative. Normative text uses the bold lowercase keywords.

## Timelessness and future features

Use present tense for what exists. Do not use "currently," "now," "new," "recently," or "as of this writing" as document-time anchors. Present tense already implies them. "Will" is only for genuinely future behavior. "Currently" remains valid when it describes live state rather than document time.

Living reference and source-local guidance describe current state only. Decisions and design logs are date-anchored by design. A not-yet-built capability belongs in `plans/`, not in a documentation stub.

Non-plan documents do not cite plans, plan units, or the timing of future work. A note that content awaits a later change, holds a temporary state, or expects rework belongs in the plan that schedules it. Decision records may reference plans as a whole for attribution, and design threads may reference plans as a whole. Documents that track the current state of active work, such as the architecture build map and open questions, may reference plans. Indexes and the documentation model navigate to the plans tree without making plan content authoritative for their claims. See [documentation.plan-reference](../architecture/conventions/rules/documentation.plan-reference.md).

## Person

Use an impersonal register for reference and descriptive prose. For example, "the substrate registers each facet under the feature id." Use the imperative for instructions and read triggers: "Add or edit a document."

Use "you" when the reader is the actor. "We" and "our" may refer to the UIX project when the reader is not the actor. Reserve "user" for the software's end user, never the document reader.

## Active voice

Use active voice: "the substrate registers each facet under the feature id." Avoid passive voice when the actor matters.

Passive voice may emphasize the object, de-emphasize the actor, or describe a state. Name the actor when it affects the contract, as required by the strict writing profile.

The [`comments.md`](../architecture/conventions/comments.md) convention governs source comments. The citation idiom "captured in [decision]" remains acceptable.

## Anthropomorphism

Reserve mental-state verbs, including wants, decides, prefers, and believes, for agents, which genuinely act and can be steered. Machinery uses behavior verbs such as derives, registers, loads, resolves, and functions. Ask whether the verb implies a mind. If it does, do not apply it to machinery.

## Sentences and paragraphs

Instructions and normative text are short and direct, with one instruction or requirement per sentence. Explanation and design prose may use longer causal explanations, but avoid clause stacking and interruptions.

Vary the rhythm of explanatory prose. Merge related claims with conjunctions and subordination, and retain short sentences for emphasis. Uniform short sentences read as machine prose. Aim at STE's plain vocabulary and directness rather than its exact one-claim-per-sentence discipline.

**Bad:** one claim per sentence.

The explanation quadrant serves the human. It records reasoning, product judgment, and taste. The how-to and reference quadrants serve the agent. They state what to do and how the machinery behaves.

**Good:** the same claims, merged where they belong together.

The explanation quadrant serves the human and records reasoning, product judgment, and taste. The how-to and reference quadrants serve the agent and state what to do and how the machinery behaves.

Keep articles and relative pronouns, as in "the `README.md` file" and "the rules that you defined."

## Pronouns

Repeat the noun when "it" or "this" alone would be ambiguous. Follow "this" and "these" with a noun, such as "this value." Use singular "they" for a generic person.

## Abbreviations and contractions

Spell out an abbreviation on first use in each document. Do not use "e.g.," "i.e.," or "etc." Use "for example," "that is," and name the set. Do not use periods in acronyms. Pluralize acronyms as words, such as "APIs."

Do not use contractions in reference, normative, or `AGENTS.md` prose. Contractions are permitted in design and plan prose.

## Numbers and dates

Spell out zero through nine. Use numerals for 10 and above and for technical quantities, including measurements, versions, dates, percentages, and labels. Spell out ordinals. Use a hyphen without spaces for ranges. Filenames and inline dates use `YYYY-MM-DD`.

## Punctuation

Prefer two sentences to an interruption. Do not use em dashes or semicolons. Split a compound sentence, or use a comma or colon when the clauses sit side by side. The permitted sentence punctuation is `,` `.` `?` `!` and `:`.

Use the serial comma. Add a comma after an introductory phrase and before "and" or "but" when it joins independent clauses. Use a colon for a lead-in or description-list item.

Use straight quotes. Put commas and periods inside quotes. Do not use slashes, ellipses, or `&` as a conjunction. Replace "and/or" with "or both." Keep parentheticals short, and use one space between sentences.

Use bold for lead-ins and directional emphasis. Use italics for emphasis and to introduce a term. Use bold for user interface element names. Put end punctuation outside link text.

## Notices

Blockquote banners mark lifecycle status: "> **Archived 2026-06-02.** Stage 1 shipped and is recorded in [...]."

An update notice marks complete and correct content with a known invalidation trigger. Use the exact `> **Update when:**` label, followed by one observable condition and the required update or removal. Place it immediately before the smallest affected paragraph or section. Use one trigger per notice when practical.

Do not use an update notice for speculative changes, ordinary living content, unfinished work, desired improvements, generic TODOs, decisions, or plans. A supporting plan link may provide context, but it does not replace the observable condition.

A "**Note:**" is rare: one paragraph of relevant but unnecessary information where the reader succeeds without it. Do not use a note for cross-references, prerequisites, procedural steps, or information in the surrounding flow. Do not stack notices.

## Jargon and terms

Introduce a term in italics on first use. Italics mark novelty without changing semantics. Bold is for lead-ins and directional emphasis, not term introduction. Do not use quotation marks for terms.

The [`lexicon`](../architecture/conventions/lexicon/AGENTS.md) controls code vocabulary. Vale enforces prose vocabulary as rules are added.

## Wording

Use the simplest word that preserves the meaning. Plainness reduces needless variation. STE is a direction, not a contract.

Code items in prose take a qualifying noun. Do not inflect them or make them possessive. Replace "`set`s" with "calls `set` on." Do not write optional plurals. Replace "API(s)" with "one or more APIs." The controlled lexicon adds semantic information to code identifiers. It is not a general prose word list.

## Accessibility

Use named directional references, such as "the spikes above" and "the entry below." Avoid unnamed pointers such as "the table above."

Add alt text when documents contain images. When procedures require it, add user interface target guidance.

## Deferred

- The positive voice target and the LLM-ese avoidance list.
- A procedures section when the repository authors procedure-specific conventions.
