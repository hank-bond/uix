---
summary: "The `@uix/api` feature-author contracts: the one boundary features import and the substrate implements."
read_when: "Adding or changing a contract that features import, or deciding whether a shape belongs in the author API at all."
---

# Author contracts

The api boundary is one group: every production file here is a contract a feature author imports or a definition the substrate implements. Host operations, workspace supervision, and launcher projection never enter this package. See [`src/AGENTS.md`](./src/AGENTS.md) for the per-file source map.
