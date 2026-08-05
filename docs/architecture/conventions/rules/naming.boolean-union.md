---
summary: "Represent mutually exclusive states with one status or discriminated union instead of multiple Booleans."
kind: reference
---

# Use one status for mutually exclusive states

**Rule: must.** Represent mutually exclusive states with one status or discriminated union instead of multiple Booleans.

**Approved example:**

```ts
status: "idle" | "running" | "failed";
```

**Nonconforming example:**

```ts
isIdle: boolean;
isRunning: boolean;
isFailed: boolean;
```

**Reason:** Independent Booleans can represent impossible combinations.
