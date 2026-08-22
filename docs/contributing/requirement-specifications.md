---
summary: "Requirement specifications define stable concept behavior, while implementation plans track one changeable attempt to satisfy that behavior."
kind: reference
read_when: "Read before writing a requirement specification, planning work from one, or resetting an implementation attempt."
---

# Requirement specifications

A _requirement specification_ defines what one coherent UIX concept means and must do. It connects design, planning, code, and tests. Code and tests derive from the same specification rather than from each other.

A specification may align closely with one class when that class is the concept's semantic owner. Private helpers and incidental classes do not need specifications.

## Knowledge boundaries

- Repository conventions constrain how every implementation is built.
- Foundational specifications define reusable concepts such as guards, supervision, attachments, and logical resources.
- Component specifications apply those concepts to one domain.
- Design documents preserve context, alternatives, and reasons.
- Plans track one implementation attempt.
- Code implements specifications, and tests provide independent evidence.

Specifications inherit repository conventions and list the other specifications that they depend on. They do not repeat inherited rules. Repeated semantic behavior belongs in a foundational specification rather than a convention.

An accepted specification, its dependencies, and repository conventions contain all requirements needed to implement and test the concept. Design history and plans are not required inputs.

This table shows the placement boundary:

| Fact | Owner |
| --- | --- |
| UIX lifetime capabilities use `Symbol.dispose`. | Repository convention. |
| A live guard prevents teardown. | Foundational guard specification. |
| A web resource request retains a workspace guard through completion. | Web-host specification. |
| A supervisor stores guards in a `Map`. | Code. |

## Specification content

Every statement in a specification must rule out a plausible incorrect implementation. Leave a fact out when it can change while every dependency and conformance outcome remains correct.

A specification contains only the sections that its concept needs. The common shape is:

- **Contract:** The capability that the concept provides.
- **Boundary:** What the concept owns, depends on, and does not own.
- **Requirements:** Stable behavior, identity, authority, invariants, lifetime, failure, and security semantics.
- **Conformance:** A small set of outcomes that distinguish a correct implementation.
- **Degrees of freedom:** Choices that implementations may make without changing the concept.
- **Open questions:** Unsettled requirements in a draft specification. Accepted specifications have no open questions.

A specification does not copy private types, algorithms, file layouts, helper names, exact error text, build paths, or test inventories. It also omits other facts that can change while the specified behavior remains correct. A specification may cite an exported contract when code already states an exact shape.

Use normative keywords only when they clarify an obligation or permitted choice. Add stable requirement identifiers only when another specification, plan, or conformance artifact needs to cite them.

## Specification changes

An accepted specification changes when the concept's boundary, invariant, observable behavior, dependency, compatibility commitment, or defining conformance outcome changes. A defect, mechanism change, or additional test does not change the specification when the accepted behavior remains the same.

When implementation work exposes a gap, classify it before changing the specification:

- Fix implementation defects in code or tests.
- Record temporary mechanisms and investigation results in the plan.
- Add missing behavior or clarify an ambiguous requirement in the specification.
- Return unresolved alternatives and reasons to design work.

## Implementation plans

A plan is a disposable implementation artifact with no normative authority. It breaks a specification into checked review slices and records the active attempt's progress, files, mechanisms, hypotheses, failures, checks, and proposed specification changes. Its format may change with the work, and its primary reader is the implementing agent.

When an attempt is discarded:

1. Promote durable requirements into the specification and durable reasons into design documentation.
2. Append a short summary at the bottom of the plan that records what worked, what did not work, relevant specification changes, and unresolved issues.
3. Rewrite the active plan for the next attempt.
4. Discard the implementation and the old plan details.

The attempt summary is process memory, not a second specification. The repository does not retain every attempt's code or complete plan.

This optional shape keeps the summary compact:

```md
### Attempt 1

- **Approach:** What the attempt tried.
- **Worked:** Evidence worth retaining.
- **Did not work:** Failed assumptions or mechanisms.
- **Promoted:** Specification or design changes.
- **Unresolved:** Questions for the next attempt.
```

## Build iteration

1. Decide the requirements and accept the specification.
2. Create a plan that divides the specification into reviewable slices.
3. Implement and test one checked path.
4. Record discoveries in the plan and promote durable changes to their proper owner.
5. Continue until the attempt is behavior complete.
6. If the attempt required material specification changes, discard it and rebuild from the revised specification.
7. Treat a rebuild that needs unstated historical guidance as evidence that the specification needs improvement.
