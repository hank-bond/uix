---
summary: "Main-process logging uses component-scoped structured pino loggers with stable event identifiers, fields, levels, and error conventions."
read_when: "Read before adding or changing main-process logs, event identifiers, log fields, levels, or error reporting."
status: active
---

# Logging

**Rule.** Use `createLogger(component)` from `src/main/log.ts`. Don't call `console.log` / `console.warn` / `console.error` directly in main-process code.

**Why.** Pino gives us levels, structured fields, child loggers (free attribution), pretty-printed dev output, and JSON in prod — with one import. Ad-hoc `console.*` calls drift in format, can't be filtered, and make extension attribution awkward.

**Shape.**

```ts
import { createLogger } from "./log";

const log = createLogger("extensions");

log.info({ count: roots.length }, "scanning_roots");
log.warn({ dir, err: e.message }, "root_unreadable");
log.error({ extension: id, err: e.message }, "activate_failed");
```

**Conventions.**

- **Message = lowercase snake_case event identifier.** Past tense for completed events (`extension_activated`), present tense for in-progress (`scanning_roots`). Stable across reword — grep-friendly.
- **All context in the fields object.** Never interpolate state into the message string.
- **Component is the subsystem.** `extensions`, `main`, `agent`, `channels`. No `uix.` prefix — it's implied. Don't repeat the component name in the event (`activated`, not `extension_activated`, when the component is `extensions`).
- **Per-instance child loggers** for attribution: when handling many things of the same kind (extensions, sessions, panes), make a child: `const elog = log.child({ extension: id })`. Every line from `elog` carries the id automatically.
- **Don't use bare `name` as a field.** Pino-pretty interprets `name` as the logger's display name and pulls it into the rendered header, causing confusing output like `INFO (hello): (extensions) package` when you meant `name: "hello"` as a regular field. More generally, prefer specific descriptive field names — `displayName` for human-readable labels, `packageName` / `commandName` / `toolName` for kind-specific ids, `extension` (key) + the id (value) for child-logger attribution (`{ extension: "hello" }`). Bare `name` is also ambiguous (whose name?) and worse for grepping than a specific term.
- **`err` field for errors.** Pass the error message string (`err: e.message`) or the Error object itself (pino serializes it). Don't stringify into the message.
- **Levels.** `info` for lifecycle, `warn` for recoverable trouble worth a human's attention, `error` for failures. `debug` exists (enable with `UIX_LOG_LEVEL=debug`) for high-volume diagnostic trails.
