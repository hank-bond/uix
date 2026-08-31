---
summary: "The chat block tree renders each transcript item through one shared block structure with kind-specific body content."
---

# Chat blocks

One transcript item renders as one block: `ChatBlock.tsx` owns the root structure, state and accessibility metadata, status feedback, and body placement. It selects a message, tool, custom-message, or error body component from the item's kind.

The `content/` subtree renders reusable body material: markdown, highlighted source, and plain code. The `tool/` subtree derives a presentation per tool name and renders it through tool-specific content components.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[content/](./content/AGENTS.md)** The block content subtree renders markdown, highlighted source text, and plain code blocks.
- **[tool/](./tool/AGENTS.md)** The tool block subtree derives per-tool chat presentations and renders them through tool-specific content components.

### Source files

- **[BlockPresentationSettings.tsx](./BlockPresentationSettings.tsx)** Provides the chat feature's durable block-presentation preferences to transcript renderers.
- **[BlockStatusRow.css](./BlockStatusRow.css)** Compact status-row styles shared by tool calls and agent failures.
- **[ChatBlock.css](./ChatBlock.css)** Shared chat block structure: message label, running track, and body.
- **[ChatBlock.tsx](./ChatBlock.tsx)** Renders one transcript item with shared block structure and kind-specific body content.
- **[CustomMessageChatBlockBody.tsx](./CustomMessageChatBlockBody.tsx)** Renders a custom-message chat block body from its content or details text.
- **[ErrorChatBlock.css](./ErrorChatBlock.css)** Non-interactive agent failure row using the shared compact status styles.
- **[ErrorChatBlockBody.tsx](./ErrorChatBlockBody.tsx)** Renders an agent-error chat block body as a compact status row.
- **[MessageChatBlock.css](./MessageChatBlock.css)** User and assistant message block variants.
- **[MessageChatBlockBody.tsx](./MessageChatBlockBody.tsx)** Renders a user or assistant chat block body as Markdown.
- **[ToolChatBlockBody.tsx](./ToolChatBlockBody.tsx)** Renders a tool chat block body from its tool-state presentation.

<!-- INDEX:END -->
