---
summary: "A cockpit-owned file service — per-feature watch + atomic suppressed write behind ctx.files (F0) — grounds a feature-scoped settings store persisted in the workspace manifest, memory-authoritative with a debounced flush (F1). Echo suppression is per-writer and content-hash based; pure listeners pay nothing. First substrate consumer is the StatusBar layout in agent-controls; canvas documents migrate onto it later."
status: active
---

# Spec: file substrate

The cockpit needs one audited way to write files and one way for features to watch them, with writes a feature makes not echoing back as external changes. Today there is no shared primitive: features would reach for raw `node:fs` and invisible `localStorage`. This plan builds the shared service (F0) and its first client, a per-feature settings store (F1) that persists durable UI state — e.g. StatusBar cell order — in the workspace manifest where it's visible and agent-editable rather than hidden in `localStorage`.

Two units. F0 is the primitive; F1 is a thin store over it. Both inject on the feature context and land registrations in the feature's `DisposableBag`. The canvas documents store migrates onto F0 later (same content-hash echo-suppression posture it already wants); the StatusBar in [agent-controls](./agent-controls.md) (A1) is F1's first consumer.

No users yet beyond the author, so breaking changes to interfaces/manifest shape are free — favor the right design over back-compat.

## Decisions assumed

- [hosting-compatible by default](../decisions/2026-05-31-hosting-compatible-by-default.md) — filesystem is one local impl of a content store + change feed; cockpit is sole writer, content-hash echo suppression, address by path/id. F0 generalizes this posture into a shared primitive; the eventual hosting swap replaces F0's watcher with the store's native change feed behind the same interface.
- [features are the loadable unit](../decisions/2026-07-01-features-are-the-loadable-unit.md) — `ctx.files`/`ctx.settings` inject on the feature context; features never import cockpit internals, so a future Deno/worker feature-host swap (where deny-by-default fs makes `ctx.files.write` the only write path) stays mechanical.
- [no agent UI manipulation](../decisions/2026-05-30-no-agent-ui-manipulation.md) — settings persist in `uix.workspace.json`, which makes them agent-editable _as an ordinary file edit_ (a feature of, not a violation of, this rule; nothing drives UI through a channel).
- [workspace manifest not discovery](../decisions/2026-07-02-workspace-manifest-not-discovery.md) — settings live under a new `settings` block in the manifest; the writer round-trips unknown fields and must not trigger a composition reload.

## F0 — Cockpit file service: watch + suppressed write

The primitives table already lists a "cockpit-owned watcher; features register glob → handler." Grow it into one path-keyed core with two orthogonal faces, injected per-feature as `ctx.files`:

```ts
interface WorkspaceFiles {
  watch(glob: string, handler: (e: FileChange) => void): Disposable; // interest only
  write(path: string, content: string): Promise<void>; // atomic, suppressed
}
```

The two faces are orthogonal from the feature's view: `write` is "how UIX code writes files, full stop" (earns its keep on never-watched files too — atomic, one audited path), `watch` is pure interest declaration. Neither method mentions the other; no suppression parameter anywhere. Suppression is _emergent_ on the backend from the shared registry.

- **Paths**: non-absolute (`./x`) resolves against `workspace.stateRoot` (NOT `process.cwd()` — they diverge under a worktree shift); absolute (`/x`) as-is. Normalize to absolute **and `realpath`** before it becomes the registry key, so a symlinked spelling and its target can't register as two files and dodge suppression. fs events already speak absolute, so this matches.
- **Write**: record `canonicalPath → { hash, writerId }` in the registry _before_ the atomic temp-file+rename lands (so an instantly-arriving event is already suppressible), then write. `writerId` is the feature id — known from the injected context, features pass nothing. Write-time hashing is free (content already in memory).
- **Echo suppression is per-writer, hash-based, idempotent.** On an event: if the path has **no registry entry**, deliver immediately with no hashing (pure listeners on never-written files pay zero cost). If it has an entry, hash the file's _current_ content; on match, deliver to all matching watchers **except `writerId`** (a _different_ feature that watches this file genuinely needs the event — suppression means "don't deliver a write back to its own author," nothing more); on mismatch, deliver to all. Hashing at event-read time (not off event metadata) is what makes coalesced / rename-replace / rapid-successive writes safe — stale events re-read latest content, which matches latest recorded hash. Wrong answers are impossible by construction; worst case is a redundant no-op reload.
- **Watcher hygiene**: watch the containing directory (survive rename-replace as delete+create), debounce the event burst.
- **Not a sandbox.** Raw `node:fs` stays legal (non-goal: hostile features) — it just costs atomicity and gets you treated as an external writer (correct: your own watcher fires on your own raw write; the rule for features is simply "if you watch a file and also write it, write it through the service"). Optional hardening, separate and cheap: make the **feature bundler refuse to resolve `node:fs`/`fs`** in feature code with an error pointing at `ctx.files` — catches well-meaning drift, not adversaries. Real enforcement (deny-by-default fs) only arrives with process isolation; out of scope here.

## F1 — Feature-scoped settings store

A tiny per-feature key/value store over F0, injected as `ctx.settings`, persisted in the manifest:

```ts
interface FeatureSettings {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void; // JSON only
  onChange(key: string, handler: (value: unknown) => void): () => void;
}
```

- **On disk**: a new `settings` block in `uix.workspace.json`, keyed by feature id — `settings: { chat: { statusBar: {...} } }`. `WorkspaceManifestSchema` currently has only `name`/`features`; add optional `settings: Type.Optional(Type.Record(...))`. The manifest already tolerates extra fields by design.
- **Memory-authoritative, disk-as-durability.** `set()` updates in-memory state and fires `onChange` to subscribers **immediately** (cross-window / cross-surface sync never waits on disk; the frontend never needs to confirm a write). Only the **flush** is debounced — ~5s coalesce, atomic `write()` through F0, last state wins. Accepted loss window: quit within 5s of a change (explicitly fine); mitigate for free with a best-effort synchronous flush on Electron `before-quit`. Do **not** delay `onChange` to the flush — the debounce protects the disk from chatty writes (drag-reorder), not readers, who never read the file.
- **Field-preserving writer.** Read-modify-write from the **raw parsed JSON** (not the `Value.Parse`'d manifest — parse may strip unknown keys), replacing only `settings[featureId]`. Because writes go through F0, the settings store's own manifest watcher gets the write suppressed (same-writer), so a settings flush never round-trips as a reload.
- **External edits** (agent / hand edits while running): the manifest watcher (via F0, mismatch path) re-reads, diffs against memory, emits `onChange` for changed keys. Collision rule if an external edit lands with a flush pending: field-level last-writer-wins per feature key. This corner can be punted for v1 (note it, don't build it).
- **Reload boundary**: a manifest change that touches only `settings` must NOT trigger a feature composition reload — only `name`/`features` deltas do. Wire this where the manifest reload is decided (`src/main/features/loader.ts` / the manifest read in `manifest.ts`).

## Boundary / future

- **Base/user split (future, single file for v1)**: `uix.workspace.json` (base, committed) + a `.gitignore`d user overlay that always loads on top and is the only file handlers write. Slots behind `FeatureSettings` unchanged; answers the git-diff-noise tradeoff of writing UI prefs into a committed manifest.
- **Hosting swap (future)**: F0's watcher becomes the content store's native change feed; `WorkspaceFiles`/`FeatureSettings` interfaces unchanged.
- Not here: process-isolation fs enforcement, Deno/worker feature host, a generic settings UI surface. See [backlog](./backlog.md).
