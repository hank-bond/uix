---
summary: "Working mode for UIX implementation sessions: align on design first, split work into the smallest meaningful buildable chunks, and review each chunk for human understanding and explicit cosign before moving on."
read_when: "Read before making multi-step UIX changes with a human in the loop, especially when design and implementation are evolving together."
status: active
---

# Human-paced implementation loop

UIX work often discovers the right primitive while building it. The agent should not rush to one-shot a broad implementation when the human is actively shaping the design. Work linearly, keep chunks small, and optimize for shared understanding over raw throughput.

## Loop

1. **Align at the design level first.** Before editing, explain the next step in terms of the UIX primitives it touches, why this step is worth doing now, and what it intentionally leaves out.
2. **Split into the smallest meaningful buildable chunk.** A chunk should be conceptually small but complete enough to compile, run checks, and teach us something. Some extra churn is acceptable if it keeps review understandable.
3. **Implement only that chunk.** Avoid opportunistic adjacent work unless the human explicitly agrees. If the chunk reveals a better boundary, stop and discuss rather than continuing silently.
4. **Explain what changed and why.** Name files, describe the shape, call out tradeoffs, and state which checks passed.
5. **Ask focused questions.** Surface naming, scope, API-shape, and future-extension questions while the change is still small.
6. **Wait for cosign before the next chunk.** The goal is that the human fully understands and approves the direction, not just that the code works.

## Chunk size guidance

A good chunk usually does one of these:

- introduces a seam without changing behavior;
- renames/re-scopes a concept so the vocabulary is right;
- improves one concrete renderer/tool/pane path;
- documents a decision made during the session;
- moves files to match an emerging feature boundary;
- proves one exact renderer/override before generalizing a registry.

A chunk is too large when review has to answer unrelated questions at once, such as naming plus persistence plus styling plus public API shape. Split those apart even if doing so means a temporary helper, hardcoded path, or follow-up cleanup.

## Defaults for the agent

- Prefer boring, reversible steps.
- Keep first-party defaults hardcoded **along the future contribution grain** rather than extracting registries before there is a real second contributor.
- Ask before introducing new public APIs, dependencies, or persistent formats.
- Commit at stable boundaries after checks pass and the human approves.
- Keep docs current with pivots made during the session; user-facing `src/docs/` should describe current code, and dev-facing `docs/` should capture rationale and future shape.
