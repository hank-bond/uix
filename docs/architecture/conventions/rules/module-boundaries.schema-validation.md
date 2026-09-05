---
summary: "Use a declared schema as the structural authority for boundary data instead of handwritten field checks."
kind: reference
---

# Validate structure through schemas

**Rule: must.** Use a declared schema as the structural authority for boundary data instead of handwritten field checks.

**Approved example:** Declare the supported response map once, derive its type, and validate against it:

```ts
const ResponsesSchema = Type.Object(
  {
    200: Type.Object(
      { content: Type.Literal("html-document") },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
type Responses = Static<typeof ResponsesSchema>;

Value.Assert(ResponsesSchema, responses);
```

**Nonconforming example:** Reconstruct the declaration shape procedurally:

```ts
const entries = Object.entries(responses);
if (
  entries.length !== 1 ||
  entries[0]?.[0] !== "200" ||
  entries[0]?.[1]?.content !== "html-document" ||
  entries[0]?.[1]?.headers !== undefined
) {
  throw new Error("Invalid responses");
}
```

**Reason:** Parallel type declarations and structural checks drift. A schema states required fields, allowed values, and unknown-field policy together.

**Exceptions:** Library-provided guards for opaque values and assertions for semantic relationships remain appropriate. Ordinary control flow does not need a schema.

**Enforcement:** Code review.
