---
summary: "Build spec for the value-first canvas data channel: the anchor pool (P0), the anchored editing core (U1), and the live bidirectional canvas channel (U2) on customTools. Read when implementing the anchored read/write/edit grammar, the reconciler, or pane writeback. Later units (pi refactor, FS parity, versioning) are out of scope here."
status: active
---

# Spec: canvas anchored edit channel (P0–U2)

The value-first slice of the [canvas-data-channel](../design/canvas-data-channel.md) thread: prove a working bidirectional canvas end-to-end on pi's `customTools` **before** the lower-level integration surgery, so that refactor (U3) lands against a working proof rather than ahead of it. Assumes the landed constraints in [hosting-compatible-by-default](../decisions/2026-05-31-hosting-compatible-by-default.md), [canvas-stage-one](../decisions/2026-05-31-canvas-stage-one.md), and [no-agent-ui-manipulation](../decisions/2026-05-30-no-agent-ui-manipulation.md).

**Scope of this plan:** P0–U2 below. **Out of scope (later units, separate plans):** U3 lower-level pi refactor + Half-B context dedup; U4 filesystem-tool parity; U5–U7 versioning + rollback (→ [pane-and-file-versioning](../design/pane-and-file-versioning.md)).

The ordering principle and the full unit map (P0–U7) live in the design note's _Build units_ section; this spec details only the first three. Each unit ends in something demoable; **implement in order and reconvene at each boundary.**

---

## P0 — Anchor pool (prerequisite asset)

**Goal.** A committed pool of compact anchor IDs the runtime loads; not generated in the harness.

**Build.** A committed static anchor pool asset that the runtime loads. The current pool is vendored from Dirac's Apache-2.0 `src/utils/.hash_anchors` list and attributed in `src/main/anchors/assets/README.md`; it is not fetched or regenerated during install.

**Boundary / deferred.** Provider-specific token probing is not part of P0. UIX uses the same committed anchor pool for every model; token efficiency is nice-to-have, not a model support gate. Parallelizable with U1 if stubbed.

**Landing choices.** Gutter delimiter is `§`. The committed pool is `src/main/anchors/assets/anchor-pool.txt`, copied from Dirac's anchor list and kept as a newline-delimited static asset; runtime loads the small pool into memory and allocation advances a per-document allocation index. After the single-word pool is exhausted, allocation composes two pool words using naive row-major pair indexes; the pool asset is pre-sorted so early two-word anchors stay compact. The pool is model-agnostic and used for every model.

## U1 — Anchored editing core (one plain doc, no UI, no history)

**Goal.** The agent reads/writes/edits a single document by anchor, gets fresh anchors back in every result, and never re-reads to learn current anchors. Testable in isolation.

**Build.**

- **Reconciler.** Myers diff that reassigns anchors **only to changed lines** after each edit. Session-scoped state: the anchor↔line map + the last-observed text as diff base. The map is **regenerable from content, never persisted** (so the filesystem stays non-load-bearing).
- **Edit-op grammar.** `{ start_anchor, end_anchor, replacement }` — the model emits only new content. Validate by string-match. **Every write/edit/read result returns fresh anchors for touched lines** (this is the "Half A" payload — canonical anchored doc/excerpt in the tool result).
- Exercise through a plain tool over an in-memory / single-file document. Golden tests on the reconciler.

**Open:** insert semantics — zero-width range vs `insert_before`/`insert_after` (design Q4).

**Boundary.** No panes, no UI, no history, no FS overrides, no pi integration.

## U2 — Live canvas channel (the headline feature)

**Goal.** The agent edits the canvas; the human edits it back; the agent sees the anchored human-diff on the next turn. The thesis, demoable.

**Build.**

- **Content-store interface** — `getCurrent(docId)` / `commit(docId, content, meta)` / `diff(...)` — with a **trivial single-version implementation** (one object per doc is fine). This is the reserved seam: the git-backed versioned store (U5, [pane-and-file-versioning](../design/pane-and-file-versioning.md)) slots in here later **without touching the channel**.
- **Pane doc tools** — `uix_doc_read` / `uix_doc_write` / `uix_doc_edit` (+ canvas aliases) over document ids and current checkout, backed by the U1 core. The model does not pass revisions; UIX tracks current internally and returns ids/results for observability.
- **Human writeback** — injected shim captures pane edits → debounced flush over **internal eventing (no `fs.watch`)** → on user-submit UIX commits pending pane changes and computes the anchored human-diff via the reconciler. Internal eventing means there is no echo to suppress (the agent's own writes don't return as human changes).
- **Surface the diff via the tool-result channel** — a `changes`/read result, **not** a rewritten user turn. This is the specific choice that keeps U2 on `customTools`; rewriting the user turn is what forces the lower-level path and is therefore U3's job. The pending-diff UI (collapsible area above the input) is presentation only and independent of how the agent is told.

**Boundary.** Ships via `customTools`. No lower-level pi refactor, no Half-B dedup, no versioning/rollback, no FS parity.

---

## Reconvene points

- After **U2**: the channel is proven on `customTools`. Decide U3 (lower-level refactor + Half-B dedup) vs U4 (FS parity) vs U5–U7 (versioning) by appetite — they're largely independent. The lower-level refactor is deliberately _after_ this proof.
