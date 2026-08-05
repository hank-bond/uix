---
summary: "Reduced motion is a primary path with semantic structure, hidden decorative content, operable controls, and no translation, scaling, or parallax."
kind: reference
---

# Accessibility stance

- Reduced motion is a primary path, not a fallback.
- A visually hidden `<h1>` preserves page structure.
- Decorative SVGs, Chat, and Canvas mock panes use `aria-hidden`; the theme switch remains operable.
- Honor `prefers-reduced-motion` for every animation. Opacity fades are acceptable, but translation, scaling, and parallax are not.
