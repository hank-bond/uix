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
- **[presentations.tsx](./presentations.tsx)** Dispatches per-tool expanded content and derives the generic collapsed summary.
- **[tool-catalog.tsx](./tool-catalog.tsx)** Provides the workspace tool label catalog to transcript renderers.
- **[tool-content.css](./tool-content.css)** Shared tool block chrome: summary rows, expanded details, and payloads.

<!-- INDEX:END -->
