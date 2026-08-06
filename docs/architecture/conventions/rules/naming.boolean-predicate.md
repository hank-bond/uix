---
summary: "Phrase a Boolean as a claim with an approved predicate term that states a truth claim."
kind: reference
---

# Phrase a Boolean as a claim

**Rule: must.** Name a Boolean variable, field, or function with an approved predicate term that states a truth claim.

**Approved example:** Use `isAgentRunning`, `hasSelection`, `canSwitchSession`, `supportsManualInput`, `shouldRetry`, or `needsReload` according to the approved meanings in the [predicate-terms section](../lexicon/code-terms.md#uix-owned-predicate-terms) of the lexicon.

**Nonconforming example:** Do not use a bare domain noun such as `agentRunning` or `selection` as a Boolean. Do not use `will` as a general prediction prefix. Use explicit operation state or another approved predicate instead.

**Exceptions:** Use `was` only for captured prior state. Use `did` only for the outcome of an attempted operation.
