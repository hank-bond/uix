---
summary: "src/docs/ ships with the app and must track code; the repo-root docs/ tree is dev-facing meta and may lag."
status: accepted
---

# Documentation split: src/docs vs docs

- **`src/docs/`** — user-facing: what the code is and how to use it (write an extension, contribute a pane, define a channel, integrate with the agent session). Ships with the substrate. If a doc here is wrong, either the doc or the code is broken — update them together, in the same commit.
- **repo-root `docs/`** — dev-facing: decisions, design threads, architecture state, plans, archived thinking. Not pinned into the agent's system prompt.

The original `PROJECT_BRIEF.md` was archived (now [`plans/archive/project-brief.md`](../plans/archive/project-brief.md)) and its still-relevant pieces pulled forward.

> Note: this split later grew the four-layer structure documented in [`docs/AGENTS.md`](../AGENTS.md). The audience boundary (ship vs dev) is the decision; the internal organization of `docs/` evolved from it.
