---
summary: "Main-process logging uses component-scoped structured pino loggers with stable event identifiers, fields, levels, and error conventions."
kind: reference
read_when: "Read before adding or changing main-process logs, event identifiers, log fields, levels, or error reporting."
---

# Logging

**Rule:** Use `createLogger(component)` from `src/main/log.ts`. Don't call `console.log` / `console.warn` / `console.error` directly in main-process code.

**Why:** Pino gives us levels, structured fields, child loggers (free attribution), pretty-printed development output, and JSON in production with one import. Ad-hoc `console.*` calls drift in format, cannot be filtered, and make feature attribution awkward.

**Shape:**

```ts
import { createLogger } from "./log";

const log = createLogger("features");
const featureLog = log.child({ feature: displayName, entry });

featureLog.debug({ id }, "activation_succeeded");
featureLog.error({ err: error.message }, "activation_failed");
```

**Conventions:**

- **Message equals a lowercase snake_case event identifier:** Use a stable operation-state name such as `activation_succeeded`, `activation_failed`, or `reload_started`. Do not encode prose in the id. The IPC wire-log boundary uses `<phase>:<channel>` because each line identifies a concrete protocol crossing.
- **All context in the fields object:** Never interpolate state into the message string.
- **Component is the subsystem:** Use names such as `features`, `surfaces`, `agent`, `channels`, or `main`. Do not add a `uix.` prefix or repeat the component in the event id.
- **Per-instance child loggers:** Create a child logger when one component handles many features, sessions, or similar instances. Give it stable identifying fields: `const featureLog = log.child({ feature: displayName, entry })`.
- **Do not use bare `name` as a field:** Pino-pretty treats `name` as the logger's display name and puts it in the header. Prefer a searchable domain field such as `feature`, `workspaceName`, `commandName`, or `toolName`.
- **`err` field for errors.** Pass the error message string (`err: e.message`) or the Error object itself (pino serializes it). Don't stringify into the message.
- **Levels:** Use `info` for low-volume operational events, `warn` for recoverable trouble, and `error` for failures. Use `debug` for routine lifecycle and diagnostic trails. Enable it with `UIX_LOG_LEVEL=debug`.
