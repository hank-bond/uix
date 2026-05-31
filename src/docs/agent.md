# Agent integration

> **Stub.** Populated when agent tool contribution from extensions lands
> (milestone 5 in [`AGENTS.md`](../../AGENTS.md#near-term-milestones)).

Will cover:

- How UIX owns the pi `AgentSession`.
- How extensions contribute pi tools to that session.
- How channel `turn` events trigger agent turns.
- How channel `silent` events update context/state without a turn.
- Session lifetime, replacement (fork/new/clone), and rebinding.

See [`channels.md`](./channels.md), [`extensions.md`](./extensions.md).
