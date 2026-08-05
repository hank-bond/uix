---
summary: "The chat workspace renders the agent transcript, composer, and status bar over the agent channels, with model and provider controls."
---

# Chat workspace

The chat workspace is one surface: `surface.tsx` declares it over the agent channels. `Chat.tsx` renders the transcript, composer, and status bar, while `agent-controls.ts` owns the model picker and provider-auth state behind those controls. The feature's settings scope lives in `shared/settings.ts`.

Transcript items render through the block tree in `blocks/`: `ChatBlock.tsx` dispatches by item kind to message, tool, custom, and error blocks, all framed by `ChatBlockFrame.tsx`. Content helpers render markdown and highlighted source text, and the tool subtree derives a per-tool presentation and renders it through tool-specific content components.

The status bar composes the session and model pills. The model pill opens the model picker over the registered model actions. The provider login modal and auth flow panel drive provider sign-in through the agent controls.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[blocks/](./blocks/AGENTS.md)** The chat block tree renders transcript items by kind inside one shared frame, with content and tool subtrees.

### Source files

- **[agent-controls.ts](./agent-controls.ts)** Owns chat agent state: model picker, provider auth flow, and status over the agent channels.
- **[Chat.css](./Chat.css)** Chat surface layout: transcript scroll, composer, and status bar.
- **[Chat.tsx](./Chat.tsx)** Renders the chat surface: transcript blocks, composer, status bar, and provider login.
- **[css.d.ts](./css.d.ts)** The CSS module import shape for TypeScript.
- **[model-actions.ts](./model-actions.ts)** Defines the chat feature's model picker actions: favorites and all models.
- **[model-filter.ts](./model-filter.ts)** Picker filtering, extracted pure so it's testable without a DOM.
- **[ModelPill.css](./ModelPill.css)** Model pill and model picker styles.
- **[ModelPill.tsx](./ModelPill.tsx)** Renders the model status pill and model picker dialog over the agent controls.
- **[pending.ts](./pending.ts)** Optimistic pending user rows: the renderer-local half of eventual
- **[picker-positioning.css](./picker-positioning.css)** Picker positioning: trigger-left alignment, then shift and shrink within the surface.
- **[provider-auth-presentation.ts](./provider-auth-presentation.ts)** Derives the provider rows for the login modal, grouping OpenAI methods.
- **[provider-controls.css](./provider-controls.css)** Provider auth controls and chat button styles.
- **[ProviderAuthFlowPanel.css](./ProviderAuthFlowPanel.css)** Provider auth flow panel styles.
- **[ProviderAuthFlowPanel.tsx](./ProviderAuthFlowPanel.tsx)** Renders one provider auth flow: notices, prompts, links, and retry or success actions.
- **[ProviderLoginModal.css](./ProviderLoginModal.css)** Provider login modal styles.
- **[ProviderLoginModal.tsx](./ProviderLoginModal.tsx)** Renders the provider login modal: provider rows and auth method selection.
- **[SessionPill.css](./SessionPill.css)** Session pill and session picker styles.
- **[SessionPill.tsx](./SessionPill.tsx)** Renders the session status pill and session picker for switching and renaming conversations.
- **[surface.tsx](./surface.tsx)** the chat surface contribution over the agent channels.

<!-- INDEX:END -->
