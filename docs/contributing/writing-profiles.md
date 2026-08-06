---
summary: "Normative, explanatory, and historical sections use distinct writing profiles so requirements stay testable without flattening rationale or recorded reasoning."
kind: reference
read_when: "Read before choosing how prescriptive a section should be or reviewing normative documentation."
---

# Writing profiles

Apply one writing profile to each section. A document may use different profiles when its sections serve different roles.

## Normative language

Normative keywords follow RFC 2119. Use them only for requirements:

- **must** marks a requirement that a conforming change cannot violate.
- **should** marks the required default when a valid, stated reason can justify an exception.
- **may** marks an explicitly permitted choice.

The full keyword set is **must**, **must not**, **required**, **shall**, **shall not**, **should**, **should not**, **recommended**, **may**, and **optional**. Use ordinary lowercase words in informative prose. Keep the requirement separate from its rationale so a reader can identify what is mandatory without interpreting the explanation. The [`prose-style.md`](./prose-style.md) guide defines their presentation.

## Strict profile

Use the strict profile for conventions, generated reference, architecture invariants, and contract comments.

- Use approved technical terms with one meaning and grammatical role.
- Use active voice and present tense.
- Name the actor or owner when it affects the contract.
- Put a condition before the action or result that it controls.
- Put one requirement or independently testable claim in each sentence.
- Use the same term for the same concept. Do not introduce synonyms for variation.
- Pair a rule with an approved example and a nonconforming example when the boundary is not obvious.
- Keep normative requirements separate from informative reasons, notes, and examples.

## Explanatory profile

Use the explanatory profile for architecture synthesis, decision rationale, plan framing, and the current synthesis of a design thread.

Use canonical technical terms and state current claims precisely. Longer causal explanations, comparisons, alternatives, and analogies are permitted when they preserve distinctions that the strict profile would hide.

## Historical and expressive profile

Use the historical and expressive profile for append-only design logs, archived material, quoted source context, and marketing prose.

Preserve the original reasoning and voice when they are part of the record. Do not rewrite historical text only to apply a later language rule. Use current canonical terms when new text describes current architecture.
