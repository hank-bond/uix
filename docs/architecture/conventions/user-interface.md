---
summary: "User interfaces preserve equivalent visual, keyboard, and accessibility meaning while component styles retain explicit ownership and cascade order."
kind: reference
read_when: "Read before creating or changing interactive UI, accessibility behavior, component stylesheets, or surface CSS composition."
---

# User interface

The [user-interface.a11y-equivalence](./rules/user-interface.a11y-equivalence.md) and [user-interface.component-styles](./rules/user-interface.component-styles.md) rules state the invariants. This file walks the application steps.

## Accessible UI

Apply these steps in order:

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

CSS class names remain lowercase kebab or BEM names regardless of file ownership. Component-owned selectors name their component domain, such as `.session-picker__option`. Shared selectors name the feature or visual role, such as `.chat-button`. Filename casing communicates ownership, not a different CSS scope.

Name-global `@font-face`, `@keyframes`, and `@property` declarations remain document-global. Keep their feature-prefixed names.
