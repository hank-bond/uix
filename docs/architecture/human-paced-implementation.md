---
summary: "UIX implementation sessions align on design, build one small complete chunk, explain it, and wait for human approval before continuing."
kind: how-to
read_when: "Read before multi-step work whose design and implementation are evolving with a human."
---

# Human-paced implementation loop

UIX often discovers the right primitive during implementation. Do not implement a broad plan in one step when the human is still shaping its design. Work linearly. Optimize for shared understanding, short integration cycles, and tested production behavior.

## Planning rules

### Require a current use

Build only what a production path needs. A known future requirement may influence a choice between equally simple designs, but it does not justify more code. Add a mechanism only with its first production use. This rule applies to abstractions, validation, diagnostics, failure handling, and public contracts.

A spike may test an external assumption, but it remains throwaway research unless it uses the production path. Defer recovery behavior until a current caller needs it. Validate external, persisted, and dynamically loaded values at their boundaries. Do not add repeated checks for trusted in-process values.

### Keep one checked implementation

Every review unit passes all checks and leaves one supported production path. A plan does not include temporary abstractions, parallel implementations, compatibility paths, or code that a later unit replaces.

If a breaking migration cannot form smaller units that pass the checks, migrate the contract and its current callers together. An explicit limited product policy is better than a general implementation without a current use.

## Loop

1. **Align at the design level first:** Before editing, name the affected UIX primitives. Explain why the step belongs now and what it excludes.
2. **Split at the smallest checked boundary:** A chunk should focus on one concept and exercise its production path. It must compile, pass checks, and contain no code scheduled for replacement.
3. **Implement only that chunk:** Do not add related work unless the human explicitly agrees. If implementation reveals a better boundary, stop and discuss it.
4. **Explain what changed and why:** Name files, describe the shape, call out tradeoffs, and state which checks passed.
5. **Ask focused questions:** Surface naming, scope, API-shape, and future-extension questions while the change is still small.
6. **Wait for approval before the next chunk:** The human must understand and approve the direction, not only confirm that the code works.

## Chunk size guidance

A good chunk usually does one of these:

- Introduces an API together with its first production caller.
- Renames or re-scopes one concept and migrates every current caller.
- Improves one concrete renderer, tool, or surface path.
- Documents a decision made during the session.
- Moves files to match an already-used ownership boundary.
- Proves one production renderer or override before extracting shared code.

A chunk is too large when review must answer unrelated questions at once, such as naming, persistence, styling, and public API shape. Split those concerns only where each part passes the checks and belongs in the final design. Keep a breaking contract and its callers together when separating them would require a temporary helper or compatibility layer.

## Defaults for the agent

- Prefer small, reversible steps that run through production.
- Resequence a plan when it calls production code temporary or says that a later unit replaces it.
- Keep first-party defaults concrete until a second contributor requires a registry.
- Ask before introducing new public APIs, dependencies, or persistent formats.
- Commit at stable boundaries after checks pass and the human approves.
- Keep documentation current with pivots made during the session. Put source-coupled knowledge at its narrowest code owner, cross-boundary knowledge in repository documentation, and future work in plans.
