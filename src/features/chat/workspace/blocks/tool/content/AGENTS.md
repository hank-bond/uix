---
summary: "The tool content components render each known tool's payload: canvas, command, and file tool rows, plus the default fallback."
---

# Tool content

Each component renders one tool family's row inside the shared tool block chrome. `CanvasToolContent.tsx` shows anchored canvas payload text with a show-more toggle. `CommandToolContent.tsx` renders a highlighted command and result disclosure. `FileToolContent.tsx` shows a path summary with content or result. `DefaultToolContent.tsx` is the fallback for unrecognized tools.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[CanvasToolContent.css](./CanvasToolContent.css)** Canvas tool payload and show-more toggle styles.
- **[CanvasToolContent.tsx](./CanvasToolContent.tsx)** Renders canvas tool payload text with a show-more toggle.
- **[CommandToolContent.css](./CommandToolContent.css)** Command tool disclosure styles.
- **[CommandToolContent.tsx](./CommandToolContent.tsx)** Renders command tool output: highlighted command and result disclosure.
- **[DefaultToolContent.tsx](./DefaultToolContent.tsx)** Renders the default tool block: payload text with optional args disclosure.
- **[FileToolContent.css](./FileToolContent.css)** File tool summary and disclosure styles.
- **[FileToolContent.tsx](./FileToolContent.tsx)** Renders file tool reads and writes: path summary with content or result disclosure.

<!-- INDEX:END -->
