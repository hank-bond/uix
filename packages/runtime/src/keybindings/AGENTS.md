---
summary: "Main-process keybindings assemble renderer defaults with persisted workspace overrides and publish the resulting bindings."
---

# Keybindings

The application composition root binds keybinding request handling to the `keybindings` workspace settings namespace and the substrate event publisher. The renderer contributes the current action defaults. Persisted entries, including explicit `null` disables, take precedence.

Normalize every candidate before it enters workspace settings, and publish only the value confirmed by that durable settings path. This keeps renderer defaults rebuildable while user overrides remain authoritative across reloads.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[requests.ts](./requests.ts)** Assembles renderer action defaults with persisted overrides, normalizes shortcuts, and publishes changed keybindings.
- **[settings.ts](./settings.ts)** Defines the workspace settings group that persists user keybinding overrides.

<!-- INDEX:END -->
