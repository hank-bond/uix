---
summary: "Each Agent loads its own feature composition and replaces it as one unit, preserving the active composition when a candidate fails."
kind: reference
status: draft
implementation: incomplete
---

# Feature composition

## Contract

A _feature composition_ contains the user contributions loaded for one Agent viewpoint and their application configuration. Each Agent loads and owns its own composition instead of instantiating factories from Workspace-loaded feature definitions.

Each feature has one activation rather than separate Workspace and Agent factories. The complete composition is the acceptance unit. A failed replacement leaves the active composition available so the Agent can repair the candidate and retry.

## Dependencies

This specification uses [`agent-viewpoints.md`](./agent-viewpoints.md) for durable viewpoint ownership, [`shared-live-object-guards.md`](./shared-live-object-guards.md) for retained live authority, and [`feature-turn-state.md`](./feature-turn-state.md) for branch persistence and restoration. [`workspace-file-state.md`](./workspace-file-state.md) owns worktree provisioning, copying installed dependencies, and checkpoint behavior.

## Boundary

The Agent owns activation of user contributions and their settings. The workspace runtime supervises Agents and retains stable shared substrate infrastructure. User contributions have no separate Workspace activation scope.

The initial scope provides reload of the selected Agent only. Coordinated reload across several Agents is outside this implementation.

Every value in `uix.workspace.json` belongs to that worktree's application configuration, including substrate-defined settings. Credentials, host configuration, and the app-owned Pi profile remain outside this worktree-owned configuration.

[`browser-presentation-state.md`](./browser-presentation-state.md) owns browser-local preferences and conversation-item presentation state. Those values use author defaults from feature code rather than manifest settings.

Atomic acceptance covers UIX-owned composition state and its availability to consumers. Feature code remains trusted in-process code. The substrate does not promise rollback of direct filesystem writes, network calls, global mutations, or other effects performed outside its provisional capabilities. Process failure is outside this guarantee.

Worktree-local loading is a source-resolution policy, not a security boundary. Authors can load code and resources outside the worktree through explicit references or ordinary trusted code. External sources do not gain branch isolation or checkpoint coverage by participating in a composition. Restricting arbitrary feature code requires an execution sandbox, such as a virtual machine, rather than loader-level path checks. Execution sandboxing is outside this specification.

## Requirements

### Ownership and activation

- Each Agent **must** independently load its feature definitions and application configuration.
- Each feature **must** have one activation entry point instead of separate Workspace and Agent factories.
- UIX **must** treat all user contributions loaded for an Agent as one composition candidate.
- A failure in any candidate feature **must** reject the complete candidate rather than accept a partially successful composition.
- Replacing one Agent's composition **must not** replace another Agent's composition.

### Source resolution

- UIX **must** load the Agent's composition from its worktree copy of `uix.workspace.json`.
- UIX **must** resolve relative feature entries against the containing manifest directory.
- UIX **must** resolve feature-relative surface, asset, and skill references against the feature entry directory.
- UIX **must** support explicitly referenced code and resources outside the worktree. A reference **must not** be rejected solely because its target is outside that worktree.
- Explicit external references **must** retain their external targets rather than being silently redirected into the worktree.
- External source references **must not** cause UIX to share mutable feature activation state or settings between Agents.
- A missing worktree-local source **must** fail candidate preparation rather than fall back to the primary workspace's source.
- UIX **must not** present worktree-relative loading as confinement of trusted feature code.

### Application configuration

- UIX **must** read every value in `uix.workspace.json` from the Agent's worktree copy.
- Substrate-defined manifest settings **must** follow the same worktree ownership as feature settings. This includes Agent model defaults, favorite models, and keybindings.
- Application setting mutations and accepted default materialization **must** target that worktree's manifest rather than the primary workspace's manifest.
- UIX **must not** layer live primary-workspace configuration over an existing Agent's configuration or use it as a missing-value fallback.
- A new session **must** receive its starting manifest through worktree provisioning. Later primary-workspace manifest changes **must not** propagate into an existing session's configuration automatically.
- Connections targeting the same Agent **must** share its accepted manifest settings. Connections targeting different Agents **must** use their respective settings, even when they belong to one workspace runtime.
- UIX **must not** copy credentials or the app-owned Pi profile into a worktree as part of manifest configuration loading.

