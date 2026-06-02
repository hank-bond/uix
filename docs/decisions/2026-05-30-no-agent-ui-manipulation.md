---
summary: "The agent mutates artifacts through ordinary file-edit tools, not bespoke UI or RPC tools; channels carry validated events, not an agent-side UI API. Read before giving the agent any UI-manipulation capability."
status: accepted
---

# No agent-driven UI manipulation

Rejected paths kept on record:

- **"Agent generates JSX" for reports.** Rejected for structured blocks in files — markdown + fenced custom blocks, parsed and rendered by an extension. The agent uses existing file-edit tools, not bespoke UI tools.
- **"Custom RPC tool surface for the agent to manipulate the UI."** Same rejection. Channels carry validated events; agent-side, file edits remain the canonical way to mutate persistent artifacts.
- **"Report as the conversation, structured."** Rejected for _conversation pane is the conversation; reports are artifacts_ — two panes, not a merged one.

The thread is one principle: the agent's persistent output is **files**, and the UI is a renderer/editor over those files — not a thing the agent pokes directly.
