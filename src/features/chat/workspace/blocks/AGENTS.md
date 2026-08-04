---
summary: "The chat block tree renders transcript items by kind inside one shared frame, with content and tool subtrees."
status: active
---

# Chat blocks

One transcript item renders as one block: `ChatBlock.tsx` dispatches by item kind to the message, tool, custom, and error variants. Every variant composes its content inside the shared `ChatBlockFrame.tsx` chrome (label, running track, and body).

The `content/` subtree renders block bodies: markdown, highlighted source, and plain code. The `tool/` subtree derives a presentation per tool name and renders it through tool-specific content components.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[content/](./content/AGENTS.md)** _(active)._ The block content subtree renders markdown, highlighted source text, and plain code blocks.
- **[tool/](./tool/AGENTS.md)** _(active)._ The tool block subtree derives per-tool chat presentations and renders them through tool-specific content components.

### Source files

- **[ChatBlock.tsx](./ChatBlock.tsx)** Renders one transcript item as its kind-specific chat block.
- **[ChatBlockFrame.css](./ChatBlockFrame.css)** Chat block frame chrome: message label, running track, and body.
- **[ChatBlockFrame.tsx](./ChatBlockFrame.tsx)** Renders the shared chat block chrome: label, running track, and body frame.
- **[CustomMessageChatBlock.tsx](./CustomMessageChatBlock.tsx)** Renders a custom chat block from its content or details text.
- **[ErrorChatBlock.tsx](./ErrorChatBlock.tsx)** Renders an error chat block with the failure message.
- **[MessageChatBlock.css](./MessageChatBlock.css)** User and assistant message block variants.
- **[MessageChatBlock.tsx](./MessageChatBlock.tsx)** Renders a user or assistant message block with markdown content.
- **[ToolChatBlock.tsx](./ToolChatBlock.tsx)** Renders a tool chat block from its tool-state presentation.

<!-- INDEX:END -->
