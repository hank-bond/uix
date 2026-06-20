# UIX marketing site

The public landing page for UIX, served at **uix.sh** via GitHub Pages. It is a
**zero-build static site** — plain HTML/CSS/JS, no framework, no bundler. Edit the
files; that's the whole pipeline.

## Files

| File | Role |
| --- | --- |
| `index.html` | Markup. One page: sticky bar, hero (the brandmark), mock cockpit. |
| `styles.css` | All styling + the scroll-driven animation. Sectioned; read its header comment. |
| `mock.js` | Two small jobs: theme toggle on the mock, and a slower click-scroll for the arrow. No other JS, and **nothing touches the user's own scroll** (no scroll-jacking) — keep it that way. |
| `logo-l3.svg` | Favicon (the abstract mark). The brandmark on the page is inlined in `index.html`. |
| `CNAME` | `uix.sh` for Pages. |

Deploy: `../.github/workflows/pages.yml` publishes `website/` to Pages on push to
the `website` branch. (This `AGENTS.md` ships with it — harmless; the repo is public.)

## The brandmark (the centerpiece)

One inline SVG, `viewBox="0 0 9 5"`, built from **persistent parts** so it can morph
rather than crossfade:

- `.brand__u` — the U. The fixed anchor; never moves.
- `.brand__stem` — the I. Collapses (`scaleY`) into a dot and slides left.
- `.brand__x` — the X. Translates left; its left column hides *inside* the U.
- `.brand__center` — wraps all three; counter-shifts in whole px so the compacting
  mark stays visually centered.

You interpolate **transforms of these parts**, never pixel grids. Keyframe
percentages can't be CSS variables, so the morph timing lives literally in the
`@keyframes` (`morph-stem`/`morph-x`/`morph-center` share one timeline — keep their
stops aligned or they desync). Pixel-art stays crisp only on **whole-pixel**
transforms; half-pixels blur.

## CSS architecture — read this before editing

`styles.css` is ordered: **tokens → reset → a11y utils → static base → motion → keyframes.**

The load-bearing rule: **the static/accessible version is the base default; ALL
motion lives inside `@media (prefers-reduced-motion: no-preference)`** (with
scroll-driven bits further nested under `@supports (animation-timeline: scroll())`).
So:

- Reduced-motion users and browsers without scroll-timeline support get the static
  experience for free — the brand just scrolls under the bar, and the compact mark
  sits in the header.
- You cannot accidentally ship un-gated motion, because motion only exists in that
  one block. **Add new animation there, never in the base.**

## Tuning knobs (`:root`)

Sizes: `--bar-h`, `--mark-h` (full), `--mark-dock-h` (docked/header). Header mark and
docked mark share `--mark-dock-h`, so they stay identical.

Motion timing (scroll progress from page top): `--morph-end` → `--l3-hold` →
`--dock-start`, then the dock steps `--rise-len` / `--shrink-len` / `--slide-len`
(derived into `--rise-end`/`--shrink-end`/`--dock-end`). The dock is three
independent steps on **different properties** — rise=`top`, shrink=`height`,
slide=`margin-top` — so they never collide with the static `translate: -50% 0`
that centers the mark. The hero is `--dock-end + 30vh` of runway in motion mode.

## Accessibility stance

- Reduced motion is a **first-class path**, not a fallback afterthought.
- There's a visually-hidden `<h1>`; decorative SVGs are `aria-hidden`; the mock's
  chat/canvas are decorative (`aria-hidden`) while the theme switcher stays operable.
- Honour `prefers-reduced-motion` for anything new. Opacity fades are acceptable
  there; translate/scale/parallax are not.

## Preview & gotchas

- Preview: open `index.html` (scroll-driven animation works over `file://`).
- Test reduced motion: DevTools → Rendering → "Emulate prefers-reduced-motion: reduce".
- **Named timelines are scoped.** A `view-timeline-name`/`scroll-timeline-name` is
  only visible to the defining element, its descendants, and following siblings. To
  reference one across subtrees (e.g. header ↔ hero) you need `timeline-scope` on a
  common ancestor. (A header wipe was dropped for this reason.)
- **Commits:** a repo pre-commit hook runs prettier from `./node_modules`, which
  doesn't exist in this worktree — commits here need `--no-verify` (or run prettier
  from the main checkout / `npm install` in the worktree first).
