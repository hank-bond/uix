---
summary: "UIX controls vocabulary by giving each word one role: keep single-meaning words, reserve domain terms, and retire overloaded words in favor of precise alternatives."
kind: reference
status: active
read_when: "Read before introducing a recurring word, reviewing wording in comments or docs, or extending the controlled lexicon."
---

# Reserved words

UIX prose and comments are mostly LLM-generated, so one concept drifts across several words and one word drifts across several meanings. This document is the process that assigns each controlled word one role, and the list that records the decisions.

The lexicon in [`naming-and-comments.md`](./naming-and-comments.md) defines approved meanings for code vocabulary. This list adds reserve and retire decisions on top of those meanings; it is not a second source of truth.

Scope: active code, comments, and documentation. Historical records (decisions, design threads, archives) keep their wording. Universal concrete nouns (`file`, `path`, `location`, `key`, `value`) never enter the list because their meaning is obvious in context.

## The rule

Each controlled word has one meaning and one part of speech. A defined noun cannot be used as a verb, and a defined verb cannot be used as a noun. All other uses are nonconforming.

## Decision procedure

Ask four questions in order:

1. **Overload.** Does the word have more than one common English sense? If not, keep it.
2. **Collision.** Do the other senses plausibly occur in UIX prose? If not, register-confined senses (legal, nautical) never collide, so keep it.
3. **Best carrier.** Is this word the best word for our meaning? If yes, reserve it: the domain meaning owns the word and every other sense is nonconforming.
4. **Cleaner alternative.** Does a single-meaning word cover our meaning? If yes, retire it: ban the word in all senses and use the alternative.

Candidates surface two ways. **Overload:** one word with several meanings, found by reading (as in `save`). **Drift:** one concept with several words, found by profiling the corpus (as in `combine`, `join`, `merge`, `collect` for `assemble`).

## Operating rules

- **No partial bans.** A word is reserved (our sense owns it) or retired (all senses are out). Banning one sense of a living word loses to the LLM distribution, which keeps producing the word in its other senses.
- **Overloaded words resolve to one role.** A word with both noun and verb senses in everyday English gets one defined role; the other role is actively nonconforming. Do not leave the second role ungoverned.
- **Decisions migrate their corpus.** When a word is reserved or retired, migrate existing nonconforming uses in the same change: identifiers, headers, comments, and active docs. Historical records keep their wording. Retiring a word that names an API operation includes a code rename.
- **The single-meaning word beats the plain word.** This overrides the simplest-word-that-works rule in the style guide when the plain word is overloaded (`retain` over `keep`).
- **Retirement requires a single-meaning alternative for every sense.** `save` retires because `persist`, `defer`, and `protect` each cover one sense cleanly.
- **Vale enforces only the negative space:** retired words and always-wrong patterns. Semantic alignment is a review and LLM pass against this list.

## Table format

Each entry follows the STE shape: one word, one part of speech, one meaning, one conforming example, one nonconforming example. Agents extend the tables in place with the same shape; a new word starts with one conforming and one nonconforming example.

## Reserved terms

Domain nouns own their word; verb uses of the same spelling are nonconforming.

| Term (PoS) | Approved meaning | Conforming example | Nonconforming example |
| --- | --- | --- | --- |
| `turn` (noun) | One user–agent prompt–response exchange. | "agent turn"; "turn state" | "Turns read and write tool paths into stable locations" (verb use) |
| `store` (noun) | Durable source-of-truth API or implementation. | "the document store" | "Stores each document's current content" (use `persists`) |
| `buffer` (noun) | Live, feature-specific working projection over a store. | "canvas document buffer" | "Buffers feature-provided context" (use `accumulates`) |
| `surface` (noun) | Contributed UI composition. | "the workspace surface" | "the error surfaces when it fails" (use `appears`) |
| `channel` (noun) | Typed request/response contract. | "feature channel requests" | "channels resources into the runtime" (use `routes`) |
| `report` (noun) | A collection of information prepared for agent or human consumption, such as an analysis artifact. | "reports, dashboards, and knowledge tools"; "a report renderer" | "Myers reports only real changes" (use `returns`); "report diagnostics" (use `expose`) |

## Retired terms

The word is banned in all senses; use the stated alternative.

| Term (PoS) | Approved meaning | Conforming example | Nonconforming example |
| --- | --- | --- | --- |
| `save` (verb) | Retired. Use `persist` for durable storage, `defer` for a later time, `protect` for keeping safe. | "Persists each document's current content" | "Saves each document's current content"; "save it for later" |
| `verify` (verb) | Retired for structural checks. Use `validate`. | "validates the transport scheme and origin host" | "verifies the transport scheme and origin host" |
| `supply` (verb) | Retired. Use `provide`. | "provides the resource address" | "supplies the resource address" |
| `carry` (verb) | Retired. Name the actual relationship: `includes`, `holds`, or the specific relation. | "the factory return type holds the schema" | "the factory return type carries the schema" |

## Locked meanings

The word stays, with one meaning that cannot drift.

| Term (PoS) | Approved meaning | Conforming example | Nonconforming example |
| --- | --- | --- | --- |
| `assemble` (verb) | Combine multiple defined or materialized parts into one runtime artifact. Do not use `combine`, `join`, `merge`, or `collect` for this operation. | "Assembles each feature's system-prompt section in workspace order" | "Collects each feature's system-prompt section and joins them for Pi" |
| `validate` (verb) | Apply schema or structural checks. `check` remains for constraint tests. | "validates query with TypeBox" | "checks query with TypeBox" |
| `commit` (verb) | Accept validated candidate state into an authority at an explicit boundary. | "Commits and restores each feature's private branch state" | "Saves and restores each feature's private branch state" |
| `persist` (verb) | Write durable state; the mechanism verb. | "Pi persists the entry" | "Pi saves the entry" |
| `provide` (verb) | Actively hand something to a consumer. | "provides the resource address" | "supplies the resource address" |
| `expose` (verb) | Make reachable through a public contract. | "jiti's interop proxy exposes named exports" | "exposes the address to the renderer" (use `provides`) |
| `emit` (verb) | Produce an event. Do not emit values or rows. | "main emits the event" | "emits the authoritative born-keyed row" (use `sends`) |
| `retain` (verb) | Hold onto a value or membership across changes. Prefer over `keep` for this sense. | "retains the latest value" | "keeps the latest value" |
| `mirror` (verb) | Reflect live external changes or events into an internal view or state, with side effects. The non-pure counterpart to `derive`. | "Mirrors live Pi session events as renderer transcript updates"; "mirrors Pi-initiated model changes into status" | "Turns live Pi session events into renderer transcript updates" |
| `rekey` (verb) | Replace a live row's temporary transport identity with its durable canonical identity at the persistence boundary. | "Rekeys temporary live transcript IDs to durable Pi entry IDs when messages are persisted" | "Replaces temporary live transcript IDs with durable Pi entry IDs when messages are saved" |
