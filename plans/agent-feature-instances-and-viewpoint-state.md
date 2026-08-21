---
summary: "Revert the unused A1 composition code, then create feature state per Agent instance and prove isolated Canvas sessions."
---

# Agent feature instances and viewpoint state

## Purpose and status

Mutable Agent-facing feature state must belong to one `AgentInstance`, not to `WorkspaceRuntime`.

H4.2 allows an attachment to leave a guarded turn running on session A, move to session B, and start work there. Pi execution state is already separate for the two Agent instances. Feature state is not. Both instances can still reach Workspace-global Canvas buffers, turn-state callbacks, Agent-context buffers, tools, and registries.

The first A1 implementation added state builders, a separate composition engine, nominal admission, deep snapshots, operation records, and capability views. No production request uses that engine. The implementation confirmed that Agent registries and lifetimes must be per instance, but the extra code did not serve that requirement.

**R0 is next:** revert the A1 commits while keeping them in history. Restore the last green feature path, then implement per-instance feature state through production. Every later unit must pass all checks and leave one supported path.

A1-A2 precede the basic web host. H6 can then support several browser attachments without sharing Canvas state across sessions. The [Electron and server host split](./electron-server-split.md) continues to own the concrete hosts. [Runtime operation hardening](./runtime-operation-hardening.md) owns the remaining cancellation work.

## Planning rules

This plan follows the [human-paced implementation loop](../docs/architecture/human-paced-implementation.md):

- **Require a current use.** Add a mechanism only with its first production use. A future requirement may influence a choice between equally simple designs, but it does not justify more code.
- **Keep one checked implementation.** Do not add a temporary abstraction, parallel implementation, or compatibility path that a later unit removes. Keep a breaking contract and its callers in one unit when smaller units cannot pass all checks.

## Retained architecture

The host and runtime ownership model does not change:

```text
physical connection
→ concrete host
→ guarded WorkspaceRuntime
→ Attachment
→ guarded AgentInstance
→ lazy Pi runtime
```

Supervisors and guards protect shared live objects. Disposable bags own registrations and exclusive children. Attachments on one session share its primary `AgentInstance`. Different sessions use different Agent instances.

UIX calls the two feature factories at different scopes:

| Factory          | Call frequency              | State owner              |
| ---------------- | --------------------------- | ------------------------ |
| `workspace(ctx)` | Once per feature activation | Active Workspace feature |
| `agent(ctx)`     | Once per `AgentInstance`    | Session viewpoint        |

A feature remains one manifest source, settings scope, and reload unit. Each factory returns one contribution object. UIX registers that object as one unit. A failed registration removes that feature's partial work, while sibling features can continue.

`WorkspaceRuntime` keeps the loaded feature definitions in manifest order. It calls each `agent` factory for every Agent instance. This ordered list is sufficient for the present product. UIX does not need a separate Agent composition type or identity.

Each `AgentInstance` owns its Agent registrations and feature cleanup in a bag. Pi boot installs the accepted Agent facets from that instance in manifest order. A feature can reuse immutable module constants. Each call to `agent(ctx)` creates new mutable closures.

## Feature author model

Feature state is ordinary local state captured by callbacks:

```ts
export const feature = defineFeature({
  id: "canvas",
  settings: canvasSettings,

  workspace(ctx) {
    const repository = createCanvasRepository(ctx.documents);

    return {
      resources: createCanvasResources(repository),
      surfaces: ["./workspace/surface.tsx"],
    };
  },

  agent(ctx) {
    const checkout = createCanvasCheckout(ctx.documents);
    const buffer = new CanvasDocumentBuffer(checkout);

    return {
      tools: createCanvasTools(buffer),
      turnState: createCanvasTurnState(buffer),
      modelContext: createCanvasModelContext(buffer),
      systemPrompt: CanvasSystemPrompt,
      skills: ["./skills/canvas-authoring"],
      [Symbol.asyncDispose]: () => checkout[Symbol.asyncDispose](),
    };
  },
});
```

The tool, turn-state, model-context, and channel callbacks returned by one `agent(ctx)` call close over the same `buffer`. A second call creates a different buffer and different closures. UIX does not build or expose a generic feature-state object.

A feature can place several local values behind its own typed object. The returned Workspace or Agent contribution object may implement `Disposable` or `AsyncDisposable`. UIX adds that cleanup and the registration cleanup to the feature's bag. A contribution object that owns no resource needs no disposal method.

Workspace context contains shared Workspace capabilities. Agent context contains the configuration, logging, event publishing, and viewpoint capabilities needed by Agent features. It contains no attachment routing fields or state from another Agent instance.

Instance-bound channels arrive with the Canvas use that requires them. The Workspace needs the static channel contract for canonical routing. Each Agent instance needs a handler that closes over its local Canvas state. This distinction applies to channels only.

## Review units

### R0: Revert the first A1 implementation

Create an explicit revert of the A1 commit range. Keep the original commits in repository history and reference them in this plan. Preserve any uncommitted investigation as a local patch, not as production history.

Restore the previous feature contract, atomic feature registration, tests, and documentation. Do not keep a mechanism because it may be useful later. Add it later if a production path needs it.

