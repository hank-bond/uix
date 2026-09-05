---
summary: "Represent structurally constrained domain strings with branded types, minted through validation or checked encoding and preserved through internal APIs."
kind: reference
---

# Brand structurally constrained strings

**Rule: must.** Represent structurally constrained domain strings with branded types, minted through validation or checked encoding and preserved through internal APIs.

**Scope:** Repository-wide domain values whose meaning depends on a structural format, naming grammar, or allowed-character restriction. Examples include identifiers, document keys, formatted addresses, and directory URLs.

**Approved example:** Keep the schema as the structural authority and mint the brand only after validation:

```ts
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";

const DocumentKeySchema = Type.String({ pattern: "^[a-z][a-z0-9_-]*$" });
const DocumentKeyBrand: unique symbol = Symbol("DocumentKey");
type DocumentKey = Static<typeof DocumentKeySchema> & {
  readonly [DocumentKeyBrand]: true;
};

function parseDocumentKey(value: unknown): DocumentKey {
  Value.Assert(DocumentKeySchema, value);
  return value as DocumentKey;
}
```

Consumers accept `DocumentKey` rather than `string`. An encoder may mint a brand when its validated inputs and construction establish the result's complete invariant. Keep the brand declaration and its validating or encoding operations at the value's owning boundary.

**Nonconforming example:** Declare `type DocumentKey = string`, accept arbitrary strings in domain operations, or let callers cast unchecked input to `DocumentKey`. Widening a validated key back to `string` between internal APIs also loses the distinction.

**Reason:** A plain string cannot distinguish a validated domain value from raw input or a differently constrained value. The brand preserves that distinction after validation. It proves only the structural guarantees established when minted, not existence, authorization, or liveness. Serialization erases the brand, so receiving boundaries validate before recovering it.

**Exceptions:** Raw input remains `unknown` or `string` until validated. Unrestricted text remains `string`. Closed literal unions already encode their permitted values and need no additional structural brand. External APIs may accept ordinary strings without a UIX-specific type.

**Enforcement:** Review constructors, encoders, and internal signatures. Type tests reject arbitrary strings and incompatible brands, while validation tests cover malformed input. Apply [`module-boundaries.schema-validation`](./module-boundaries.schema-validation.md) when defining structural validation.
