---
summary: "The @uix/api author contracts ship as a real local npm workspace package under packages/api, source-exported and bundled by the app's own builds. The path-alias-only form is retired."
kind: explanation
read_when: "Read before touching how @uix/api resolves for the app's builds or the feature loader, or anything in packages/."
status: accepted
---

# @uix/api is a real local package

The `@uix/api` author contracts moved from `src/api` to `packages/api`. The new home is an npm workspace package with its own `package.json`, name, and source-only exports map. Import specifiers (`@uix/api/...`) are unchanged. That import shape stays frozen.

**Source-only, no build.** The package exports its `.ts` source directly (`"."` → `./src/index.ts`, `"./*"` → `./src/*.ts`). jiti, esbuild, and vite all consume TypeScript in place. There is no compile step and no package-local tsconfig yet. A build artifact and package tsconfig arrive when the package needs one (the monorepo E5 boundary). At that point the exports map moves from `src` to `dist`.

**The app's builds bundle it. They never externalize it.** `@uix/api` is deliberately absent from root `dependencies`. `externalizeDepsPlugin` therefore leaves it alone, and esbuild/vite inline it into `out/main`, `out/preload`, and the renderer. Listing it would break both hosts. The sandboxed preload cannot resolve external requires, and main cannot load the package's TypeScript at runtime. The workspace symlink (`node_modules/@uix/api`) exists regardless, for any non-aliased consumer.

**Resolution sites rebind to the package source.** tsconfig node/web paths, electron-vite and vitest aliases, and the feature loader's jiti alias (`apiModuleDir`) all point at `packages/api/src`. The composition root supplies `apiModuleDir` from `app.getAppPath()`.

**Why now.** Features will move into their own packages when the monorepo split lands. They need `@uix/api` importable as a real package, not a path alias the host owns. This is the smallest step of that arc: package identity now, feature packages later.

**Rejected.**

- _Keeping the path alias only_: the carry-forward said the alias stays until external distribution needs a real package. The monorepo is that moment, and a local package costs nothing to ship.
- _Listing `@uix/api` in root `dependencies`_: externalization breaks the preload and main builds as described above.
- _A package-local tsconfig and build now_: typechecks nothing new (the root composite configs already include the files) and duplicates compiler settings. The build step arrives with the artifact.

Supersedes the "stays a tsconfig path alias until external distribution needs a real package" carry-forward in [features-are-the-loadable-unit](./2026-07-01-features-are-the-loadable-unit.md) and the retired [extension-api-type-alias](./2026-05-30-extension-api-type-alias.md).
