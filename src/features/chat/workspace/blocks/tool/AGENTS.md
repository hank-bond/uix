---
summary: "The tool block subtree derives per-tool chat presentations and renders them through tool-specific content components."
---

# Tool blocks

`presentation.ts` derives the shared tool facts: state, display name, and payload text. `presentations.tsx` maps known tool names to label and content policies. The `content/` subtree holds the per-tool content components, and `tool-content.css` the shared tool block chrome.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[content/](./content/AGENTS.md)** The tool content components render each known tool's payload: canvas, command, and file tool rows, plus the default fallback.

### Source files

- **[presentation.ts](./presentation.ts)** Derives tool block state, display names, and payload text for chat tool rendering.
- **[presentations.tsx](./presentations.tsx)** Derives per-tool chat block presentations: labels and content for known tool names.
- **[tool-content.css](./tool-content.css)** Shared tool block chrome: payload, details, and disclosure.

<!-- INDEX:END -->
