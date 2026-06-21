---
summary: "Reduced motion is a first-class path, not a fallback: a visually-hidden h1, aria-hidden decorative SVGs and mock panes (the theme switch stays operable), and under prefers-reduced-motion only opacity fades are acceptable — never translate/scale/parallax."
status: active
---

# Accessibility stance

- Reduced motion is a **first-class path**, not a fallback afterthought.
- There's a visually-hidden `<h1>`; decorative SVGs are `aria-hidden`; the mock's chat/canvas are decorative (`aria-hidden`) while the theme switcher stays operable.
- Honour `prefers-reduced-motion` for anything new. Opacity fades are acceptable there; translate/scale/parallax are not.
