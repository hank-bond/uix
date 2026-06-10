---
summary: "Every state value has exactly one owner — renderer (this-machine presentation, cache semantics), main-durable (session entries / content store), or main app-local (window bounds) — never durable-but-locally-overridable; main's in-memory state is never an owner, only regenerable working memory."
status: accepted
---

# One owner per state value

As the renderer → main channel grows beyond prompts (block actions, canvas writeback, visibility signals), every piece of application state needs a home, and hybrids beckon — "durable but overridable locally," "ephemeral but cached just in case."

**Decision.** Every state value has **exactly one owner**; no value is readable from two sources of truth. The owners:

- **Renderer-managed** — this-machine presentation: pane collapsed/hidden, splitter widths, display toggles. React state by default; `localStorage` is allowed when worth keeping across reloads (it is cheap and built-in), but always with **cache semantics**: the app renders correctly if it is wiped, main never reads it, and nothing in it is keyed to session content.
- **Main-managed, durable** — anything the session, the agent, or another client must agree on: session entries (`uix.*` custom entries, messages) and the content store. Always rehydrates, branch-aware.
- **Main-managed, app-local** — the small Electron-necessity bucket: window bounds and similar `BrowserWindow`-level state that only main can read or set, persisted in an app-local file, never in the session.
- **Main's RAM is never an owner.** In-flight promises, the streaming-row maps, anchor↔line maps: working memory that must be regenerable from durable state or safely droppable. Nothing in main's memory may be the only copy of anything.

The classification decision lives in **main's signal handlers**, not the renderer: the renderer emits typed signals and does not know which ones persist.

**Litmus tests.**

- Does any other party (agent, session, another client) ever need to agree on this value? → main-durable.
- If a piece of "ephemeral" state turns out to be worth keeping, that is the signal it was durable all along — **promote it to main; do not give it a localStorage half-life.**

**Rejected.**

- _Durable-but-locally-overridable_: two sources of truth for one value; every read must arbitrate, and the arbitration is a merge problem wearing a convenience costume.
- _Renderer persistence of session-keyed state_: under [hosting-compatible-by-default](./2026-05-31-hosting-compatible-by-default.md) multiple renderer clients can attach to one session; per-client persistence of shared state diverges silently and survives the wrong boundary (window reload but not branch navigation).
