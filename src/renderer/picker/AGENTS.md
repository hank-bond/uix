---
summary: "The start picker page lists recent workspaces and creates new ones before any workspace window opens."
---

# Start picker

The picker is the app's pre-workspace page: it reads recents and drives create-new over the picker channels until main tears the window down. `main.tsx` boots the page, and `Picker.tsx` renders the recents-plus-create-new flow over the preload transport.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[main.tsx](./main.tsx)** Boots the start picker page that selects a workspace over the preload transport.
- **[picker.css](./picker.css)** Start picker chrome mirroring the workspace theme tokens.
- **[Picker.tsx](./Picker.tsx)** Renders the start-picker UI: recent workspaces and create-new, acting over the picker channels.

<!-- INDEX:END -->
