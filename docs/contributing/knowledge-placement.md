---
summary: "Place knowledge at the narrowest durable owner, and create a discrete document only for context that source inspection cannot reliably recover."
kind: how-to
read_when: "Read before deciding where new guidance belongs, promoting prose into a document, or deleting descriptive documentation."
---

# Knowledge placement

Code is the primary description of implemented structure and behavior. Names, types, imports, and control flow hold knowledge _of_ the code. Documentation holds knowledge _about_ the code: responsibility, correct usage, ownership, rationale, coordination, constraints, and external context.

## Choose the narrowest owner

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

The [`comments.md`](../architecture/conventions/comments.md) convention owns source-file summaries, JSDoc, line comments, and update triggers. The [`source-organization.md`](../architecture/conventions/source-organization.md) convention owns source directory and file boundaries. This guide decides where knowledge belongs without repeating those formats.

A local Markdown leaf earns its place when several files under one source owner must be understood together. One-file facts remain with that file, while broader workflows and context belong in repository documentation.

## Decide whether a document earns its place

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

Use this placement test:

1. If the code already answers the question cheaply, improve its names, types, or structure instead of adding prose.
2. If correct use of one export needs explanation, improve its JSDoc.
3. If one implementation site owns the reason, add a line comment there.
4. If one file owns the responsibility, improve its header.
5. If knowledge coordinates several owners in one directory, improve its `AGENTS.md` or add one local document.
6. If the task or context crosses ownership boundaries, write a repository document.

Before deleting a descriptive document, preserve anything the code cannot reveal. Look for rationale, rejected alternatives, external constraints, failure history, invariants, and counterintuitive behavior. Move each item to its narrowest durable home.

## Maintain knowledge with its owner

Update documentation in the same change as the code or process that it constrains. Living documentation describes HEAD. When a living document becomes wrong, correct it or remove it.

A document references only artifacts that exist. Deleting or moving an artifact updates its references in the same change, including link destinations in immutable records. Migration history belongs in dated decisions or design logs rather than current-state prose.
