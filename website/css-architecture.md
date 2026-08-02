---
summary: "styles.css is ordered tokens→reset→a11y→base→motion→keyframes, with the load-bearing rule that ALL motion lives inside the prefers-reduced-motion:no-preference block (scroll-driven bits further under @supports), so the static version is the base; sizes and the dock's scroll timeline are tuned via :root knobs, and named scroll/view timelines are element-scoped."
kind: reference
read_when: "Read before adding or changing any animation, timeline, or :root sizing or timing variable in styles.css."
status: active
---

# CSS architecture and tuning

`styles.css` is ordered: **tokens → reset → a11y utils → static base → motion → keyframes.**

The load-bearing rule: **the static/accessible version is the base default; ALL motion lives inside `@media (prefers-reduced-motion: no-preference)`** (with scroll-driven bits further nested under `@supports (animation-timeline: scroll())`). So:

- Reduced-motion users and browsers without scroll-timeline support receive the static experience. The brand scrolls under the bar, while the compact mark stays in the header.
- You cannot accidentally ship un-gated motion, because motion only exists in that one block. **Add new animation there, never in the base.**

## Tuning knobs

Sizes: `--bar-h`, `--mark-h` (full), `--mark-dock-h` (docked/header). Header mark and docked mark share `--mark-dock-h`, so they stay identical.

Scroll timing begins with `--morph-end`, `--l3-hold`, and `--dock-start`. Dock timing then uses `--rise-len`, `--shrink-len`, and `--slide-len`.

Those lengths derive `--rise-end`, `--shrink-end`, and `--dock-end`. The three dock steps change separate properties: rise changes `top`, shrink changes `height`, and slide changes `margin-top`.

The steps do not conflict with the static `translate: -50% 0` centering rule. In motion mode, `--dock-tail` adds runway after `--dock-end`.

## Named timelines are scoped

A `view-timeline-name` or `scroll-timeline-name` is visible only to its defining element, descendants, and following siblings. Cross-subtree references require `timeline-scope` on a common ancestor. This limitation caused removal of an earlier header wipe.
