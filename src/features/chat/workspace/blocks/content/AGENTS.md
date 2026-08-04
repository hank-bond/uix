---
summary: "The block content subtree renders markdown, highlighted source text, and plain code blocks."
status: active
---

# Block content

`MarkdownContent.tsx` renders markdown through react-markdown with gfm support, mapping code to the highlighting pipeline. `HighlightedCode.tsx` renders source text with refractor syntax colors inside the plain `CodeBlock.tsx` container. `text.ts` provides the shared text extraction and truncation helpers.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[CodeBlock.css](./CodeBlock.css)** Plain code block container styles.
- **[CodeBlock.tsx](./CodeBlock.tsx)** Renders the plain code block container for highlighted output.
- **[HighlightedCode.css](./HighlightedCode.css)** Syntax token colors for highlighted code.
- **[HighlightedCode.tsx](./HighlightedCode.tsx)** Renders source text with refractor syntax highlighting.
- **[MarkdownContent.css](./MarkdownContent.css)** Markdown-rendered chat content styles.
- **[MarkdownContent.tsx](./MarkdownContent.tsx)** Renders markdown text with gfm tables and safe external-link handling.
- **[text.ts](./text.ts)** Extracts and truncates text from transcript content values for display.

<!-- INDEX:END -->
