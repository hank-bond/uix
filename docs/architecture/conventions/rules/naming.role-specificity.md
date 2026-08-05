---
summary: "Choose the approved role that communicates the strongest stable guarantees, not the narrowest description of the current implementation."
kind: reference
---

# Choose the defining approved role

**Rule: must.** When one approved noun specializes another and its additional guarantees apply, use the specialized noun. Choose the role that communicates the strongest stable guarantees consumers can rely on, not the narrowest description of the current implementation.

**Approved examples:** Use `ProviderAuthCatalog`, not `ProviderAuthProjection`, because the value provides a discovery and selection boundary. Use `ToolChatBlockPresentation`, not `ToolChatBlockProjection`, because the value is human-facing material consumed by UI composition.

**Nonconforming example:** Do not call a durable authority `DocumentRegistry` because its implementation uses an in-memory index. Use `DocumentStore` when durability defines the guarantees.

**Reason:** Broad nouns hide useful guarantees, while implementation-specific nouns become false when mechanics change. The defining approved role preserves the strongest stable guarantees.
