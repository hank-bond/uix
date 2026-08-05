---
summary: "Comments answer why code exists or how to use it correctly: line comments carry reasons, JSDoc carries caller integration."
kind: reference
read_when: "Read before writing source-file summaries or explanatory comments."
---

# Comments

Every comment answers one of two questions. A line comment answers why the code exists as written: which hidden constraint, external quirk, side effect, or optimization it mitigates. JSDoc answers how to integrate the code correctly: preconditions, lifetimes, ownership, ordering, errors, defaults, and direct examples a caller needs. A how-to carries the second question at workflow scale, joining several exports into one task, and links to JSDoc rather than restating it. A comment that answers neither question narrates what the code already shows.

Outside the required source-file header, a comment explains why code exists or records a non-obvious caller or implementation constraint. It does not narrate syntax. Names carry the stable domain operation.

## Voice

Write comments in active voice. Make the actor the subject when the actor is knowable: "the store canonicalizes content before persisting it", not "content is canonicalized before being persisted". Passive voice stays for states and object emphasis: "the entry is committed", "the session is restored". JSDoc summaries are imperative and address the caller: "Resolve the selected branch projection.", not "The selected branch projection is resolved."

Behavioral comments may carry preconditions, skipped outcomes, asynchronous ordering, and race policy. Do not encode those volatile details in a symbol tied to one lifecycle use.

If an implementation comment only identifies an operation or domain value, the name remains wrong. Rename until the code reads on its own.

## Placement and permanence

Keep context only when it is necessary for placement and unlikely to change. Omit wiring or caller facts that a reader can rediscover cheaply.

Do not narrate future intentions. They are unverifiable and become stale silently.

Do not link code comments to dated decisions, design threads, or plans. Their rationale changes independently, which turns each citation into a revalidation cost. A link to a living convention is the exception. The target tracks a stable rule instead of a point-in-time decision.

## Update triggers

An update-trigger comment records an artifact that is complete and correct under present conditions. One known condition will invalidate its current form. The comment does not record unfinished work or a desired future improvement.

Use the exact `Update when:` label, followed by one observable condition and the required code or documentation update. In TypeScript and JavaScript, use the form `// Update when: {condition}. {action}.` Other source formats use their ordinary comment syntax with the same label. Place the comment at the narrowest affected boundary and preserve the current reason separately when the trigger does not explain it.

Before the condition occurs, the marker creates no pending work. Do not use it for speculative refactors, generic TODOs, preferences, plan stages, or ticket ids. Do not link a code marker to a plan. Its validity boundary must remain understandable after planning artifacts archive.

## What earns a comment

Add a warning or explanation that code cannot carry itself. Examples include load-bearing order, external format tolerance, hidden ownership constraints, and non-obvious side effects or optimizations. Each should prevent a plausible wrong assumption.

## Source-file headers

Every indexed authored production TypeScript and JavaScript file starts with one `//` summary sentence. Every indexed authored production CSS file starts with one single-line `/* */` summary. Every indexed authored production HTML file starts with one single-line `<!-- -->` summary. The summary is physically the first line, without exceptions. The header is the summary plus at most one `//` elaboration paragraph, whose length scales with the file's size.

Colocated `*.test.*` and `*.spec.*` files are not indexed. Their production file and shared basename provide the route, so tests need no summary. Add a test comment only when it preserves context the test structure cannot carry.

JSON, binary assets, and static data are not indexed. A directory `AGENTS.md` or local attribution leaf describes non-code assets when their role is not evident.

**Summary:** One sentence of at most 30 words states the file's purpose and why a reader would open it. The summary is the responsibility claim a reader uses to decide. Name the responsibility directly. Use a noun phrase when the file is the thing it defines: a contract, type surface, format, contribution set, entry point, or capability. Open with the operation's verb when the file performs an operation or holds stateful behavior. Decide by what a reader accomplishes. They obtain what the file declares, or follow and reuse what it does. A summary that enumerates parts signals multiple responsibilities. Put the parts in the elaboration instead. Prefer an active sentence: a concrete actor performing an action on an object, over stacked modifiers or abstract nouns. A summary may use a longer plain sentence when that is easier to understand. Do not optimize for the fewest words. Keep specialized terms only when they preserve a distinction that plain language would lose.

Use the path and filename as existing context instead of repeating them. Distinguish sibling files without enumerating exports, callers, control flow, implementation mechanics, plans, or guessed search synonyms.

**Elaboration:** At most one `//` paragraph follows the summary, and its length scales with the file's size. It extends the claim with the file-level concepts the sentence cannot hold: mechanism, hidden guarantees, external constraints, failure boundaries, and rationale. It stays at the file's medium abstraction level. Anything lower belongs in code comments. It never restates the summary. If the paragraph re-claims the sentence's content in more words, tighten the summary or cut the paragraph. Do not use the paragraph as an export inventory or control-flow narration. If one coherent summary cannot describe the file, reconsider its responsibilities.

A facade or pass-through module states the boundary that it exposes.

## JSDoc

JSDoc serves code users. Line comments serve implementation readers. Write JSDoc as well-formed Markdown.

Use lists instead of compressed prose. Put one tag on each line and indent wrapped tag text. Use single-line `/** ... */` form when it fits.

Write summaries as imperative verb phrases, such as "Resolve the selected branch projection." Avoid the third-person "This method" form. Avoid the passive "The projection is resolved" form.

Do not repeat the name or type in a summary. TypeScript already carries types, so omit them from `@param` and `@returns`.

Use `@param` and `@returns` only when they add information. Reserve `@example` for non-trivial complete code. Use `@link` when a related contract is necessary for correct use and the relationship is not evident from imports and types.

A type or class comment states its role and when to use it, not its fields. Multi-line implementation comments use `//` per line.

In TypeScript and JavaScript, reserve `/* */` for JSDoc and attribution headers.

**API nuance lives in JSDoc:** Document defaults, ordering, special values, and edge cases that callers need. State how to use the API correctly, not how its body works.

**Coverage and depth:** JSDoc coverage follows supported ownership boundaries, not the TypeScript `export` keyword alone. Every supported `@uix/api` contract carries caller-facing JSDoc. An internal export needs JSDoc when correct use or a conceptual relationship is not evident from its name and type.

Complex or edge-case-heavy logic needs denser explanation because wrong assumptions are expensive. Examples include platform quirks, cache semantics, and ordering. Keep UI components, tests, and simple code thin. A file can have no comments beyond its required header when names and types carry the complete story.

## Line comments

An inline comment gives the reason for code, never the narrated step. Useful reasons include format constraints, platform variants, and repository edge cases.

Delete comments such as "increment the counter" or "loop over the entries." The code already states those actions.

**Section titles:** Files longer than roughly 500 lines use `// Section Title` markers at logical group boundaries. Use plain titles without boxed banners.

**Silent catches are labeled:** A `catch` that swallows an error explains why the behavior is safe. Examples include a dead process or broken symlink. An unlabeled swallow reads as a bug.

**Derived code carries attribution:** Code derived from an external source keeps a license or attribution header at the file top. This header is the accepted block-comment exception.
