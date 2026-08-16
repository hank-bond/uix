---
summary: "ESLint flat config plus Prettier, enforcing node: imports, the lifecycle helpers, and pino logging through the check gate."
kind: explanation
status: archived
---

> **Archived.** Record of a lint/format setup decision. It is infrastructure inventory, not a load-bearing behavioral boundary. The current toolchain remains as implemented. This file is write-once history.

# Lint + format infrastructure

ESLint flat config (`eslint.config.mjs`), three layers:

- **Hygiene from upstream presets.** `@eslint/js` recommended + `typescript-eslint` `recommendedTypeChecked`. The type-aware variant earns its keep with `no-floating-promises` and `no-misused-promises`: the rules that catch fire-and-forget Promise bugs that otherwise hit `unhandledRejection`.
- **Project conventions as enforced rules.** `no-restricted-globals` for `process`/`Buffer` (forcing `node:` imports): `no-restricted-syntax` for raw `app.on`, `ipcMain.handle`, `process.on` outside `lifecycle.ts` (forcing the lifecycle helpers): `no-console` in main (forcing pino via `createLogger`).
- **Targeted overrides** where rules fight reality: `lifecycle.ts` may use the raw APIs it wraps. Renderer + preload excused from `no-console`/Node-global rules until they have a logging story. Config files sit outside the tsconfig graph so type-aware rules are off there. `__dirname`/`__filename` dropped from restricted-globals (CJS module bindings, not importable. Banning fights the bundle format).

**Prettier** alongside, `eslint-config-prettier` last to disable conflicting stylistic rules. Two-space indent, double quotes, trailing commas, 80-col. Format is a hard check.

**Scripts:** `lint`, `lint:fix`, `format`, `format:check`, plus `check` = `typecheck && lint && format:check` as one gate.

**Folded-in cleanup:** the deferred `AppEvent` overload errors in `lifecycle.ts` were fixed (couldn't pass `check` otherwise). `onApp` now takes a uniform `() => void` listener via one typed cast. `window-all-closed` migrated to `onApp`. The process shutdown coordinator stays raw with a documented disable: its job is to dispose the host lifetimes, so enrolling it would be circular. It now intercepts `before-quit`, awaits asynchronous workspace disposal, and then resumes quitting.

**Real bugs caught on first run:** a floating Promise on `app.whenReady().then(...)`. An async function passed to `<form onSubmit>` (React expects sync handlers). Both fixed: evidence the type-checked ruleset earns its slower cost.
