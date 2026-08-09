---
summary: "Main-process logging uses component-scoped structured pino loggers, never console calls."
kind: reference
---

# Log through component loggers

**Rule: must.** Use `createLogger(component)` from `packages/runtime/src/log.ts`. Do not call `console.log`, `console.warn`, or `console.error` directly in main-process code.

**Approved example:**

```ts
import { createLogger } from "./log";

const log = createLogger("features");
log.error({ err: error.message }, "activation_failed");
```

**Nonconforming example:** A bare `console.log` call in main-process code.

**Reason:** Pino gives us levels, structured fields, child loggers, pretty-printed development output, and JSON in production with one import. Ad-hoc `console.*` calls drift in format, cannot be filtered, and make feature attribution awkward.
