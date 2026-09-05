---
summary: "Exploring branch-local feature reloads so one session can run main while another tests app changes, with feature settings in each worktree and coordinated reloads for convenience."
kind: explanation
status: exploring
---

# Worktree-backed app generations

## Current synthesis

This thread records a multi-Agent authoring direction, not an implementation contract. The motivating workflow is one session running the app from the main worktree while another edits and tests a branch of that app. Testing feature changes should not require merging them to main first.

The discussion began with Canvas web routes and resource serving. Static content is not necessarily shared content: an Agent can edit feature source, surfaces, and assets. Two worktrees can therefore resolve the same feature-local path to different content. Staticness alone does not establish Workspace scope or justify bypassing an attachment binding.

### Branch-local execution

An Agent restart that only recreates objects from already loaded feature code is useful for recovery, but does not complete the edit, reload, and test loop. A useful branch-local reload needs to load the feature code being edited in that viewpoint's worktree.

A separate process per Agent is not inherently necessary to load different feature versions. The discussion favored exploring coexistence within one workspace runtime rather than requiring process-per-Agent isolation. This remains trusted feature code, not a proposed security boundary. The module-loading mechanism is not settled.

UIX already separates Workspace feature activation bags from per-Agent feature bags. Each Agent gets separate objects from `agent(ctx)`, but those factories come from centrally loaded feature definitions. Separate mutable Agent objects alone do not provide branch-local code versions.

The proposed distinction is between the durable Workspace and an _app composition generation_: the active feature code and associated app configuration used by a viewpoint. One session could use the main version while another uses an experimental version. Feature contracts, surfaces, clients, and assets need to agree with the feature implementation selected for that session, rather than silently using the main version.

Placing Workspace feature activation beneath such a generation was the promising ownership sketch. It would build on the existing two lifecycles instead of treating one central Workspace feature activation as sufficient for every branch. The exact object hierarchy, public factory shape, and generation-sharing policy were not decided.

Worktrees belong to durable viewpoints or session branches, not ephemeral Agent instances. Recreating an Agent on the same viewpoint should not require a different worktree.

### Reload convenience

Independent versions have a real usability cost. The user often finds version skew between separate Pi TUI sessions inconvenient and does not want UIX to require repetitive reloads just to keep Agents aligned.

Both needs should remain visible in the design:

- Reload one session to test its branch without changing another session running main.
- Offer coordinated reload of all Agents as a convenience.

We also discussed Workspace reload replacing shared settings or clients and consequently recreating dependent Agent instances. The relationship between that operation and bulk Agent reload remains unsettled. In particular, reloading every Agent from its own worktree is not the same as making every Agent execute one source version. The discussion did not choose command names, promotion behavior, or a replacement protocol.

### Feature settings belong with the branch

The user explicitly accepted keeping feature settings schemas and values with the app version being tested. A feature schema comes from that worktree's feature code, and its settings values live in that worktree's `uix.workspace.json`. There is no requirement for one Workspace-global feature settings object across incompatible app versions.

Materializing defaults into the worktree manifest is desirable, not an unwanted side effect. The authoring workflow is:

1. Edit feature code and its settings schema in the session worktree.
2. Reload and test that version, allowing defaults to write into the worktree's manifest.
3. Review and merge code and configuration together into the main worktree when the session's changes are ready.
4. Reload main to activate the merged app version.

Settings changes are ordinary versioned file changes. Git handles branch integration rather than an additional runtime settings-merge mechanism.

Host configuration, credentials, workspace supervision, and stable storage authority remain outside branch-owned feature configuration. This distinction does not settle the location of every existing setting or introduce a separate preference system.

### Boundaries retained from the discussion

The host bootstrap can remain outside workspace runtimes. It is needed before a workspace is acquired and is not the same as the Canvas iframe bootstrap inside an active workspace. Hosts continue to own physical connections and transport integration.

