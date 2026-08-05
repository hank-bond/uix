---
summary: "The inline SVG brandmark morphs persistent named parts on one timeline and stays crisp through whole-pixel transforms."
kind: reference
---

# The brandmark

The centerpiece of the page: one inline SVG in `index.html`, `viewBox="0 0 9 5"`, built from **persistent parts** so it can morph rather than crossfade.

- **`.brand__u`:** The fixed U anchor. It never moves.
- **`.brand__stem`:** The I. It collapses through `scaleY` into a dot and slides left.
- **`.brand__x`:** The X. It translates left while its left column hides inside the U.
- **`.brand__center`:** The wrapper for all three parts. It counter-shifts by whole pixels so the compacting mark stays visually centered.

Interpolate transforms of these parts, never pixel grids. Keyframe percentages cannot be CSS variables, so morph timing lives directly in `@keyframes`.

`morph-stem`, `morph-x`, and `morph-center` share one timeline. Keep their stops aligned. Pixel art remains crisp only on whole-pixel transforms; half-pixels blur.

The favicon `uix-logo-white.svg` is a separate file from this inlined, morphing version.
