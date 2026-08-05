---
summary: "UIX documentation separates reader need, agent memory, readership, meta-level, lifecycle, and evolution into independent organizing axes."
kind: explanation
read_when: "Read before proposing a change to the documentation structure (the how), or when the how has a gap."
---

# Framework

This page explains why UIX documentation is structured the way it is. The structure combines the Diátaxis need taxonomy with two requirements specific to UIX. It must serve agents that have no memory across sessions, and it must stay coherent as it evolves, through a formal loop. The same structure applies to the UIX wiki and to app wikis. The practice of authoring and maintaining the structure lives in [`contributing.md`](./contributing.md).

## The axes

Six axes shape the documentation, and each answers a different question about a piece of content: a document occupies one position on each axis. Keep the axes separate. Treating a lifecycle position as a kind, or a delivery tier as a readership, causes organizational confusion.

### Need

The need axis comes from Diátaxis and has two dimensions.

- **Action or cognition:** Does the content tell the reader what to do, or inform what the reader knows?
- **Acquisition or application:** Does the content serve the reader's study (acquiring skill), or the reader's work (applying skill)?

The two dimensions produce four kinds.

|               | acquisition (study)            | application (work)   |
| ------------- | ------------------------------ | -------------------- |
| **action**    | **tutorial:** a lesson         | **how-to:** a recipe |
| **cognition** | **explanation:** understanding | **reference:** a map |

Each indexed document carries a `kind` tag that names its quadrant, and classifying new content means applying the two questions. Do not blur quadrants: content that crosses a quadrant boundary serves neither need. Blur costs an agent more than a human, because an agent reads everything it receives at full token cost.

### Memory

Agents have no memory across sessions. A human may forget document details but still remember that a document exists. The documentation therefore uses three delivery tiers.

- **Always loaded:** The root `AGENTS.md` orientation and top-level routing map, with an adjustable budget for nested ownership summaries.
- **Routed indexes:** Lower `AGENTS.md` files, loaded only after a matching ownership route.
- **On demand:** Source files and leaf documents fetched when their summary or trigger matches the task.

Document frontmatter provides a `summary` recall surface and an optional `read_when` trigger. Source files provide one first-line responsibility summary. Generated indexes expose those summaries without copying complete descendants into every ancestor. Each traversal should fetch only the relevant path and leaves.

### Readership

Repository documentation primarily serves agents, while the user directs and reviews their work. Diátaxis classifies the reader's need rather than the reader's identity. Agents use every quadrant: tutorials for acquisition, how-tos for tasks, reference for lookup, and explanation when architectural judgment or external rationale affects implementation. Human-readable prose remains necessary because the user must understand and review the same constraints.

### Meta-level

The documentation has three meta-levels.

- **What:** The content of the documentation.
- **How:** The rules for modifying the documentation. They live in [`contributing.md`](./contributing.md).
- **Why:** The reasoning behind the documentation structure. This page.

An agent needs the what to make code changes and the how to make structural documentation changes. It needs the why only when someone proposes a how-change or the how has a gap.

Place code-related knowledge before classifying it by reader need. A contract owns its JSDoc, and an implementation site owns its why-comment. A file owns its responsibility header, while a source directory owns its boundary and coordination guidance. A local Markdown leaf can join several files under that owner. Repository documentation carries workflows, conventions, invariants, external context, and history that cross source ownership boundaries.

Diátaxis applies after information earns a discrete document. It does not force source-coupled knowledge into Markdown or assign a kind to file summaries, comments, and routing indexes.

### Lifecycle

The lifecycle axis marks maturity over time: a design note distills into a decision, a decision into a plan, and a plan into architecture. Each step is more settled than the last. The `status` field records the position only when it differs from the default current state: exploring, resolved, accepted, landed, archived, stub, or superseded. Documents without a lifecycle, such as each `AGENTS.md` and evergreen reference and how-to docs, omit the field.

Lifecycle is orthogonal to kind: a document has both a need and a maturity.

Plans are the exception: they track the build rather than document it and carry no kind.

### Evolution

The documentation is living: a change to the code carries a documentation change that aligns future work. The evolution loop keeps the whole set coherent. It has five steps.

1. **Capture:** record the decision.
2. **Distill:** place the normative residue where the agent acts on it.
3. **Index:** regenerate the routing map in the same commit.
4. **Project:** propagate the decision over space and time. Space means backporting to existing documentation and code. Time means guiding future work.
5. **Verify:** confirm that the change complies and that nothing is stale.

A decision that is not propagated leaves the documentation inconsistent, because a memoryless agent reads both versions and blends them. Being wrong some of the time is worse than being wrong all the time.

## Open sections

- **Budget:** The admission test for what belongs in the always-loaded root. Placeholder to build together.
