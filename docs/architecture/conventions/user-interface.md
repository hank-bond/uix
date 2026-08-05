---
summary: "User interfaces preserve equivalent visual, keyboard, and accessibility meaning while component styles retain explicit ownership and cascade order."
kind: reference
read_when: "Read before creating or changing interactive UI, accessibility behavior, component stylesheets, or surface CSS composition."
---

# User interface

## Accessible UI

**Rule:** Preserve equivalent meaning and operation across visual, keyboard, and accessibility-tree presentations. Prefer browser standards and semantic HTML. Use ARIA only to fill a semantic gap.

Apply these rules in order:

1. **Use the native element:** Prefer `button`, `dialog`, `label`, `fieldset`/`legend`, headings, lists, and native state such as `disabled`. Use the browser's interaction behavior instead of rebuilding its keyboard, focus, or modal semantics.
2. **Give every control an accessible name:** Visible text is the first choice. When a visual treatment conveys extra meaning, add visually hidden DOM text. Reserve `aria-label` for controls without an adequate textual name. When it is necessary, include any visible label text in the accessible name.
3. **Use ARIA for the exact missing semantic:** Examples: `aria-expanded` for disclosure state, `aria-labelledby` for a relationship to visible text, and `aria-describedby` for supplemental instructions. Do not duplicate native semantics or use an unrelated ARIA state because it sounds close.
4. **Choose hiding deliberately:** `display: none` removes visual and accessibility presentation. Visually hidden content remains available non-visually. Use `aria-hidden="true"` only for redundant or decorative content.
5. **Do not rely on color alone:** Pair color with text, shape, border weight, iconography, or another perceptible cue, and expose the same meaning semantically.
6. **Preserve keyboard and focus behavior:** Every action is keyboard-operable, and focus remains visible. Transient UI selects useful initial focus and restores the invoking control on close.
7. **Label and group forms natively:** Every input has an associated `label`. Placeholders are hints, not labels. Related choices use `fieldset` and `legend`. Associate field help or validation details with `aria-describedby` when needed.
8. **Announce meaningful asynchronous changes:** Use `role="status"` for polite progress and completion updates. Use `role="alert"` sparingly for failures requiring immediate attention. Ordinary instructions and validation hints remain normal or described text.
9. **Respect presentation preferences:** Nonessential motion honors `prefers-reduced-motion`, and text, controls, focus indicators, and state cues maintain sufficient contrast.

A visually hidden helper must clip content rather than use `display: none` or `visibility: hidden`, because those remove it from the accessibility tree. Keep the helper local until a second consumer justifies a shared UI utility.

## Component stylesheets

**Rule:** A UI component's private stylesheet lives beside it with the same basename: `SessionPill.tsx` owns `SessionPill.css`. Private subcomponents in that module share the owner's sheet. A stylesheet with no single component owner uses a narrow lowercase-kebab name such as `picker-positioning.css` or `provider-controls.css`. Do not let shared sheets become miscellaneous overrides.

CSS class names remain lowercase kebab or Block Element Modifier (BEM) names regardless of file ownership. Component-owned selectors carry their component domain, such as `.session-picker__option`. Shared selectors carry the feature or visual role, such as `.chat-button`. Filename casing communicates ownership, not a different CSS scope.

Import and order CSS module scripts explicitly in the owning `surface.tsx` `styles` array. Do not hide them behind CSS imports or component side effects.

The array defines cascade composition, with shared foundations before component sheets. The substrate wraps every adopted sheet in the same surface `@scope`.

Name-global `@font-face`, `@keyframes`, and `@property` declarations remain document-global. Keep their feature-prefixed names.
