# UIX substrate documentation

User-facing documentation for the UIX substrate. Audience: someone (human
or agent) building on UIX — writing an extension, contributing a pane,
defining a channel, integrating with the pi agent session.

If a doc here is wrong, either the doc or the code it describes is broken.
Update them together.

For the vision, see [`../../AGENTS.md`](../../AGENTS.md).
For decisions and rationale, see [`../../DECISIONS.md`](../../DECISIONS.md).
For dev-facing architecture state, see
[`../../docs/architecture.md`](../../docs/architecture.md).

## Contents

- [extensions.md](./extensions.md) — extension lifecycle, manifest, activation
  context, contributions.
- [panes.md](./panes.md) — React panes, iframe panes, declarative
  contributions; slot model.
- [channels.md](./channels.md) — typed event channels; local / silent / turn
  modes; TypeBox schemas.
- [agent.md](./agent.md) — contributing pi tools, agent session ownership,
  triggering turns from channels.
- [contributions.md](./contributions.md) — the full list of contribution
  points and their shapes.
- [lifetimes.md](./lifetimes.md) — disposable bags, registration patterns,
  hot-reload semantics.

All of these are stubs right now; they get populated as the corresponding
substrate primitives land. Tracked in `../../docs/architecture.md` under
"Next."
