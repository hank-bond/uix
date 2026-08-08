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
- **[CanvasToolContent.tsx](./CanvasToolContent.tsx)** Renders canvas tool expanded content: anchored payload preview with a show-more toggle.
- **[CommandToolContent.css](./CommandToolContent.css)** Command tool expanded-detail layout.
- **[CommandToolContent.tsx](./CommandToolContent.tsx)** Renders command tool expanded content: highlighted command and result disclosure.
- **[DefaultToolContent.tsx](./DefaultToolContent.tsx)** Renders the default tool expanded content: payload text with optional args disclosure.
- **[FileToolContent.css](./FileToolContent.css)** File tool expanded-detail layout.
- **[FileToolContent.tsx](./FileToolContent.tsx)** Renders file tool expanded content: written content or read result disclosure.
- **[StructuredCommand.tsx](./StructuredCommand.tsx)** Adds visual structure to conservative top-level shell operators without changing their source text.
- **[ToolBlockSettings.css](./ToolBlockSettings.css)** Tool block settings popover and trigger styles.
- **[ToolBlockSettings.tsx](./ToolBlockSettings.tsx)** Opens per-tool block presentation settings from a hover-revealed row action.
- **[ToolCallDisclosure.tsx](./ToolCallDisclosure.tsx)** Renders the shared clickable summary and expanded-detail frame for tool calls.

<!-- INDEX:END -->
