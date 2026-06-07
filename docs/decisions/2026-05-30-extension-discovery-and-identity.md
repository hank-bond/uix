---
summary: "Extensions are discovered from project/global .uix/extensions (a package.json with pi/uix fields) and identified by the entry file's absolute path; UIX ships none of its own."
status: accepted
---

# Extension discovery model and identity

**User-installed, not first-party.** Putting `uix-core` under `src/extensions/` was a category mistake. Extensions are user-installed; what `uix-core` does (orientation + doc map + cockpit tools) is _embedded-pi config_ — how the cockpit configures its own pi instance, not a feature users opt into.

Corrected model (mirrors pi's layout):

- **Discovery roots** (extensions only): `<project>/.uix/extensions/` (common case) and `~/.uix/extensions/` (global, optional). No app-shipped first-party root — UIX ships zero extensions.
- **Embedded-pi config** lives in cockpit source (under `src/main/`, exact path with milestone 4).
- The uix repo dogfoods via `<repo>/.uix/extensions/` (gitignored), as pi's dev workflow uses `<repo>/.pi/extensions/`.

**Discovery shape.** `<root>/<name>/package.json` with optional independent `pi` and `uix` fields. Stricter than pi (which allows bare `<name>.ts`, folder-with-index, or full package) because UIX must disambiguate which side(s) an extension targets (pi-only, uix-only, both). A file/folder-name convention could carry that later; decide when ceremony is felt (~3–5 dogfood extensions). No `uixApi` version gate in v0 — pi doesn't gate, and the precondition (user extensions outliving substrate upgrades) doesn't exist yet; it's one field

- one check to add later.

**Identity = entry file's absolute path** (mirrors pi's `Extension.resolvedPath`). A composite `"<rootLabel>/<name>"` id tagged `project | global` was pulled because pi's third discovery source (settings `packages:`, "git-clone a repo of extensions and import by path") makes that enum either lie or grow forever.

Concrete shapes:

- `defaultRoots(): string[]` — absolute paths only; configured paths append later.
- `DiscoveredExtension = { displayName, dir, hasPi, hasUIX, packageJson }`; `dir` is the identifier, `displayName` is the directory name (log readability).
- `LoadedExtension = { displayName, entry, bag }`; `entry` is the absolute path — a manifest may list multiple entries, each its own `LoadedExtension`/bag (pi's "entry is the unit of loading").
- **Vocabulary:** "extension" for both the on-disk and activated thing (as pi does). `package.json` is a file format, not a conceptual layer.
- Avoid bare `name` as a field (pino-pretty hijacks it; ambiguous). Use `displayName`.