### Application setting persistence

- Ordinary application setting mutations **must** take effect without reactivating the feature composition.
- Each application setting mutation **must** write the worktree manifest immediately as part of that operation.
- UIX **must not** defer manifest persistence through a debounce timer, batching window, or background persistence queue.
- A successful settings response **must** mean that its manifest file replacement completed, not only that the in-memory setting changed.
- A manifest write failure **must** return an error to the caller rather than acknowledge successful persistence.

### Manifest write conflicts

The initial policy is last-write-wins for the worktree manifest. It does not detect or merge concurrent edits by the Agent, human, and application. Atomic composition acceptance protects the active generation, not pending edits to its source manifest.

- The last completed manifest file replacement **must** determine the persisted candidate.
- An application setting write **may** replace the manifest from the active generation's in-memory configuration, overwriting intervening direct file edits.
- UIX **must not** require external-edit conflict detection or conflict resolution before accepting an application setting write.
- Reload **must** read the persisted manifest candidate and apply the complete-composition acceptance rules. It **must not** reconstruct overwritten edits as an implicit merge.

For example, the active generation starts from manifest `1`. The Agent writes `1a` directly to disk. A human then changes an application setting, causing the active generation to persist `1b` from its configuration. Reload reads `1b`, and the changes unique to `1a` are lost. This outcome is permitted by the initial policy.

### Reload admission

- Reload **must** reject as busy while its target Agent has an active run or executing contribution handler, including channel and web-route handlers.
- Busy rejection **must not** cancel accepted work or queue a later reload attempt.
- Once reload begins, UIX **must** reject new Agent-bound work against that target until reload finishes, whether replacement succeeds or fails.
- Reload admission and exclusion **must** be scoped to the target Agent. Work on another Agent **must not** block the target's reload or be blocked by it.
- After a rejected candidate finishes cleanup, UIX **must** allow new work against the retained active composition.

Retaining the active composition during preparation does not require it to accept concurrent work. Reload temporarily closes admission without disposing the composition that remains available if preparation fails.

### Candidate preparation and acceptance

- UIX **must** retain the active composition while preparing its replacement.
- Candidate contributions and settings **must** remain provisional until acceptance.
- UIX-owned candidate preparation **must not** make candidate behavior active or mutate accepted state before acceptance.
- UIX-owned preparation **must not** persist candidate settings defaults or other candidate durable mutations before acceptance.
- If preparation fails, UIX **must** dispose the candidate's acquired lifetimes and retain the active composition.
- UIX **must** return candidate failure without requiring the previous composition to be replaced before another attempt.
- UIX **must** accept a replacement only after the complete candidate prepares successfully.
- UIX **must not** describe candidate cleanup as rollback of arbitrary trusted code effects.

Internal contribution code follows the same convention: preparation constructs provisional state and acquires disposable resources rather than performing irreversible effects. This convention is not an enforcement boundary for arbitrary feature code.

### Preparation readiness

- Before accepting a candidate, UIX **must** successfully load and activate every backend feature and validate its settings and contributions.
- Candidate acceptance **must** also require successful feature turn-state restoration and bundling of every contributed surface.
- A failure in any of those preparation steps **must** reject the complete candidate and retain the previous composition when one exists.
- Successful surface bundling **must not** be described as proof that browser mounting or subsequent feature execution will succeed.
- Browser mount and render failures **must** be treated as execution failures after acceptance rather than candidate preparation failures.
- Composition acceptance **must not** require successful mounting on every attached browser or distributed rollback when one browser fails.

### Composition cleanup

- After accepting a replacement, UIX **must** attempt disposal of the outgoing composition's acquired lifetimes.
- Cleanup errors **must** remain diagnosable and **must not** prevent attempts to dispose the remaining resources.
- Outgoing cleanup errors **must not** block the accepted replacement's handoff or cause rollback to the partly disposed composition.
- Reload outcomes **must** distinguish an accepted replacement with cleanup errors from a rejected candidate.
- Rejected-candidate cleanup errors **must** remain diagnosable without preventing admission from reopening on the retained active composition.

These requirements cover diagnosed cleanup failures, not guaranteed recovery of resources that arbitrary trusted cleanup code failed to release.

