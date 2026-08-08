---
summary: "Extension types live behind the @uix/api path alias, and the extension shape mirrors Pi: a default-exported factory that takes the injected API."
kind: explanation
status: superseded
---

# Extension API behind @uix/api, mirroring Pi's shape

> **Superseded by [features-are-the-loadable-unit](./2026-07-01-features-are-the-loadable-unit.md).** The `@uix/api` alias and its upgrade path carry forward. The default-exported factory taking an injected `ExtensionAPI` is retired: entries export a plain `FeatureDefinition`.

**`@uix/api` is a tsconfig path alias** to `src/shared/extension-types.ts`. It mirrors the eventual published package name from day 1 so extension code never gets rewritten. No npm publish needed yet: the only export is _types_. Extensions never `import` a runtime value from `@uix/api`. The `uix` object is constructed by the loader and handed to the factory. `import type` erasure at compile time therefore means nothing has to resolve `@uix/api` at runtime. Until then, extensions should `import type`.

Upgrade path when external extensions arrive: move the file to `packages/api/src/index.ts`, add a `package.json`, declare workspaces. The alias goes away. The import shape doesn't change.

**Shape mirrors Pi exactly.** A UIX manifest default-exports a factory that receives an `ExtensionAPI` object: same as Pi's `export default function (pi: ExtensionAPI) { ... }`. Type name, export shape (default function), and parameter convention (named for the injected system: `pi` or `uix`) all match. Humans and LLMs stay in one pattern across both systems. Disambiguation is at the import site (`@uix/api` vs `@earendil-works/pi-coding-agent`). Earlier `activate` / `ctx` / `UIXExtensionContext` sketches are superseded.
