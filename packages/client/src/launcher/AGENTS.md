---
summary: "The shared launcher renders host-known workspaces and optional creation through an opaque capability adapter."
---

# Launcher client

The launcher knows workspace ids only as opaque action keys. Concrete hosts map their catalog projection, navigation, native dialogs, and errors into `LauncherAdapter`. The client owns loading, busy, cancellation, and error presentation. A host may omit creation while still providing listing and opening.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[adapter.ts](./adapter.ts)** Host-neutral capabilities consumed by the launcher client.
- **[launcher.css](./launcher.css)** Launcher chrome mirroring the workspace theme tokens.
- **[Launcher.tsx](./Launcher.tsx)** Renders the shared pre-workspace launcher over host-provided catalog capabilities.

<!-- INDEX:END -->
