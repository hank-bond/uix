---
summary: "Import Node built-ins explicitly with the node: prefix so runtime dependencies stay visible."
kind: reference
---

# Keep Node imports node-prefixed

**Rule: must.** Import Node built-ins explicitly with the `node:` prefix, even the ones that are technically available as globals (`process`, `Buffer`).

**Approved example:**

```ts
import process from "node:process";
import path from "node:path";
import fs from "node:fs";
```

**Nonconforming example:** Refer to the ambient `process` or `Buffer` globals, or import a built-in without the `node:` prefix.

**Reason:** Readers scan imports to see what a module touches. A module reading `process.env` or `process.cwd()` depends on the runtime environment. Importing `process` makes that dependency visible.

**Enforcement:** ESLint rejects ambient `process` and `Buffer` access and bare Node built-in imports.
