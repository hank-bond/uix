---
summary: "Extension types live behind the @uix/api path alias, and the extension shape mirrors pi: a default-exported factory that takes the injected API."
status: accepted
---

# Extension API behind @uix/api, mirroring pi's shape

**`@uix/api` is a tsconfig path alias** to `src/shared/extension-types.ts`. It mirrors the eventual published package name from day 1 so extension code never gets rewritten. No npm publish needed yet: the only export is _types_. Extensions never `import` a runtime value from `@uix/api` — the `uix` object is constructed by the loader and handed to the factory — so `import type` erasure at compile time means nothing has to resolve `@uix/api` at runtime. Until then, extensions should `import type`.

Upgrade path when external extensions arrive: move the file to `packages/api/src/index.ts`, add a `package.json`, declare workspaces. The alias goes away; the import shape doesn't change.

**Shape mirrors pi exactly.** A uix manifest default-exports a factory that receives an `ExtensionAPI` object — same as pi's `export default function (pi: ExtensionAPI) { ... }`. Type name, export shape (default function), and parameter convention (named for the injected system: `pi` or `uix`) all match, so humans and LLMs stay in one pattern across both systems. Disambiguation is at the import site (`@uix/api` vs `@earendil-works/pi-coding-agent`). Earlier `activate` / `ctx` / `UIXExtensionContext` sketches are superseded.
