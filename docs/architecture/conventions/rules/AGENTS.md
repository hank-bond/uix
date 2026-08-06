---
summary: "Rule cards are the conventions tree's normative invariants, one file per stable identifier."
---

# Rules

Each convention rule is a normative invariant with a stable identifier. One rule is one card in its own file, and the filename is the identifier. Use a lowercase dotted identifier such as `naming.callable-role`. Do not use sequential numbers, which change when rules move or you insert new rules.

Rule files are ordinary indexed documents with frontmatter `summary` and `kind`. The generated index below keys every entry by its filename, which is the identifier.

The card format and its structural checks live in [`../contributing.md`](../contributing.md).

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[lifetimes.paired-cleanup](./lifetimes.paired-cleanup.md)** _(reference)._ Do not attach a listener, handler, subscription, or timer without directly pairing its cleanup.
- **[logging.component-logger](./logging.component-logger.md)** _(reference)._ Main-process logging uses component-scoped structured pino loggers, never console calls.
- **[module-boundaries.export-minimum](./module-boundaries.export-minimum.md)** _(reference)._ Do not export a symbol until another module needs to import that symbol by name.
- **[module-boundaries.node-imports](./module-boundaries.node-imports.md)** _(reference)._ Import Node built-ins explicitly with the node: prefix so runtime dependencies stay visible.
- **[naming.boolean-predicate](./naming.boolean-predicate.md)** _(reference)._ Phrase a Boolean as a claim with an approved predicate term that states a truth claim.
- **[naming.boolean-union](./naming.boolean-union.md)** _(reference)._ Represent mutually exclusive states with one status or discriminated union instead of multiple Booleans.
- **[naming.callable-type](./naming.callable-type.md)** _(reference)._ Name a callable type with a noun phrase whose head noun identifies the callable role.
- **[naming.callable-value](./naming.callable-value.md)** _(reference)._ Name a callable participant with a noun role and an object operation with a verb.
- **[naming.contribution-lifecycle](./naming.contribution-lifecycle.md)** _(reference)._ Name each contribution stage with its approved lifecycle term, from Contribution through RegisteredX or a capability role.
- **[naming.imported-term](./naming.imported-term.md)** _(reference)._ An imported term can retain the meaning and grammar of its source API when UIX directly represents the external concept.
- **[naming.operation](./naming.operation.md)** _(reference)._ Name a UIX-owned function or method with an approved operation form, a verb phrase by default.
- **[naming.operation-result](./naming.operation-result.md)** _(reference)._ Pair a transition verb with the result's domain role when an operation names a result or lifecycle transition.
- **[naming.property-access](./naming.property-access.md)** _(reference)._ Expose a stable property as a readonly property and name a method with the operation that produces or retrieves its result.
- **[naming.qualifier](./naming.qualifier.md)** _(reference)._ Omit a prepositional qualifier that only repeats the receiver or parameter role.
- **[naming.react-component](./naming.react-component.md)** _(reference)._ Name a React component with a PascalCase noun phrase.
- **[naming.role-specificity](./naming.role-specificity.md)** _(reference)._ Choose the approved role that communicates the strongest stable guarantees, not the narrowest description of the current implementation.
- **[naming.term-role](./naming.term-role.md)** _(reference)._ Assign one approved meaning and one grammatical role to each UIX-owned architectural term.
- **[source-organization.directory-ownership](./source-organization.directory-ownership.md)** _(reference)._ A directory groups source owned by one coherent domain or implementation unit and does not itself define a module or public API.
- **[source-organization.file-responsibility](./source-organization.file-responsibility.md)** _(reference)._ A source file owns one responsibility, named after the stable responsibility it implements, and changes as one thing.
- **[state.capability-handles](./state.capability-handles.md)** _(reference)._ Consumers receive scoped capability handles minted by the owner, never the owner itself.
- **[state.single-authority](./state.single-authority.md)** _(reference)._ Name one authority for current state and keep asynchronous work, cleanup, lookup, and caching separate from it.
- **[user-interface.a11y-equivalence](./user-interface.a11y-equivalence.md)** _(reference)._ Preserve equivalent meaning and operation across visual, keyboard, and accessibility-tree presentations.
- **[user-interface.component-styles](./user-interface.component-styles.md)** _(reference)._ A UI component's private stylesheet lives beside it with the same basename and explicit cascade order.

<!-- INDEX:END -->
