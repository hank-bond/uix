---
summary: "Extensions are discovered from project/global .uix/extensions (a package.json with Pi/UIX fields) and identified by the entry file's absolute path. UIX ships none of its own."
kind: explanation
status: superseded
---

# Extension discovery model and identity

> **Superseded by [features-are-the-loadable-unit](./2026-07-01-features-are-the-loadable-unit.md).** The discovery mechanics and identity model carry forward. "Extension" is retired as the uix-side unit (the unit is a feature) and the roots/manifest rename to `.uix/features/` / `uix.features`.

**User-installed, not first-party.** Putting `uix-core` under `src/extensions/` was a category mistake. Extensions are user-installed. What `uix-core` does (orientation + doc map + host tools) is _embedded-Pi config_. It is how the host configures its own Pi instance, not a feature users opt into.

Corrected model (mirrors Pi's layout):

- **Discovery roots** (extensions only): `<project>/.uix/extensions/` (common case) and `~/.uix/extensions/` (global, optional). No app-shipped first-party root: UIX ships zero extensions.
- **Embedded-Pi config** lives in host source (under `src/main/`, exact path with milestone 4).
- The UIX repo dogfoods via `<repo>/.uix/extensions/` (gitignored), as Pi's dev workflow uses `<repo>/.pi/extensions/`.

**Discovery shape.** `<root>/<name>/package.json` with optional independent `pi` and `uix` fields. Stricter than Pi (which allows bare `<name>.ts`, folder-with-index, or full package) because UIX must disambiguate which side(s) an extension targets (Pi-only, uix-only, both). A file/folder-name convention could carry that later. Decide when ceremony is felt (~3-5 dogfood extensions). No `uixApi` version gate in v0: Pi doesn't gate, and the precondition (user extensions outliving substrate upgrades) doesn't exist yet. It's one field

- one check to add later.

**Identity = entry file's absolute path** (mirrors Pi's `Extension.resolvedPath`). A composite `"<rootLabel>/<name>"` id tagged `project | global` was pulled because Pi's third discovery source makes that enum either lie or grow forever. That source is settings `packages:`, "git-clone a repo of extensions and import by path".

Concrete shapes:

- `defaultRoots(): string[]`: absolute paths only. Configured paths append later.
- `DiscoveredExtension = { displayName, dir, hasPi, hasUIX, packageJson }`: `dir` is the identifier, `displayName` is the directory name (log readability).
- `LoadedExtension = { displayName, entry, bag }`: `entry` is the absolute path. A manifest may list multiple entries, each its own `LoadedExtension`/bag (Pi's "entry is the unit of loading").
- **Vocabulary:** "extension" for both the on-disk and activated thing (as Pi does). `package.json` is a file format, not a conceptual layer.
- Avoid bare `name` as a field (pino-pretty hijacks it. Ambiguous). Use `displayName`.
