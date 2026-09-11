---
summary: "The tool content components render each known tool's payload: canvas, shell, and file tool rows, plus the default fallback."
---

# Tool content

Each component renders one tool family's row inside the shared tool block structure. `CanvasToolContent.tsx` shows anchored canvas payload text with a show-more toggle. `ShellToolContent.tsx` renders a highlighted command and result disclosure. `FileToolContent.tsx` shows read/write/edit content or results, soft-wrapping prose files. `DefaultToolContent.tsx` is the fallback for unrecognized tools.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[CanvasToolContent.css](./CanvasToolContent.css)** Canvas tool payload and show-more toggle styles.
- **[CanvasToolContent.tsx](./CanvasToolContent.tsx)** Renders canvas tool expanded content: anchored payload preview with a show-more toggle.
- **[DefaultToolContent.tsx](./DefaultToolContent.tsx)** Renders the default tool expanded content: payload text with optional args disclosure.
- **[FileToolContent.css](./FileToolContent.css)** File tool expanded-detail layout.
- **[FileToolContent.tsx](./FileToolContent.tsx)** Renders file tool content and results with syntax highlighting and soft wrapping for prose files.
- **[ShellToolContent.css](./ShellToolContent.css)** Shell tool expanded-detail layout.
- **[ShellToolContent.tsx](./ShellToolContent.tsx)** Renders shell tool expanded content: highlighted command and result disclosure.
- **[StructuredCommand.tsx](./StructuredCommand.tsx)** Adds visual structure to conservative top-level shell operators without changing their source text.
- **[ToolBlockSettings.css](./ToolBlockSettings.css)** Tool block settings popover and trigger styles.
- **[ToolBlockSettings.tsx](./ToolBlockSettings.tsx)** Opens per-tool block presentation settings from a hover-revealed row action.
- **[ToolCallDisclosure.tsx](./ToolCallDisclosure.tsx)** Renders the shared clickable summary and expanded-detail container for tool calls.

<!-- INDEX:END -->
