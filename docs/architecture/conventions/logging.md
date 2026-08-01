---
summary: "Main-process logging uses component-scoped structured pino loggers with stable event identifiers, fields, levels, and error conventions."
kind: reference
read_when: "Read before adding or changing main-process logs, event identifiers, log fields, levels, or error reporting."
status: active
---

# Logging

**Rule.** Use `createLogger(component)` from `src/main/log.ts`. Don't call `console.log` / `console.warn` / `console.error` directly in main-process code.

**Why.** Pino gives us levels, structured fields, child loggers (free attribution), pretty-printed development output, and JSON in production with one import. Ad-hoc `console.*` calls drift in format, cannot be filtered, and make feature attribution awkward.

**Shape.**

```ts
import { createLogger } from "./log";

const log = createLogger("features");
const featureLog = log.child({ feature: displayName, entry });

featureLog.debug({ id }, "activation_succeeded");
featureLog.error({ err: error.message }, "activation_failed");
```

**Conventions.**

- **Message = lowercase snake_case event identifier.** Use a stable operation-state name such as `activation_succeeded`, `activation_failed`, or `reload_started`; do not encode prose in the event id. The IPC wire-log boundary is the sole exception: it uses `<phase>:<channel>` because each line identifies a concrete protocol crossing rather than an application event.
- **All context in the fields object.** Never interpolate state into the message string.
- **Component is the subsystem.** Use names such as `features`, `surfaces`, `agent`, `channels`, or `main`. No `uix.` prefix is necessary. Do not repeat the component in the event id.
- **Per-instance child loggers** provide attribution. When handling many things of one kind, such as features or sessions, create a child logger with the stable identifying fields: `const featureLog = log.child({ feature: displayName, entry })`.
- **Don't use bare `name` as a field.** Pino-pretty interprets `name` as the logger's display name and pulls it into the rendered header. Prefer a domain-specific field such as `feature`, `displayName`, `workspaceName`, `commandName`, or `toolName`; these names are also easier to search.
- **`err` field for errors.** Pass the error message string (`err: e.message`) or the Error object itself (pino serializes it). Don't stringify into the message.
- **Levels.** Use `info` for low-volume events useful in normal operation, `warn` for recoverable trouble worth a human's attention, and `error` for failures. Use `debug` (enabled with `UIX_LOG_LEVEL=debug`) for routine lifecycle and diagnostic trails.