### Browser handoff

- After successful replacement, UIX **must** automatically reload every workspace page targeting the replaced Agent.
- Page reload **must** return to the same durable viewpoint and load the accepted replacement composition.
- Each reloaded page **must** obtain its surfaces, namespace projection, settings clients, and channel and web capabilities from that accepted composition.
- Successful composition replacement **must** reload affected pages even when their surface code has not changed.
- Replacement **must not** reload or retarget pages targeting other Agents.
- A rejected candidate **must** leave the previous composition and its pages usable without a page reload.
- Replacement acceptance **must not** wait for browser mounting acknowledgements. Each affected page **may** reload independently after notification.

[`connection-agent-attachments.md`](./connection-agent-attachments.md) governs attachment lifetimes and private web-binding revocation. Page reload recreates browser execution rather than preserving mounted components through hot replacement. Opted-in presentation continuity follows [`browser-presentation-state.md`](./browser-presentation-state.md), not incidental component survival.

## Conformance

A conforming implementation demonstrates these outcomes:

1. Two Agents load distinct compositions without sharing mutable activation state or settings.
2. A candidate containing several features fails in one feature. None of its contributions replaces the active composition, and the existing Agent remains available for repair and retry.
3. A rejected candidate leaves no UIX-owned registrations or materialized defaults active or persisted. UIX disposes the candidate resources it acquired.
4. A corrected candidate replaces the complete composition without replacing a peer Agent's composition.
5. Two worktree manifests resolve the same relative feature entry to their respective source files. Feature-relative contributions resolve from each selected entry directory.
6. An explicit external reference loads without a worktree-containment rejection. Agents using that source retain independent activation state and settings.
7. A missing local source rejects the candidate even when the primary workspace contains a file at the corresponding location.
8. Two Agents use different feature settings, model defaults, favorites, and keybindings from their worktree manifests. A mutation updates only the targeted worktree's configuration. Connections targeting that Agent share the accepted settings.
9. Changing the primary workspace manifest does not change an existing session's accepted configuration or provide its missing values. A new session receives the primary workspace's manifest through provisioning.
10. An Agent writes manifest `1a`, then an application setting write replaces it with `1b` derived from the active configuration. Reload evaluates `1b` without requiring conflict resolution or recovering the overwritten `1a` edits. If the candidate fails, the previous composition remains active.
11. Reload during an active run, channel handler, or web-route handler rejects as busy. The accepted work continues, and finishing it does not trigger a queued reload.
12. While one Agent reloads, new Agent-bound work for that target rejects and another Agent remains operational. A failed candidate reopens admission to the retained composition.
13. Backend loading, activation, settings validation, contribution validation, turn-state restoration, and surface bundling failures each reject the complete candidate. No successfully prepared subset replaces the active composition.
14. A surface bundles successfully, but mounting it fails with a diagnosable execution error. The failure does not trigger distributed rollback of the accepted composition across browsers.
15. Two pages targeting the replaced Agent automatically reload at the same durable viewpoint and load the accepted composition. A page targeting another Agent remains unchanged. Old composition-bound requests reject while a slower page reloads. A rejected candidate leaves existing pages and bindings usable without reloading.
16. Outgoing cleanup throws after successful preparation. UIX records the cleanup errors, attempts remaining disposal, and completes handoff to the accepted replacement without rollback. If rejected-candidate cleanup throws instead, UIX records it and reopens admission on the retained composition.
17. Initial composition preparation fails when no previous generation exists. UIX returns an activation failure and does not accept a partially prepared composition.
18. An ordinary settings mutation changes live settings without feature reactivation and writes the manifest as part of the same operation. Its response waits for file replacement, with no debounce or background persistence queue. A failed write returns an error.
19. Successful replacement reloads affected pages whether surface code changed or stayed identical. Opted-in workspace preferences and conversation-item state restore from browser-local persistence.

These outcomes assume feature code respects the preparation convention. Direct effects outside provisional substrate capabilities are not covered by composition atomicity.

## Open questions

- How do in-flight settings writes and accepted default materialization coordinate with checkpoints, reload, and teardown?
- Which Pi resource checks belong to candidate preparation without requiring lazy Pi execution to start?
