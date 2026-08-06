---
summary: "Pair a transition verb with the result's domain role when an operation names a result or lifecycle transition."
kind: reference
---

# Pair transition verbs with result nouns

**Rule: must.** When an operation names a result or lifecycle transition, pair an approved transition verb with the result's domain role. Each term must add independent information.

**Scope:** This rule does not require every operation to repeat its return type. A receiver, input, or established domain operation can already provide the noun, as in `registry.register(action)`.

**Approved examples:** `deriveSelectedBranchProjection()`, `resolveAgentToolContribution()`, and `assembleAgentContextMessage()` pair a transition with its result role. Use `deriveToolChatBlockPresentation()`, where `derive` identifies pure policy computation and `Presentation` identifies the human-facing result.

**Nonconforming example:** Do not verbalize the result noun when that verb adds no transition semantics. `presentToolChatBlock()` restates `ToolChatBlockPresentation`. Use `deriveToolChatBlockPresentation()` for a pure rebuildable view.

**Reason:** Controlled verbs collapse synonyms for recurring transitions. Controlled nouns collapse synonyms for recurring roles and stages. Keeping those axes orthogonal lets an unfamiliar identifier communicate both facts.
