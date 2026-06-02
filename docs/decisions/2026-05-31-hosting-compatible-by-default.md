---
summary: "Prefer designs that survive a future hosted/VM architecture by keeping the filesystem behind content-store and change-feed interfaces. Read before any feature touching storage, document identity, writers, or conflict handling."
status: accepted
---

# Build hosting-compatible by default

UIX is local-first Electron and will be for a long time. We are **not** building the hosted version now. But where a local design and a hosting-compatible one cost about the same, we pick the hosting-compatible one, and where they diverge we keep the divergence isolated behind a narrow interface.

The hosted target is the eventual "pro" shape: a remote, VM-isolated server hosting the panes/apps people build, with a web client instead of an Electron renderer. We don't design _for_ it; we design so we don't have to _undo_ work to get there.

Why the discipline is worth it now:

- **It's the same seam the substrate already needs.** AGENTS.md commits to "one channel API, two transports" (in-process + `postMessage`). Hosting just adds a websocket transport and extends the seam to storage.
- **It makes better Electron, not just future web.** Forcing traffic through typed interfaces keeps the main/renderer boundary clean, keeps extensions from importing cockpit guts, and makes a per-extension worker/utility-process swap mechanical. Local-only shortcuts (assume a path, synchronous `fs`, treat an `fs.watch` event as truth) are the same shortcuts that rot the process model.

**Core rule: never let the filesystem become a load-bearing concept.** It is one local _implementation_ of two abstractions:

- a **content store** — read/write a document by id;
- a **change feed** — notify on changes the cockpit didn't originate.

Locally: `fs` read/write and `fs.watch`. Hosted: object store/DB and pub/sub. Everything above (panes, the injected shim, writeback, echo suppression, conflict resolution) must not know which world it's in.

Concrete rules that fall out:

- **Address documents by id, never path.** Path resolution lives only in the local store adapter.
- **The cockpit is the sole writer**, and every writer announces itself over a cockpit-owned channel (writeback, the agent via the pi event stream, the form shim, the Monaco source pane). The file is a persistence format, not a coordination point. Identical invariant hosted (server is sole writer).
- **No `fs.watch` — not built, not needed.** Its only job was catching an external-editor human; the Monaco source pane absorbs that human into the cockpit. Reversible: it was always scoped as the local change-feed adapter, so add-when-it-bites.
- **Editing surfaces are views over one live document.** Iframe form shim, Monaco buffer, and agent all edit one in-cockpit document that flushes to the store — clean in-process live-sync, not a filesystem race.
- **Echo suppression is content-hash based, not metadata based.** Remember the hash of what we wrote; ignore the matching change-feed event. Rejected: xattr/marker files, `flock`, chmod games — all local-only, non-atomic, deleted on the move to hosting.
- **Conflict policies extend to multiple editors.** Prefer **field-level merge** (agent owns structure; human owns `[name]` values) over last-writer-wins. Hosted, the same per-field model founds multi-user editing.

This is a _default_, not an absolute. When hosting-compatibility would cost real complexity now for a payoff years out, take the local shortcut — but name it, and keep it behind the store/change-feed interface so the blast radius is one adapter.
