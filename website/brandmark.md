---
summary: "The hero brandmark is one inline SVG built from persistent named parts (U / stem / x / center) that morph by interpolating their transforms — never pixel grids — on a shared keyframe timeline, and stays crisp only on whole-pixel transforms."
status: active
---

# The brandmark

The centerpiece of the page: one inline SVG in `index.html`, `viewBox="0 0 9 5"`, built from **persistent parts** so it can morph rather than crossfade.

- `.brand__u` — the U. The fixed anchor; never moves.
- `.brand__stem` — the I. Collapses (`scaleY`) into a dot and slides left.
- `.brand__x` — the X. Translates left; its left column hides _inside_ the U.
- `.brand__center` — wraps all three; counter-shifts in whole px so the compacting mark stays visually centered.

You interpolate **transforms of these parts**, never pixel grids. Keyframe percentages can't be CSS variables, so the morph timing lives literally in the `@keyframes` (`morph-stem` / `morph-x` / `morph-center` share one timeline — keep their stops aligned or they desync). Pixel-art stays crisp only on **whole-pixel** transforms; half-pixels blur.

The favicon `uix-logo-white.svg` is a separate file from this inlined, morphing version.
