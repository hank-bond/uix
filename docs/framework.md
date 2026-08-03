---
summary: "UIX documentation separates reader need, agent memory, readership, meta-level, lifecycle, and evolution into independent organizing axes."
kind: explanation
status: active
read_when: "Read before proposing a change to the documentation structure (the how), or when the how has a gap."
---

# Framework

This page explains why UIX documentation is structured the way it is. The structure combines the Diátaxis need taxonomy with two requirements specific to UIX. It must serve agents that have no memory across sessions, and it must stay coherent as it evolves, through a formal loop. The same structure applies to the UIX wiki and to app wikis. The practice of authoring and maintaining the structure lives in [`contributing.md`](./contributing.md).

## The axes

Six axes shape the documentation, and each answers a different question about a piece of content: a document occupies one position on each axis. Keep the axes separate; treating a lifecycle position as a kind, or a delivery tier as a readership, causes organizational confusion.

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

- **Always loaded:** The root `AGENTS.md` orientation and top-level routing map.
- **Routed indexes:** Lower `AGENTS.md` files, loaded only after a matching top-level route.
- **On demand:** Leaf documents fetched when a summary or trigger matches the task.

Two frontmatter fields support this routing. `summary` is the recall surface, while `read_when` adds a non-obvious trigger. Each traversal should fetch only the relevant path and leaves.

### Readership

The documentation serves two audiences: the human pilot and the agent. The human directs, and the agent performs the work. The explanation quadrant serves the human and records reasoning, product judgment, and taste. The how-to and reference quadrants serve the agent and state what to do and how the machinery behaves. Agent-facing quadrants are the default, and human-facing content exists only where the work requires judgment, taste, or perspective that an agent cannot supply.

### Meta-level

The documentation has three meta-levels.

- **What:** The content of the documentation.
- **How:** The rules for modifying the documentation. They live in [`contributing.md`](./contributing.md).
- **Why:** The reasoning behind the documentation structure. This page.

An agent needs the what to make code changes and the how to make structural documentation changes. It needs the why only when a how-change is proposed or the how has a gap.

The why is placed by its scope. A why that applies to one place is a code comment, staying near the code and changing with it. A why that recurs is a convention card's Reason section, and a why that shapes the architecture is a decision document. The documentation carries only whys that cannot be a comment.

### Lifecycle

The lifecycle axis marks maturity over time: a design note distills into a decision, a decision into a plan, and a plan into architecture. Each step is more settled than the last. The `status` field records the position: exploring, resolved, accepted, active, superseded, or archived.

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
