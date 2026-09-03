---
summary: "An Agent viewpoint ties one session branch to the feature state, documents, and working directory that the Agent sees."
kind: reference
status: draft
implementation: incomplete
---

# Agent viewpoints

## Contract

An _Agent viewpoint_ is one Agent's state at a branch of a durable session. Attachments, Agent instances, headless jobs, and features use the viewpoint as their common target.

A viewpoint does not put all of this state in one store. Instead, the selected session branch records references to feature turn state, managed documents, and other durable state.

## Boundary

The viewpoint owns branch identity, the state references recorded on that branch, and the working locations provided to Agent features.

Each store owns its content and versioning. The Agent instance owns live execution. An attachment targets a viewpoint for one connection but does not own its durable state.

The workspace state root, worktree root, and Agent working directory are separate locations, even when they resolve to the same directory.

## Requirements

- Session identity and viewpoint identity **must** remain distinct.
- One Agent **must** be the only writer to a branch in the multi-Agent model.
- Several Agents **may** run on different branches of one session.
- A branch fork **must** create a distinct viewpoint from its selected parent entry.
- Each participating store **must** restore from the stable reference recorded on the selected branch.
- UIX **must not** describe updates to several stores as one transaction unless those stores provide that guarantee.
- Agent feature code **must** receive its operating context without selecting a workspace, session, branch, or Agent.
- The workspace state root **must** remain stable when the Agent changes its working location.
- The Agent working directory is branch state, not branch identity. Changing it **must not** create a conversation branch.
- A branch **must** record enough working-directory state to reopen at its last accepted location.
- If that location no longer exists, UIX **must** use a defined fallback and tell the user.
- `AgentFeatureContext` **must** expose the Agent's worktree root.
- The worktree root **may** point to the primary worktree, an Agent worktree, or a stable mounted path such as `/workspace`.
- The worktree root **must not** be treated as a security boundary.
- UIX **must** guarantee branching and restoration only for state in managed stores.
- Persisted feature content **must** use logical or relative identities instead of physical worktree paths.
- UIX **must** restore the viewpoint before a feature can commit new state for it.

## Conformance

A conforming implementation demonstrates these outcomes:

1. Two viewpoints restore different feature and document state without overwriting each other.
2. A fork starts from its selected parent and then changes independently.
3. Agent feature code receives the selected viewpoint's worktree root without client-supplied routing fields.
4. Changing the Agent working directory preserves the conversation branch.
5. Reopening a branch restores its working directory or reports a fallback.

## Degrees of freedom

A conforming implementation may choose the physical filesystem, branch identifier, checkpoint encoding, and restoration mechanism.

## Open questions

- Which durable identifier names an Agent branch independently from Pi entries and live Agent instances?
- May an Agent working directory leave its branch worktree?
- What should happen when conversation, document, worktree, or database restoration fails partway through?
- How does one Agent receive read-only access to another Agent's artifacts?
