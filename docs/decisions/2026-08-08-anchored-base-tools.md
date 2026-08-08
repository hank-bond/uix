---
summary: "The base read/write/edit tools become anchor-based so files and canvases share one §-wire editing vocabulary: the anchor core (AnchoredDocument, pool, wire) is shared substrate, while anchored file tools remain feature-owned contributions over a per-feature buffer."
kind: explanation
status: accepted
---

# Anchored base tools

## Context

The agent's file mutations already flow through the workspace-tools exact-name overrides, so UIX observes every read/write/edit at the tool layer. Switching the base file tools to the anchored vocabulary that Canvas already uses gives files and canvases one wire format and makes every agent edit address lines by stable anchor rather than by line number.

## What changes

- Base `read`/`write`/`edit` present §-anchored lines and edit by anchor with match-guards, mirroring Canvas's `anchor_read`/`anchor_write`/`anchor_edit` contract.
- The anchor core — `AnchoredDocument`, the anchor pool, and the §-wire format — is extracted into a shared module. It is already text-generic; Canvas's HTML canonicalization and file normalization become injected buffer strategies.
- Agent tool contributions stay feature-owned: the files feature registers its own anchored file tools (or exact-name overrides). The substrate does not own a generic agent editing tool set — agent exposure remains feature-owned.
- Prompt guidance updates so the agent reads and quotes anchored lines consistently for both files and canvases.

## Anchors and commits are complementary

Anchors address lines _within_ a turn (editing vocabulary, anchored diffs); git turn checkpoints version _between_ turns (rollback). Neither replaces the other: the anchor layer edits, the commit layer remembers — see [session worktrees and turn checkpoints](./2026-08-08-session-worktrees-and-turn-checkpoints.md).

**Rejected:** a substrate-owned generic anchored editing substrate (feature-owned tools keep vocabulary per domain); keeping file tools positional while Canvas anchors (two vocabularies, worse long-lived addressing).
