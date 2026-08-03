---
summary: "UIX implementation sessions align on design, build one small complete chunk, explain it, and wait for human approval before continuing."
kind: how-to
read_when: "Read before multi-step work whose design and implementation are evolving with a human."
status: active
---

# Human-paced implementation loop

UIX work often discovers the right primitive while building it. The agent should not rush to one-shot a broad implementation when the human is actively shaping the design. Work linearly, keep chunks small, and optimize for shared understanding over raw throughput.

## Loop

1. **Align at the design level first:** Before editing, name the affected UIX primitives. Explain why the step belongs now and what it excludes.
2. **Split into the smallest meaningful buildable chunk:** A chunk should be conceptually small but complete enough to compile, run checks, and teach us something. Some extra churn is acceptable if it keeps review understandable.
3. **Implement only that chunk:** Avoid opportunistic adjacent work unless the human explicitly agrees. If the chunk reveals a better boundary, stop and discuss rather than continuing silently.
4. **Explain what changed and why:** Name files, describe the shape, call out tradeoffs, and state which checks passed.
5. **Ask focused questions:** Surface naming, scope, API-shape, and future-extension questions while the change is still small.
6. **Wait for cosign before the next chunk:** The goal is that the human fully understands and approves the direction, not just that the code works.

## Chunk size guidance

A good chunk usually does one of these:

- Introduces a seam without changing behavior.
- Renames/re-scopes a concept so the vocabulary is right.
- Improves one concrete renderer/tool/pane path.
- Documents a decision made during the session.
- Moves files to match an emerging feature boundary.
- Proves one exact renderer/override before generalizing a registry.

A chunk is too large when review has to answer unrelated questions at once, such as naming plus persistence plus styling plus public API shape. Split those apart even if doing so means a temporary helper, hardcoded path, or follow-up cleanup.

## Defaults for the agent

- Prefer boring, reversible steps.
- Keep first-party defaults hardcoded **along the future contribution grain** rather than extracting registries before there is a real second contributor.
- Ask before introducing new public APIs, dependencies, or persistent formats.
- Commit at stable boundaries after checks pass and the human approves.
- Keep documentation current with pivots made during the session. Put source-coupled knowledge at its narrowest code owner, cross-boundary knowledge in repository documentation, and future work in plans.
