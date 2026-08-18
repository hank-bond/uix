---
summary: "Finish cancellable operation ownership after the basic web vertical: prepared dispatch, provider authentication, model refresh, single-flight boots, external calls, and bounded shutdown."
---

# Runtime operation hardening

## Status

The active-turn vertical landed in `773918f`, `385edaf`, and `370003e`. It provides lexical tracked operations, targeted Pi abort, shutdown quiescence, discrete activity events, Chat Stop/Escape controls, and late-attachment activity recovery.

The remaining work moved out of the host split so a basic loopback web host can land first. Resume it after the selected-view Canvas path in [agent feature instances and viewpoint state](./agent-feature-instances-and-viewpoint-state.md), when the final operation boundaries exist.

## Invariant

Keep cancellation orthogonal to guarded authority. A potentially unbounded operation owns three parts:

- A guard keeping dependencies valid.
- An owner-controlled cancellation signal.
- A completion boundary proving it no longer uses those dependencies.

Parent disposal stops admission and requests cancellation before waiting for guards. A timeout that only stops awaiting work is not cancellation. Non-cooperative integrations need an explicit force-stop, isolation, deadline, or bounded-detachment policy.

## Review units

### O1: Prepared dispatch

Give each accepted dispatch owned cancellation and completion beside its operation guard. Workspace or host shutdown cancels accepted dispatches before supervisor drain. Retarget and ordinary attachment closure leave accepted work alive.

**Review gate:** A deterministic hanging handler observes cancellation, reaches its safe boundary, releases its guard, and lets workspace disposal finish.

### O2: Provider authentication and model refresh

Track provider-auth background runs instead of launching them with `void`. Cancellation aborts pending prompts and provider work, suppresses late presentation updates, and applies a bounded policy to runtime loading, login, and post-login refresh.

Propagate cancellation or deadlines into model refresh and provider network operations where supported.

**Review gate:** Hanging auth and refresh fakes quiesce without late state mutation or events.

### O3: Single-flight boots and external calls

Apply owner cancellation to workspace, Agent-instance, Pi-runtime, and shared control-service creation. Inventory model, network, process, host-capability, and other external calls. Each unbounded call receives cooperative cancellation, force-stop, deadline, or documented bounded behavior.

**Review gate:** Parent shutdown never passively waits forever on in-flight child creation or external work.

### O4: Shutdown conformance

Run the deterministic never-settling suite across dispatch, turns, authentication, refresh, and each boot layer. Assert cancellation reaches the lowest controllable boundary. Completion unregisters every operation and releases every guard.

**Review gate:** Workspace and host disposal cancel first, reach quiescence, account for every guard, and complete without late events or mutation.

## Deferred

A public feature-author channel cancellation signal remains separate. Internal substrate handlers can receive operation context first. Add an author contract only after a real feature operation requires it.