The resource-serving discussion motivates the scope question, but this thread does not decide a replacement for `ResourceRegistry`. Branch-relative resolution and caching exact immutable bytes are separate concerns. Caching does not by itself justify sharing live feature objects or mutable settings between worktrees.

## Matters left open

The discussion reached a useful direction without selecting an implementation. These questions need attention when the multi-Agent work is designed:

- How are feature modules and their dependencies reloaded without mixing source versions, including repeated reloads of the same worktree?
- Where does app-generation ownership sit relative to the existing Workspace and Agent bags? What, if anything, can be shared between worktrees beyond immutable code or bytes?
- What distinguishes Workspace reload, selected-Agent reload, and reload-all?
- How does replacement settle accepted operations, commit outgoing state, restore the replacement, and update attachments and surfaces without two writers to one viewpoint?
- Which failures preserve the previous activation? Preflight rejection does not imply rollback of arbitrary feature activation effects.
- How should changed feature code handle older persisted turn state and documents when reloading or returning to a previous branch state?

These questions are intentionally unresolved. In particular, this thread does not promise atomic whole-app hot replacement, automatic generation deduplication, or a durable source-version selection model.

## Related records

- [`workspace-feature-composition.md`](./workspace-feature-composition.md) records the existing Workspace and Agent factory split and earlier composition alternatives.
- [`workspace-settings.md`](./workspace-settings.md) records schema-defined settings and default materialization. This thread explores changing their ownership scope for branch-local app versions.
- [`2026-08-08-session-worktrees-and-turn-checkpoints.md`](../decisions/2026-08-08-session-worktrees-and-turn-checkpoints.md) establishes Git worktrees and checkpoints for workspace files.
- [`feature-source-admission.md`](./feature-source-admission.md) and [`2026-07-13-atomic-candidates-and-feature-activation.md`](../decisions/2026-07-13-atomic-candidates-and-feature-activation.md) distinguish candidate validation from runtime activation failures.
- [`feature-turn-state.md`](../specs/feature-turn-state.md) and [`connection-agent-attachments.md`](../specs/connection-agent-attachments.md) constrain outgoing persistence, restoration, accepted work, and attachment lifetimes.

## Log

### 2026-09-04: branch-local app execution

Discussion of Workspace resources and viewpoint web routes exposed that staticness does not determine execution scope. Feature code and assets can differ between Agent worktrees, so a stable path may still require attachment-bound resolution. Only exact immutable output can be shared safely without first selecting the source generation.

The initial option kept one Workspace feature generation and treated an Agent reload as replacement of the in-memory Agent instance. That restart remains useful for recovery, but it was rejected as the primary authoring loop because it cannot load the feature changes that the Agent just made. Requiring a merge to main before any interactive test was also rejected as the only path. It prevents one session from remaining on main while another tests an app branch.

A process per Agent would provide version isolation, as base Pi TUI sessions do, but repeated processes make coordinated version updates inconvenient and duplicate services that UIX already supervises together. Distinct in-process app composition generations preserve branch-local testing while retaining a reload-all operation for convenience and coherence.

The existing Workspace and Agent feature bags provide the initial lifetime split. The emerging direction places each Workspace feature activation under an app composition generation loaded from one worktree, then creates Agent feature instances beneath that generation. Feature settings schemas and values follow the same generation and may materialize defaults into the worktree manifest. Host and substrate configuration remains outside the branch-owned app configuration.

### 2026-09-04: capture the discussion without prescribing the implementation

Review found that the first synthesis went beyond the discussion by prescribing a candidate replacement sequence, broad failure preservation, and generation sharing. The user requested a narrower record of what the conversation established rather than completing the architecture speculatively. The synthesis therefore retains branch-local execution, the main-versus-experiment workflow, coordinated reload convenience, the two existing lifecycle bags as a foundation, and worktree-local feature settings. Replacement mechanics, sharing, and failure semantics remain questions rather than decisions.
