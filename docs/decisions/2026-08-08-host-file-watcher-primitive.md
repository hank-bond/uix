---
summary: "A substrate file-watch primitive reports host-side filesystem changes: one native watcher per directory with handler-per-class routing, dirty-flag coalescing, lifetime-tied subscriptions, and picker-granted consent for paths outside the workspace. It serves live UI sync and change feeds, not rollback bookkeeping."
kind: explanation
status: accepted
---

# Host file-watcher primitive

## Context

Files are host-authoritative (the workspace repo, the mounted session worktree), so the host must observe changes from any writer — agent tools, bash in an execution VM writing through a host volume, external editors, or other processes. Node's `fs.watch` is already the cross-platform wrapper over FSEvents, inotify, and ReadDirectoryChangesW; a chokidar-style layer normalizes semantics (recursive watching, inotify watch limits, rename/atomic-write event shapes).

## Shape

- `watchDirectory` is the general form. A file registration joins a directory watcher's routing table; the scaling unit is watched directories, not files (1000 files in one directory is one native watch).
- One native watcher per directory. Handlers route per class of thing: one handler instance per class, per-path registrations as path strings in a Set on the handler. No per-item closures; no WeakMap (string paths cannot be weak keys, and handler-per-class makes per-item dedup unnecessary).
- Dirty-flag coalescing: per-path dirty flags flushed on a tick, so bursts (copies, temp+rename saves) do not thrash consumers.
- Notification only: the watcher reports change; consumers re-read content on notify. The watcher never delivers content.
- Consent and policy: watching paths outside the workspace requires user consent through a file picker; the picker is the enforcement point for approved-locations policy. No implicit watching.
- Lifetime: subscriptions tie to feature/surface lifetime bags; watchers dispose with their owners.

## Role

The watcher serves live UI sync (Monaco refresh, anchored buffer sync, change feeds) — explicitly not rollback bookkeeping. Git turn checkpoints own rollback, so the watcher does not need to be lossless.

**Rejected:** guest-to-host filesystem signals from an execution VM (the host volume mount already exposes guest writes to the host watcher); per-item WeakMap handler dedup; implicit watching of arbitrary host paths without consent.
