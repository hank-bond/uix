---
summary: "An Agent accepts its complete replacement composition or retains the previous one. Successful replacement reloads affected pages, with opted-in presentation state restored locally."
kind: explanation
status: accepted
---

# Whole-composition replacement

An Agent's complete feature composition is the acceptance unit. Failure in any candidate feature rejects the entire candidate and retains the previous composition. UIX does not accept successful siblings beside a failed replacement.

Atomic acceptance covers substrate-owned state and contributions. It does not promise rollback of arbitrary filesystem writes, network calls, or global mutations performed by trusted feature code.

After successful acceptance, UIX automatically reloads every workspace page targeting that Agent at the same durable viewpoint. Other Agents' pages remain unaffected. Failed preparation leaves the previous pages usable without reloading. Request authority from the replaced composition no longer admits new work.

Presentation continuity is explicit rather than a byproduct of component survival. Features opt values into browser-local persistence with author defaults defined in code. Workspace preferences apply across that workspace's conversations. Per-item state belongs to a stable item within one conversation. Neither belongs in manifest settings or backend synchronization.

Storage is optional. Unavailable storage or unreadable values use author defaults, and write failure does not block interaction. A new browser or device starts from author defaults.

This decision supersedes [`2026-07-13-atomic-candidates-and-feature-activation.md`](./2026-07-13-atomic-candidates-and-feature-activation.md). It retains atomic candidate validation and the limit on arbitrary external effects, but replaces independent per-feature acceptance with whole-composition acceptance.

[`feature-composition.md`](../specs/feature-composition.md), [`connection-agent-attachments.md`](../specs/connection-agent-attachments.md), and [`browser-presentation-state.md`](../specs/browser-presentation-state.md) define the behavior and conformance outcomes. Their implementation state remains independent of this decision.