**Review gate:** Production contains no feature-state builder, separate composition engine, nominal admission class, operation ledger, grouped builder contract, or unused capability view. Existing Electron behavior is unchanged. All repository checks pass.

### A1: Move feature state into Agent instances

Make one breaking migration from `context()` and `contribute()` to optional `workspace(ctx)` and `agent(ctx)` factories. Migrate the loader, runtime, first-party features, workspace template, and tests in the same unit. Keep no old author path or adapter.

The loader calls each Workspace factory once. It retains each Agent factory with its feature id and the path data required by present facets. It does not create a composition candidate, copy callback objects, or add repeated validation for loaded functions.

Move Agent registries and feature bags under `AgentInstance`. Call Agent factories in manifest order. Register each feature's returned Agent contributions as one unit. If registration fails, dispose that feature's partial work and record only its feature id and error. Do not record successful, blocked, phase, or facet results.

Pi boot reads the instance registries through the existing ordered UIX extension. Tool catalog, turn state, prompts, skills, and model context also resolve through the guarded instance instead of Workspace-global registries.

Canvas is the production stateful feature for this unit. One `agent(ctx)` call owns one Canvas buffer, anchor set, document-head map, turn-state callbacks, tool set, and model context. Shared immutable content and metadata stay in the Canvas document store. Implement Canvas-specific viewpoint state for this path. Do not add a generic checkout framework.

Route Canvas operations that use Agent state through the attachment-selected instance. Register the typed contract once at Workspace scope and bind one handler closure per Agent instance. Human writeback and prompt submission use the same accepted Agent guard. Feature payloads contain no Workspace, session, attachment, or Agent routing fields.

Use one reload policy: reject reload while any Agent turn is active. Otherwise, commit live viewpoint state, replace the Workspace feature registrations, and rebuild each live Agent feature bag under a guard. Then reload initialized Pi runtimes and restore each viewpoint. Use the existing bags and supervisor visit operation. Do not add staged generation objects or fallback to old callbacks.

This migration is one review unit because smaller units would require an adapter or fail the checks.

**Review gate:** Two session targets have separate Canvas buffers, anchors, document heads, turn state, model context, tools, handlers, registries, and lifetimes. Attachments on one session share one instance. A guarded turn on session A can overlap work on session B without sharing state or events. Disposing one instance removes only its feature callbacks. Idle reload leaves no old callbacks. Startup, prompting, models, provider authentication, transcripts, and reload remain functional. All repository checks pass.

Stop for review before A2.

### A2: Prove concurrent sessions

Complete session-scoped delivery for every event used by the reference application. Canvas presents content from the selected viewpoint, rejects stale iframe messages after a session change, and publishes changes only to attachments on the matching session.

Run a production-path lifecycle suite for shared-session attachments, different-session attachments, session changes, and a detached turn. Cover busy rejection, idle reload, final state commit, zero-guard teardown, feature disposal, and parent shutdown. Tests use the runtime constructors and feature entries used by production. Do not add another runtime or composition path for tests.

Remove the renderer restriction on session changes only after this suite passes. H6 then uses the same runtime for its first multi-connection server path.

**Review gate:** Electron and the shared client can use concurrent session viewpoints without shared mutable feature state, stale writes, event leakage, or unclear cleanup. All repository checks pass.

## Lessons from the reverted commits

R0 keeps these commits available for inspection:

| Commit | Lesson |
| --- | --- |
| `dbf687d` | Cleanup transfer matters, but feature state does not need a builder. |
| `86eb2ce` | Per-instance feature ownership is required. The plan specified too much implementation. |
| `bffb6c3` | Registries, lifetimes, and Pi installation must be per instance. Tests must use production code. |
| `0cdd7f1` | Loaded definitions and live instances have different scopes. They do not need nominal admission or deep copies. |
| `ac747e6` | Base-tool selection is separate from Agent state isolation. |
| `46b8a6c` | Too many slices caused planned rework and a long non-green interval. |
| `a633715` | A single tool path can return as a separate change when production needs it. |
| `180ab79` | Async cleanup is required. A special active-generation owner was not required. |
| `248494e` | Workspace and Agent factories are useful. State builders and separate facet factories are not. |

Preserve any uncommitted A1.3.6 work as a local patch only.

## Deferred until there is a current use

- Named Agent definitions, composition selection, roles, and Agent-to-Agent messaging.
- Multiple branches written by different Agents in one session tree.
- A generic document-checkout API beyond Canvas state.
- Per-facet retry, partial recovery, operation records, diagnostics channels, and recovery UI.
- Nominal composition values, deep callback copies, and generated capability views.
- Session-specific settings overrides.
- Multiple logical attachments in one page or physical connection.
- Git worktrees or Dolt branches.

## Unchanged by this plan

- The supervisor and guard protocol.
- Disposable and async-disposable bags.
- The host to WorkspaceRuntime to Attachment to AgentInstance to Pi lifecycle.
- Manifest order for feature and Pi installation.
- Typed channel validation at transport boundaries.
- Workspace-owned repositories and host-independent resource identity.
