---
summary: "The public uix.sh marketing site — a zero-build static landing page (plain HTML/CSS/JS) whose centerpiece is a scroll-driven brandmark morph, with all motion gated behind prefers-reduced-motion."
read_when: "Read when editing the public landing page at uix.sh — its markup, the scroll-driven logo animation/CSS, or the favicon."
status: active
---

# UIX marketing site

The public landing page for UIX, served at **uix.sh** via GitHub Pages. It is a **zero-build static site** — plain HTML/CSS/JS, no framework, no bundler. Edit the files; that's the whole pipeline.

## Files

| File | Role |
| --- | --- |
| `index.html` | Markup. One page: sticky bar, hero (the brandmark), mock cockpit. |
| `styles.css` | All styling + the scroll-driven animation. Sectioned; read its header comment. |
| `mock.js` | Two small jobs: theme toggle on the mock, and a slower click-scroll for the arrow. No other JS, and **nothing touches the user's own scroll** (no scroll-jacking) — keep it that way. |
| `uix-logo-white.svg` | Favicon. The brandmark on the page is inlined in `index.html`. |
| `CNAME` | `uix.sh` for Pages. |

Deploy: [`../.github/workflows/pages.yml`](../.github/workflows/pages.yml) publishes `website/` to Pages on push to the `website` branch. (This `AGENTS.md` and the docs below ship with it — harmless; the repo is public.)

## Pages

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[accessibility](./accessibility.md)** _(active)_ — Reduced motion is a first-class path, not a fallback: a visually-hidden h1, aria-hidden decorative SVGs and mock panes (the theme switch stays operable), and under prefers-reduced-motion only opacity fades are acceptable — never translate/scale/parallax.
- **[brandmark](./brandmark.md)** _(active)_ — The hero brandmark is one inline SVG built from persistent named parts (U / stem / x / center) that morph by interpolating their transforms — never pixel grids — on a shared keyframe timeline, and stays crisp only on whole-pixel transforms.
- **[css-architecture](./css-architecture.md)** _(active)_ — styles.css is ordered tokens→reset→a11y→base→motion→keyframes, with the load-bearing rule that ALL motion lives inside the prefers-reduced-motion:no-preference block (scroll-driven bits further under @supports), so the static version is the base; sizes and the dock's scroll timeline are tuned via :root knobs, and named scroll/view timelines are element-scoped. _Read before adding or changing any animation, timeline, or :root sizing/timing variable in styles.css._
- **[development](./development.md)** _(active)_ — Preview the site by opening index.html over file:// (the scroll animation works there) and test reduced motion via DevTools rendering emulation; run npm install once in the worktree so the pre-commit hook (Prettier + docs:index) works. _Read before previewing, testing, or committing changes to the site._

<!-- INDEX:END -->
