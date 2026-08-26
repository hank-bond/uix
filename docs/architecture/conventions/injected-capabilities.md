---
summary: "Injected capabilities serve current UIX production boundaries instead of creating test-only indirection or provider lookalikes."
kind: reference
read_when: "Read before adding or changing injected callbacks, dependency objects, context capabilities, adapters, factories, or their test doubles."
---

# Inject capabilities at production boundaries

Injection serves a current UIX production boundary. Relevant boundaries include host/runtime, host/client, substrate/loadable-feature, and independently replaced or disposed lifetimes. A test fake may implement an existing production capability, but it does not justify creating that capability.

## Review

Evaluate each introduced or changed injection:

| Check | Pass | Question | Flag |
| --- | --- | --- | --- |
| **Production boundary** | A composition owner must provide behavior across a current ownership, dependency, authority, or lifetime boundary. | The modules have distinct responsibilities, but the same owner chooses and changes both sides. | Test substitution is the only reason behavior crosses the seam. |
| **Capability shape** | The consumer receives UIX-owned authority or policy expressed in its own terms. | The shape resembles its provider but narrows meaningful authority or stabilizes a real boundary. | The shape mirrors its provider, and adapting the production provider requires unchecked assertions. |
| **Production verification** | Tests exercise the production composition or adapter as well as any test double. | A bounded production smoke test covers an adapter whose complete environment is expensive to reproduce. | Tests exercise only the invented contract and its fake implementation. |

A pass has a current production boundary and no flags. A question requires a concrete explanation of why direct composition is insufficient. A flag calls for redesign unless an existing UIX constraint supplies the missing production reason.

When no boundary earns injection, keep the provider concrete at its owner. Extract pure policy for focused tests, then test the owner's real composition.
