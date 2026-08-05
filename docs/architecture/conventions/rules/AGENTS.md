---
summary: "Rule cards are the conventions tree's normative invariants, one file per stable identifier, with the card format and its structural checks."
---

# Rules

Each convention rule is a normative invariant with a stable identifier. One rule is one card in its own file, and the filename is the identifier. Use a lowercase dotted identifier such as `naming.callable-role`. Do not use sequential numbers, which change when rules move or you insert new rules.

Rule files are ordinary indexed documents with frontmatter `summary` and `kind`. The generated index below keys every entry by its filename, which is the identifier.

A rule file uses this shape:

```markdown
---
summary: "Name a callable type with a noun that states its callable role."
kind: reference
---

# Name callable types by role

**Rule: must.** Name a callable type with a noun that states its callable role.

**Scope:** ...

**Approved example:** ...

**Nonconforming example:** ...

**Reason:** ...

**Exceptions:** ...

**Enforcement:** ...
```

The H1 is the human title, sentence case and free of code. The identifier lives only in the filename, and references to a rule link its file, so a title change does not break them.

The **Rule** is normative. The other sections are informative unless they contain an explicit normative keyword.

Include **Scope** after **Rule** when a rule applies to less than the conventions tree's stated scope. Include approved and nonconforming examples when a plausible boundary mistake exists. Include **Exceptions** only for accepted exceptions. Include **Enforcement** only when review, a repository check, a type-system constraint, or another concrete mechanism can verify the rule. Omit a section when it adds no information.

Keep one independently enforceable requirement in each rule card. Split requirements that have different scopes, exceptions, or enforcement mechanisms. Guidance files reference the cards that readers apply together.

## Structural validation

Rule filenames match the identifier grammar. Each rule file has one H1, one **Rule** lead-in with an RFC 2119 keyword, and only the known labels in their fixed order.

<!-- INDEX:START -->
<!-- INDEX:END -->
