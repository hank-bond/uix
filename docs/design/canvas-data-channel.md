---
summary: "Design thread for the bidirectional canvas data channel. Read before working on canvas edit tools, anchoring/token efficiency, pane writeback, or the case-1/case-2 canvas split."
status: exploring
---

# Canvas data channel

## Current synthesis

**Frame.** The canvas pane is a second channel parallel to the conversation: the agent pushes changes in, the human pushes changes back. UIX's entire job for it is **efficiency + reliability** of that crossing. The clean consequence is **symmetry** — both directions can speak one language: agent→pane is hash-anchored _edits_, pane→agent is hash-anchored _diffs of what the human changed_. Because anchors are position-independent, both map onto the same anchor space without renumbering, so we build one anchored-diff representation and point it both ways.

**Two cases of canvas content** (boundary = is structure a per-turn variable or a frozen dependency?):

- **Case 1 — document / notebook.** Structure and data are fused; the agent edits the fused thing every turn (e.g. a PR rendered as summary + diff + inline discussion). Raw HTML, file-as-truth, free hydration. _This is all we build now._
- **Case 2 — application.** Structure frozen into a versioned frontend extension; the agent mostly edits a _state document_. Reusable; needs pi + frontend extensions. The wiki tool is a case-2 hypothesis.
- **Promotion path:** vibe a case-1 notebook repeatedly → the app shape emerges → graduate to case 2. Grown from observed patterns, not designed top-down.
- **Litmus that keeps them apart:** case 1 never gets a shipped runtime or a state store separate from its HTML. Want either → you've graduated. (This is why React/state-store panes are wrong for case 1 but right for case 2 — same free-hydration tradeoff read from both ends.)

**The anchored edit model** (adopt Dirac's shape wholesale — see [the Dirac post](https://dirac.run/posts/hash-anchors-myers-diff-single-token)):

- **Assigned single-token anchors**, not content hashes. Content hashes can't be coerced to one token, collide on duplicate lines, and are ephemeral; assigned IDs are drawn from a curated single-token pool, are collision-free, and stay stable across content edits. The tradeoff (a stateful, session-scoped anchor→line map) is acceptable because the map is regenerable from the doc, not persisted — so it doesn't make the filesystem load-bearing.
- **A Myers reconciler** reassigns anchors only to changed lines after each edit, and runs identically for human pane edits — one reconciler, both directions.
- **Edit op** = `{ start_anchor, end_anchor, replacement }` (the model emits only new content); **every write/edit/read result returns fresh anchors for touched lines**, so the agent never re-reads to learn current anchors. Validate by string-match. Decide insert semantics (zero-width range vs "insert after").

**Anchor pool = out-of-band repo tool, cached asset** (not in the harness; the harness loads a committed list). **Enumerate** when the vocab is public (OpenAI tiktoken/o200k, open-weights); **probe** `count_tokens`-only providers (Anthropic, Gemini). **Start OpenAI** (trivial enumerate; pi runs OpenAI without forcing the Codex harness). The architecture is tokenizer-independent — fallback is short 1–2-token anchors, so no provider is ever locked out. Verify single-token in the actual gutter format (`anchor§line`), not in isolation.

**Context efficiency, two halves:**

- _Half A_ — return the canonical, anchored doc in the **tool result**. Ships now via `customTools`; gives anchors with no read-back.
- _Half B_ — drop the redundant raw write-input. Feasible via pi's `context` hook ("Fired before each LLM call. Can modify messages"), which is non-destructive (transforms what's _sent_, leaves pi's session honest). Put truth in the result, never falsify the assistant turn → no disclosure needed. Truncate (don't substitute) the raw input on later turns.
- **Caching discipline:** the doc goes through the model once → becomes a stable cached prefix → edits are append-only deltas; transforms must be deterministic to keep the prefix byte-stable; re-materialize only at compaction.

**Integration.** Use the **lower-level pi path** (`createAgentSessionFromServices` / runtime) behind **one thin adapter** (a single blast-radius for pi-version drift). `AgentBinding` is our **internal boundary** (tools + context transform + prompt sections + hooks + lifetime); shared state (reconciler, canvas store) is injected as **typed services**, not binding-to-binding reach-through. Two tiers kept distinct: substrate bindings (deep, trusted) vs user extensions (narrow, jiti-loaded). This is the "kernel module vs userland" split.

**Thesis.** UIX is a context-engineering layer that owns the agent loop and curates the tool-call/result history for one specific side-channel — and owning the loop is what lets it be more efficient and reliable than a generic FS agent or MCP tool.

## Open questions / spikes

1. Confirm `createAgentSessionFromServices` (or the runtime factory) accepts an in-process `ExtensionFactory` — the Half-B landing spot. (`createAgentSession` only exposes `customTools`.)
2. Confirm pi's `context`-hook message edits are **send-only**, not persisted, and that deterministic truncation holds the cache prefix.
3. Pin the anchor encoding: gutter format, delimiter, pool size, single-token verification.
4. Edit-tool insert semantics.
5. Stage-2 shim injection mechanism — deferred; replan against real friction.

## Spawns

- Decisions: [hosting-compatible-by-default](../decisions/2026-05-31-hosting-compatible-by-default.md) and [canvas-stage-one](../decisions/2026-05-31-canvas-stage-one.md) are the landed constraints this builds on. The anchor model + lower-level/AgentBinding structure become their own decisions once pinned.
- Plan: a stage-one-edit spec (tool contract: `read`/`write`/`edit`; the reconciler; OpenAI enumerate pool; thin adapter + `AgentBinding` evolution; Half-B as fast-follow with spikes 1–2). Build order: reconciler + anchor tools (Half A, `customTools`) first; then the lower-level refactor + `context`-hook dedup.

## Log

### 2026-06-01 — framing, anchor model, doc system

Worked the canvas pane from "stage 2 writeback" into the broader realization that it's a bidirectional side-channel, and that the agent→doc and doc→agent directions should share one anchored-diff representation. Settled on Dirac-style assigned single-token anchors over content hashes (after first leaning content-hash, then reversing once the Dirac post and the caching design showed assigned IDs win on duplicates + human-side alignment, and the token cost of either is amortized to near-nothing by the write-once/append-only/cached design). Mapped the case-1/case-2 split and the promotion path. Found pi's `context` hook as the home for token-dedup (Half B) and that it needs the lower-level `createAgentSessionFromServices` path since `createAgentSession` only takes `customTools`. Confirmed jiti is orthogonal (it loads user extension files; the hook gate is API-surface, not CJS/ESM). Decided `AgentBinding` is the internal boundary with shared state injected as services. This session also stood up the `docs/` four-layer structure this note lives in.
