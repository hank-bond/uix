---
summary: "styles.css is ordered tokens→reset→a11y→base→motion→keyframes, with the load-bearing rule that ALL motion lives inside the prefers-reduced-motion:no-preference block (scroll-driven bits further under @supports), so the static version is the base; sizes and the dock's scroll timeline are tuned via :root knobs, and named scroll/view timelines are element-scoped."
read_when: "Read before adding or changing any animation, timeline, or :root sizing/timing variable in styles.css."
status: active
---

# CSS architecture & tuning

`styles.css` is ordered: **tokens → reset → a11y utils → static base → motion → keyframes.**

The load-bearing rule: **the static/accessible version is the base default; ALL motion lives inside `@media (prefers-reduced-motion: no-preference)`** (with scroll-driven bits further nested under `@supports (animation-timeline: scroll())`). So:

- Reduced-motion users and browsers without scroll-timeline support get the static experience for free — the brand just scrolls under the bar, and the compact mark sits in the header.
- You cannot accidentally ship un-gated motion, because motion only exists in that one block. **Add new animation there, never in the base.**

## Tuning knobs (`:root`)

Sizes: `--bar-h`, `--mark-h` (full), `--mark-dock-h` (docked/header). Header mark and docked mark share `--mark-dock-h`, so they stay identical.

Motion timing (scroll progress from page top): `--morph-end` → `--l3-hold` → `--dock-start`, then the dock steps `--rise-len` / `--shrink-len` / `--slide-len` (derived into `--rise-end` / `--shrink-end` / `--dock-end`). The dock is three independent steps on **different properties** — rise=`top`, shrink=`height`, slide=`margin-top` — so they never collide with the static `translate: -50% 0` that centers the mark. The hero is `--dock-end + 30vh` of runway in motion mode.

## Named timelines are scoped

A `view-timeline-name` / `scroll-timeline-name` is only visible to the defining element, its descendants, and following siblings. To reference one across subtrees (e.g. header ↔ hero) you need `timeline-scope` on a common ancestor. (A header wipe was dropped for this reason.)
