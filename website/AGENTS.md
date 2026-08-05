---
summary: "The zero-build uix.sh landing page uses static HTML, CSS, and JavaScript with a reduced-motion-safe brandmark morph."
read_when: "Read when editing the landing page, brandmark animation, styles, or favicon."
---

# UIX marketing site

GitHub Pages serves the public UIX landing page at **uix.sh**. It is a _zero-build static site_ using plain HTML, CSS, and JavaScript. Edit the files directly. No bundler runs.

## Files

| File | Role |
| --- | --- |
| `index.html` | Markup. One page: sticky bar, hero (the brandmark), mock app. |
| `styles.css` | All styling + the scroll-driven animation. Sectioned. Read its header comment. |
| `mock.js` | Toggles the mock theme and slows the arrow's click-scroll. It never changes user-driven scrolling. |
| `uix-logo-white.svg` | Favicon. The brandmark on the page is inlined in `index.html`. |
| `CNAME` | `uix.sh` for Pages. |

[`pages.yml`](../.github/workflows/pages.yml) publishes `website/` to Pages after a push to the `website` branch. The workflow also publishes these public documentation files.

## Pages

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[accessibility](./accessibility.md)** _(reference)._ Reduced motion is a primary path with semantic structure, hidden decorative content, operable controls, and no translation, scaling, or parallax.
- **[brandmark](./brandmark.md)** _(reference)._ The inline SVG brandmark morphs persistent named parts on one timeline and stays crisp through whole-pixel transforms.
- **[css-architecture](./css-architecture.md)** _(reference)._ styles.css is ordered tokens→reset→a11y→base→motion→keyframes, with the load-bearing rule that ALL motion lives inside the prefers-reduced-motion:no-preference block, so the static version is the base. Sizes and the dock's scroll timeline are tuned via :root knobs, and named scroll/view timelines are element-scoped. _Read before adding or changing any animation, timeline, or :root sizing or timing variable in styles.css._
- **[development](./development.md)** _(how-to)._ Preview the site by opening index.html over file:// (the scroll animation works there) and test reduced motion via DevTools rendering emulation. Run npm install once in the worktree so the pre-commit hook (Prettier + docs:index) works. _Read before previewing, testing, or committing changes to the site._

<!-- INDEX:END -->
