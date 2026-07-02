---
summary: "Landed spec for manifest-driven workspaces: uix.workspace.json (name + ordered feature entry-file refs) replaced auto-discovery as what feeds the loader (M1), resolveWorkspace derives stateRoot/agentCwd from the opened manifest's directory (M2), and the App grew a start picker — recents from userData plus create-new that writes a manifest (M3)."
status: landed
---

# Spec: workspace manifest + start picker (landed)

Shipped as `49e9ad4` (M1: manifest drives loading, discovery retired), `9de1056` (M2: workspace roots derive from the manifest target, `UIX_WORKSPACE` env), and `bf4f330` (M3: startup splits into shell + `openWorkspace()`, picker window with recents + create-new, recents store in `userData`). Loader/resolution/recents behavior is covered by tests and the two-entry renderer production build was verified; the interactive picker flow (fresh launch → create → relaunch → recents) still needs a manual smoke pass, since it can't be exercised headlessly.

The original plan follows unedited.

Builds [workspace-manifest-not-discovery](../../decisions/2026-07-02-workspace-manifest-not-discovery.md). Assumes [features-are-the-loadable-unit](../../decisions/2026-07-01-features-are-the-loadable-unit.md) (definition shape, one registration path, reload symmetry — all unchanged) and [project-root-vs-agent-cwd](../../decisions/2026-06-06-project-root-vs-agent-cwd.md) (stateRoot pinned, agentCwd mutable). Design context: [workspace-feature-composition](../../design/workspace-feature-composition.md).

## Context snapshot

The loader (`src/main/features/loader.ts`) activates bundled `FeatureDefinition`s plus packages found by scanning `.uix/features/` roots for `package.json` markers. The decision retires the scan: a workspace's `uix.workspace.json` manifest — an explicit ordered array of feature entry-file references — becomes the one composition record. The activation machinery (validation, per-feature bags, error isolation, single-flight, jiti) is reused as-is; only what feeds it changes. `resolveWorkspace()` still returns `process.cwd()` for both roots, with a comment reserving the seam this plan fills.

Transitional posture, explicit: bundled chat/canvas keep loading through `sources.bundled` _independent of the manifest_ until the scaffolding seed lands (they aren't manifest-listed yet, so a v1 manifest cannot remove them). The manifest governs workspace-local features added beside them. When scaffolding lands, `bundled.ts` dies and the manifest governs everything.

## Units

### M1 — Manifest schema + manifest-driven loading

TypeBox schema for `uix.workspace.json`: `name: string`, `features: string[]` (ordered entry-file refs, resolved against the manifest's directory; absolute paths pass through). `loadFeatures` takes the manifest in place of roots: parse + validate the manifest (a malformed manifest fails the load pass loudly and leaves the current tree intact, matching the discovery-before-clear posture), resolve refs, activate each entry through the existing machinery in manifest order after bundled. Retire `discovery.ts` and `roots.ts`; rework loader tests to write manifests in temp dirs instead of marker packages. Dev bootstrapping: if the cwd holds a `uix.workspace.json`, use it; otherwise treat the cwd as a workspace with no manifest features (transitional, keeps `npm run dev` working before M3). Rewrite the gitignored dogfood so the repo's dev manifest references `hello`'s entry file directly.

Acceptance: a manifest line pointing at a bare `.ts` file activates that feature; reordering lines reorders registration; deleting a line removes the feature on reload; a bad ref or bad manifest lands in `failed[]` / fails the pass without tearing down the running tree.

### M2 — Workspace roots derive from the manifest

`resolveWorkspace(manifestPath)`: `stateRoot` and default `agentCwd` are the manifest's directory. The App accepts an explicit workspace target (CLI arg / env for dev; the picker supplies it in M3). Session file, canvas store, and IPC spill logs all follow `stateRoot` as today — no path logic changes beyond the root's origin.

Acceptance: opening a manifest in `/tmp/demo/` puts `.uix/` state there and the agent's default cwd there; the repo dev flow is unchanged.

### M3 — Start picker

Launching the App without a workspace target shows a small picker window: recent workspaces (manifest paths + names persisted as JSON in Electron `userData`, most-recent first, prune missing files) and create-new (native dir dialog + name field → write `uix.workspace.json` → open). Opening a workspace boots the substrate against it and records the recent. v1 scope: **one open workspace per App instance** — the substrate (registries, driver, featuresBag) is process-singular today; concurrent multi-workspace windows need per-workspace substrate scoping and are deferred. Picker chrome is App shell, not a feature — it exists before any workspace is open.

Acceptance: fresh install (empty recents) lands on the picker; create-new produces a dir with a valid manifest and opens it; relaunch lists it under recents; opening a recent restores its session/state.

## Out of scope

- **Scaffolding default features into new workspaces** — gated on runtime surface composition + runtime-value `@uix/api` imports (backlog seed). Until then, create-new writes an empty `features: []` and bundled defaults still load compiled-in.
- **Folder/package references** (`package.json` indirection for pi fields, multi-entry, deps) — the compatible upgrade, added when something needs it.
- **Manifest fields beyond `name` + `features`** — layout, agent config, feature↔agent links land with their own threads.
- **Watcher-driven manifest reload** — manual `/reload` re-reads the manifest; auto-reload waits for the file watcher service.
- **Concurrent multi-workspace windows** — needs per-workspace substrate scoping; v1 is one workspace per App instance.

## Validation rhythm

Per unit: implement one small chunk, run typecheck/lint/format/docs checks plus targeted tests, stop for review, commit only after explicit approval.
