---
summary: "User interfaces preserve equivalent visual, keyboard, and accessibility meaning while component styles retain explicit ownership and cascade order."
kind: reference
read_when: "Read before creating or changing interactive UI, accessibility behavior, component stylesheets, or surface CSS composition."
status: active
---

# User interface

## Accessible UI

**Rule.** Preserve equivalent meaning and operation across visual, keyboard, and accessibility-tree presentations. Prefer browser standards and semantic HTML; use ARIA only to fill a semantic gap.

Apply these rules in order:

1. **Use the native element.** Prefer `button`, `dialog`, `label`, `fieldset`/`legend`, headings, lists, and native state such as `disabled`. Use the browser's interaction behavior instead of rebuilding its keyboard, focus, or modal semantics.
2. **Give every control an accessible name.** Visible text is the first choice. When a visual treatment conveys extra meaning, add visually hidden DOM text. Reserve `aria-label` for controls without an adequate textual name; when it is necessary, include any visible label text in the accessible name.
3. **Use ARIA for the exact missing semantic.** Examples: `aria-expanded` for disclosure state, `aria-labelledby` for a relationship to visible text, and `aria-describedby` for supplemental instructions. Do not duplicate native semantics or use an unrelated ARIA state because it sounds close.
4. **Choose hiding deliberately.** `display: none` removes content from visual and accessibility presentation; visually hidden content remains available non-visually; `aria-hidden="true"` excludes otherwise rendered content from the accessibility tree and is only for redundant/decorative presentation.
5. **Do not rely on color alone.** Pair color with text, shape, border weight, iconography, or another perceptible cue, and expose the same meaning semantically.
6. **Preserve keyboard and focus behavior.** Every action is keyboard-operable, focus remains visibly indicated, transient UI chooses a useful initial focus, and closing it restores focus to a durable invoking control.
7. **Label and group forms natively.** Every input has an associated `label`; placeholders are hints, not labels. Related choices use `fieldset` and `legend`. Associate field help or validation details with `aria-describedby` when needed.
8. **Announce meaningful asynchronous changes.** Use `role="status"` for polite progress and completion updates. Use `role="alert"` sparingly for failures requiring immediate attention; ordinary instructions and validation hints remain normal or described text.
9. **Respect presentation preferences.** Nonessential motion honors `prefers-reduced-motion`, and text, controls, focus indicators, and state cues maintain sufficient contrast.

A visually hidden helper must clip content rather than use `display: none` or `visibility: hidden`, because those remove it from the accessibility tree. Keep the helper local until a second consumer justifies a shared UI utility.

## Component stylesheets

**Rule.** A UI component's private stylesheet lives beside it with the same basename: `SessionPill.tsx` owns `SessionPill.css`. Private subcomponents in that module share the owner's sheet. A stylesheet with no single component owner uses a narrow lowercase-kebab name such as `picker-positioning.css` or `provider-controls.css`; do not let shared sheets become miscellaneous overrides.

CSS class names remain lowercase kebab/BEM regardless of file ownership. Component-owned selectors carry their component domain (`.session-picker__option`); shared selectors carry the feature or shared visual role (`.chat-button`). Filename casing communicates ownership, not a different CSS scoping mechanism.

Surface CSS module scripts remain explicitly imported and ordered in the owning `surface.tsx` `styles` array rather than hidden behind CSS `@import` or component import side effects. That array is the cascade composition: shared foundations precede component sheets, and the substrate independently wraps every adopted sheet in the same surface `@scope`. Name-global `@font-face`, `@keyframes`, and `@property` declarations remain document-global after that wrapping and retain their feature-prefixed names.
