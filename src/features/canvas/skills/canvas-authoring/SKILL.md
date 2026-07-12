---
name: canvas-authoring
description: Builds and edits UIX Canvas documents as interactive, stateful HTML shared with the human. Use whenever creating or substantially changing a canvas with canvas__anchor_write or canvas__anchor_edit.
summary: "Authoring guidance for interactive, stateful UIX Canvas HTML, including persisted DOM state and user-triggered Agent prompts."
status: active
---

# Canvas authoring

A canvas is a persisted HTML document that both the human and Agent can change. Use it when information benefits from visual structure or direct interaction rather than plain conversational text.

## State belongs in the document

UIX serializes the hydrated document after human interaction. State represented by these mechanisms survives reloads and can be reported back to the Agent as a compact diff:

- native `input`, `textarea`, `select`, checkbox, and radio controls;
- explicitly authored `contenteditable` regions;
- attributes, text, and elements changed in the DOM by document scripts.

The shim observes `input`, `change`, `click`, and `drop`. If a script changes meaningful state outside one of those events, call `window.__uixWriteback()` after updating the DOM.

Keep transient effects out of the persisted DOM. Prefer CSS animations over adding temporary elements that might be serialized during writeback.

## Let the human ask the Agent from the canvas

A user-operated element can start an Agent turn directly from the canvas:

```html
<button
  type="button"
  data-uix-prompt="Review my current selections and respond on the canvas"
>
  Ask the Agent
</button>
```

On a trusted user click, UIX serializes and persists the current canvas before sending the attribute value as the user's prompt. The normal canvas change diff accompanies the turn, so the prompt should describe the requested response rather than repeat state already represented in the document.

Use prompt actions only where the human clearly intends to start a model run. Give the button a specific visible label and a prompt that makes sense as a durable user message in the conversation transcript. Scripted `.click()` or `dispatchEvent()` calls do not trigger the supported action.

## Authoring principles

- Prefer semantic HTML and labeled controls.
- Make the current state visible to the human, not only to script variables.
- Ensure controls and layouts work at narrow pane widths.
- Respect `prefers-reduced-motion` for nonessential animation.
- Keep the document self-contained when practical so it remains portable and reliable.
- Preserve the user's current state when editing an existing canvas.
