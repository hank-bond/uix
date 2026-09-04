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

- **[agent-bound-feature-web](./agent-bound-feature-web.md)** _(draft, incomplete, reference)._ An Agent feature can provide typed web routes and static assets at substrate-bound addresses. Feature code declares contracts, and UIX derives relative paths, a bound client, and validated responses.
- **[agent-instances](./agent-instances.md)** _(draft, incomplete, reference)._ An Agent instance runs one session branch, restores its feature state before use, and starts Pi only when needed.
- **[agent-viewpoints](./agent-viewpoints.md)** _(draft, incomplete, reference)._ An Agent viewpoint ties one session branch to the feature state, documents, and working directory that the Agent sees.
- **[canvas-artifacts](./canvas-artifacts.md)** _(draft, incomplete, reference)._ Canvas gives each Agent a versioned HTML document that the Agent edits by anchors and the human edits through a browser.
- **[connection-agent-attachments](./connection-agent-attachments.md)** _(draft, incomplete, reference)._ An attachment binds one workspace connection to one Agent viewpoint. Retargeting changes future work without moving accepted work or peer connections.
- **[feature-channels](./feature-channels.md)** _(accepted, conforming, reference)._ Backend channel contributions inherit producer scope, while surfaces declare and validate each consumed namespace against the live registry projection.
- **[feature-turn-state](./feature-turn-state.md)** _(draft, incomplete, reference)._ Feature turn state records each feature's small private snapshots on the Pi session branch and restores them before the feature resumes work.
- **[managed-documents](./managed-documents.md)** _(draft, incomplete, reference)._ Managed documents expose current content with a durable revision and immutable versions behind a neutral store. Conditional replacement prevents silent lost writes.
- **[shared-live-object-guards](./shared-live-object-guards.md)** _(draft, incomplete, reference)._ A supervisor owns each shared object, and guards keep it alive for independent callers.
- **[web-host](./web-host.md)** _(accepted, incomplete, reference)._ A web host exposes launcher, workspace-session, live-channel, and content access to a standard browser through deployment-authorized public origins while keeping runtime and feature contracts host-neutral.

<!-- INDEX:END -->
