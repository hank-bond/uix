---
summary: "Why UIX exists and its shape: it adds pilot capabilities for the human, not agent capabilities, and is a reusable substrate rather than a single app. Read for the framing test behind feature decisions."
status: accepted
---

# UIX is a pilot substrate, not an agent app

> "I am basically just creating a UI to hook [pi] into like a human in a Gundam. Normally the harness is tools you give to the agent, but I mostly want **tools you give to the human to work with the agent**."

This frame is the single most important design constraint. UIX adds **pilot capabilities**: displays the human sees, controls the human's hands operate, and memory aids so the human doesn't have to hold everything in their head. Every feature passes the test: _does this help the pilot see, decide, or act?_ If it's "make the agent smarter," it belongs in pi, not UIX.

## Substrate, not app

Early framing treated UIX as a single coding-agent IDE (conversation pane, tree pane, structured reports, reflection queue, side-quest gesture). All still wanted — but as _applications built on UIX_. The split happened when a second app surfaced (a knowledge-base/wiki manager) sharing nearly all the same primitives — panes, channels, file watchers, agent session, lifetime-scoped extensions — with none of the same UI.

The motivating problems still drive substrate decisions because they're _why_ the substrate has to support these shapes:

1. **TUI agents force linear, scroll-heavy interaction** → panes need inline interactive content anchored to document position (channels, iframe panes).
2. **Agent-generated code is unreviewable at volume** → extensions render structured artifacts (diffs, call-paths) richly, separate from chat (pane host, slot registry, file-watching).
3. **Side-quest workflows are clunky** → the cockpit owns the agent session and exposes tree navigation as a first-class capability (turn/silent/local channel modes).
4. **No queue for "fix this later," no cross-session memory aid** → cross-session enumeration and on-disk state are first-class (file watcher, on-disk state).

These same shapes serve the wiki app, a design-system deliverables app, and the not-yet-imagined ones. That's the test the substrate keeps having to pass.

## Design principles (carry into code)

- Define small primitives, not big components. Compose.
- One or two exports per module. Resist barrel files and god-objects.
- Schemas are sources of truth. Don't hand-write parallel TS types.
- Functions over classes.
- Events over polling. Pi gives events; files have watchers; state emits.
- Append-only where possible (reports, sessions, custom entries).
- Lifetime bags enforce pairing by construction; registration without a bag is a bug. See [architecture/conventions](../architecture/conventions.md).
