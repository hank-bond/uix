---
summary: "Requirement specifications define the stable contract and conformance outcomes for coherent UIX concepts, independent of one implementation attempt."
read_when: "Writing, reviewing, accepting, or implementing a UIX requirement specification."
---

# Requirement specifications

Specifications are named for the concept that they define. Each specification declares `status: draft` while requirements remain unsettled. It declares `status: accepted` once the specification is sufficient to implement and test the concept without design history or a plan.

Each specification declares `implementation: incomplete` when HEAD has one or more known gaps. It declares `implementation: conforming` when HEAD and its tests satisfy the complete target. Requirement status and implementation state are independent.

Draft specifications may contain open questions and have no normative authority. Accepted specifications contain no open questions. Their normative content changes only when the concept's boundary, invariant, observable behavior, dependency, compatibility commitment, or defining conformance outcome changes. Specifications remain future-facing while their implementation is incomplete.

[`requirement-specifications.md`](../contributing/requirement-specifications.md) defines the repository-wide content and lifecycle practice.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[agent-instances](./agent-instances.md)** _(draft, incomplete, reference)._ An Agent instance owns execution at one session branch, restores feature state before use, and starts Pi only when needed.
- **[agent-viewpoints](./agent-viewpoints.md)** _(draft, incomplete, reference)._ An Agent viewpoint ties one session branch to the feature state, documents, and working directory that the Agent sees.
- **[browser-presentation-state](./browser-presentation-state.md)** _(draft, incomplete, reference)._ Browser-local presentation state restores opted-in workspace preferences and conversation-item state across visits, with feature-defined author defaults.
- **[canvas-artifacts](./canvas-artifacts.md)** _(draft, incomplete, reference)._ Canvas gives each Agent a versioned HTML document that the Agent edits by anchors and the human edits through a browser.
- **[connection-agent-attachments](./connection-agent-attachments.md)** _(draft, incomplete, reference)._ An attachment binds one connection to an Agent viewpoint. Viewpoint selection affects one connection, while Agent replacement updates every attachment targeting that Agent.
- **[feature-channels](./feature-channels.md)** _(accepted, incomplete, reference)._ Backend channel contributions inherit producer scope, while surfaces declare and validate each consumed namespace against the live registry projection.
- **[feature-composition](./feature-composition.md)** _(draft, incomplete, reference)._ Each Agent loads its own feature composition and replaces it as one unit, preserving the active composition when a candidate fails.
- **[feature-turn-state](./feature-turn-state.md)** _(draft, incomplete, reference)._ Feature turn state records each feature's small private snapshots on the Pi session branch and restores them before the feature resumes work.
- **[managed-documents](./managed-documents.md)** _(draft, incomplete, reference)._ Managed documents expose current content with a durable revision and immutable versions behind a neutral store. Conditional replacement prevents silent lost writes.
- **[shared-live-object-guards](./shared-live-object-guards.md)** _(draft, incomplete, reference)._ A supervisor owns each shared object, and guards keep it alive for independent callers.
- **[viewpoint-web-namespaces](./viewpoint-web-namespaces.md)** _(draft, incomplete, reference)._ A feature can provide typed web routes and static assets in each viewpoint through substrate-bound addresses. Contracts remain generic while installation establishes namespace and scope.
- **[web-host](./web-host.md)** _(accepted, incomplete, reference)._ A web host exposes launcher, workspace-session, live-channel, and content access to a standard browser through deployment-authorized public origins while keeping runtime and feature contracts host-neutral.
- **[workspace-file-state](./workspace-file-state.md)** _(draft, incomplete, reference)._ UIX gives each conversation branch an independent worktree and immutable file checkpoints addressed by compact, stable IDs.

<!-- INDEX:END -->
