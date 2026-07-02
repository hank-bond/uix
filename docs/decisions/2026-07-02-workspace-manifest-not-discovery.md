---
summary: "A workspace is a directory anywhere on disk defined by its uix.workspace.json manifest — an explicit ordered list of feature entry-file references (relative or absolute) that replaces auto-discovery entirely; the App (the running Electron application) opens manifests via a start picker, and the workspace roots derive from the manifest's directory."
read_when: "Read before touching feature loading, workspace resolution, discovery/roots code, or the start/picker flow — root scanning is retired and the manifest is the one source of composition truth."
status: accepted
---

# Workspaces are manifest files; auto-discovery is retired

**Vocabulary, three levels.** The **App** is the running Electron application — the shell that shows the start picker and hosts windows. A **workspace** is what the App opens: a user-chosen directory anywhere on disk, defined by its manifest file. A **feature** is what a workspace composes. (This finalizes "App": earlier drafts reserved it for feature-bundle distribution, then briefly used it for the workspace dir itself — both retired. Distributing a bundle of features is just sharing a workspace directory template.)

**The manifest is the composition.** `uix.workspace.json` lives in the workspace root. v1 schema is `name` plus `features`: an **explicit ordered array of feature references**. A reference is an entry file — the `.ts`/`.js` whose default export is the `FeatureDefinition` — resolved relative to the manifest for workspace-local features or absolute for shared/cross-workspace ones. Manifest order is load order, extending [uix-core-composition-root](./2026-06-07-uix-core-composition-root.md)'s explicit-ordered-composition discipline to features (registration order is semantic for agent-facing facets). Removing a feature is deleting its line; nothing can resurrect it. Layout, agent config, and feature↔agent links land in the manifest later, not in v1.

**No auto-discovery.** Root scanning (`.uix/features/`, `~/.uix/features/`, `package.json` markers with `uix` fields) is retired. Discovery was inherited from pi's layout, but its marker files existed to answer "is this dir a feature?" — a question an explicit manifest never asks. The loader's activation machinery (definition validation, per-feature bags, error isolation, single-flight, jiti with `moduleCache: false`) carries forward unchanged; manifest resolution replaces the scan as what feeds it. A trivial feature is now literally one file plus one manifest line — the cheapest possible authoring loop for an agent.

**Folder references are the compatible upgrade, not v1.** If a feature later needs folder-level metadata — a `pi` field teaching the agent backend, multiple entries, per-feature dependencies — a manifest reference pointing at a _directory_ can mean "read its `package.json`". This mirrors pi's own spectrum (bare file → folder → full package) and adds nothing until something needs it.

**Workspace roots derive from the manifest.** `resolveWorkspace()`'s `process.cwd()` placeholder is replaced by the opened manifest's directory: `stateRoot` (pi session + canvas store under the dir's `.uix/`) is pinned there for the life of the conversation, and the agent's cwd _defaults_ there while remaining the mutable pointer per [project-root-vs-agent-cwd](./2026-06-06-project-root-vs-agent-cwd.md).

**The App opens manifests.** On start with no target, a picker modal offers recent workspaces (manifest paths persisted in Electron `userData`) or creating a new one (choose dir, write manifest, scaffold the default features into it once they ship as templates — see the scaffolding backlog seed). Semantics mirror VS Code's `.code-workspace`: the manifest file is the thing you open. First boot is just the empty-recents case of the same modal. One BrowserWindow per open workspace remains the model; v1 may scope to one open workspace per App instance, with concurrent multi-workspace windows following when the substrate is per-workspace-scoped.

**Rejected.**

- _Keeping auto-discovery beside the manifest_: two sources of composition truth, emergent ordering, and deletion semantics that require tombstones. The manifest alone is strictly simpler.
- _A central `~/.uix/features/` materialization for defaults_: creates a template-update policy problem and isn't workspace-scoped; scaffolding at workspace creation stamps templates once and never fights user/agent edits.
- _Package-dir references in v1_: the `package.json` layer only earned its place under discovery (as the marker/manifest the scanner needed); with explicit references it's ceremony, deferred to the folder-reference upgrade.

Supersedes the discovery/roots portions of [features-are-the-loadable-unit](./2026-07-01-features-are-the-loadable-unit.md) (its `.uix/features/` roots, side-effect-free scan, and `uix.features` package-manifest key); that decision's core — the `FeatureDefinition` export shape, one registration path, reload symmetry, the `@uix/api` contract, reserved ids — stands. Distilled from [workspace-feature-composition](../design/workspace-feature-composition.md); built by [workspace-manifest-and-picker](../plans/workspace-manifest-and-picker.md).
