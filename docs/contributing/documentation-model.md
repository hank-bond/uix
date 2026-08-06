---
summary: "UIX documentation separates reader need, agent memory, readership, meta-level, lifecycle, and evolution while treating conceptual clarity and human maintenance as boundary constraints."
kind: explanation
read_when: "Read before proposing a change to the documentation structure or when the contribution practice has a gap."
---

# Documentation model

This page explains why UIX documentation is structured the way it is. The structure combines the Diátaxis need taxonomy with requirements specific to UIX. Humans must be able to maintain a coherent body of knowledge. Agents must recover the relevant parts without memory across sessions. The same structure applies to the UIX wiki and to app wikis. [`AGENTS.md`](./AGENTS.md) routes the practice for authoring and maintaining it.

## The axes

Six axes shape the documentation, and each answers a different question about a piece of content. A document occupies one position on each axis. Keep the axes separate. Treating a lifecycle position as a kind, or a delivery tier as a readership, causes organizational confusion.

### Need

The need axis comes from Diátaxis and has two dimensions.

- **Action or cognition:** Does the content tell the reader what to do, or inform what the reader knows?
- **Acquisition or application:** Does the content serve the reader's study, or the reader's work?

The two dimensions produce four kinds.

|               | acquisition (study)            | application (work)   |
| ------------- | ------------------------------ | -------------------- |
| **action**    | **tutorial:** a lesson         | **how-to:** a recipe |
| **cognition** | **explanation:** understanding | **reference:** a map |

Each indexed document carries a `kind` tag that names its quadrant. Content that crosses a quadrant boundary serves neither need clearly. Diátaxis classifies a discrete document after the repository has identified its durable owner and conceptual boundary.

### Memory

Agents have no memory across sessions. A human may forget document details but still remember that a document exists. The documentation therefore uses three delivery tiers.

- **Always loaded:** The root `AGENTS.md` orientation and top-level routing map, with an adjustable budget for nested ownership summaries.
- **Routed indexes:** Lower `AGENTS.md` files, loaded after a matching ownership route.
- **On demand:** Source files and leaf documents fetched when their summaries or triggers match the task.

Document frontmatter provides a summary recall surface and an optional external trigger. Source files provide one first-line responsibility summary. Generated indexes expose those summaries without copying complete descendants into every ancestor.

These tiers optimize delivery, not document boundaries. A working agent may load a narrow retrieval set, while a review agent may load an entire documentation tree. Neither mode requires conceptually separate maintenance units to occupy one file.

### Readership

Humans author, direct, and review the documentation, while agents retrieve and apply it. Human reviewability controls document boundaries because a human is the final arbiter of coherence. A document cannot remain reliable when its conceptual breadth exceeds what a reviewer can judge.

Agents use every Diátaxis quadrant: tutorials for acquisition, how-tos for tasks, references for lookup, and explanations when architectural judgment or external rationale affects implementation. Plain, explicit prose serves both readers.

### Meta-level

The documentation has three meta-levels.

- **What:** The content of the documentation.
- **How:** The contribution practice routed by [`AGENTS.md`](./AGENTS.md).
- **Why:** The reasoning behind the documentation structure. This page.

An agent needs the what to make code changes and the how to modify documentation. It needs the why when someone proposes a structural change or the practice has a gap.

Place code-related knowledge before classifying it by reader need. A contract owns its JSDoc, and an implementation site owns its why-comment. A file owns its responsibility header, while a source directory owns its boundary and coordination guidance. A local Markdown leaf can join several files under that owner. Repository documentation carries workflows, conventions, invariants, external context, and history that cross source ownership boundaries.

A document is a conceptually coherent, human-reviewable maintenance unit. A task may assemble several documents into one retrieval or review set. Dependencies between units remain explicit, but retrieval cost does not decide their physical boundaries.

### Lifecycle

The lifecycle axis marks maturity over time: a design note distills into a decision, a decision into a plan, and a plan into architecture. Each step is more settled than the last. The `status` field records the position only when it differs from the default current state: exploring, resolved, accepted, landed, archived, stub, or superseded.

Lifecycle is orthogonal to kind: a document has both a need and a maturity. Plans are the exception because they track the build rather than document it and carry no kind. Documents without a lifecycle, including `AGENTS.md` files and evergreen leaves, omit `status`.

### Evolution

The documentation is living: a change to the code carries a documentation change that aligns future work. The evolution loop keeps the whole set coherent.

1. **Capture:** Record the decision.
2. **Distill:** Place the normative residue where the agent acts on it.
3. **Index:** Regenerate the routing map in the same commit.
4. **Project:** Propagate the decision over space and time. Space means backporting to existing documentation and code. Time means guiding future work.
5. **Verify:** Confirm that the change complies and that nothing is stale.

A decision that is not propagated leaves the documentation inconsistent because a memoryless agent reads both versions and blends them. Partial propagation is worse than one consistent account. A corpus-wide review can verify relationships that no single maintenance unit owns.

## Open sections

- **Coordination routes:** Define a light form for edit-time dependencies between documents after real relationships emerge from the contribution split.
- **Delivery budget:** Define admission and size discipline for the always-loaded root without using retrieval cost to shape leaf boundaries.
