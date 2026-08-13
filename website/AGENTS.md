---
summary: "The uix.sh site builds with Hugo: a landing page with a reduced-motion-safe brandmark morph plus a hand-written devlog."
read_when: "Read when editing the landing page, devlog, brandmark animation, styles, or favicon."
---

# UIX marketing site

GitHub Pages serves the public UIX site at **uix.sh**. It is a small [Hugo](https://gohugo.io) site: the landing page (sticky bar, hero brandmark, mock app) plus a hand-written devlog. Everything stays plain: no theme, no JS framework, no taxonomies, no RSS. Hugo ships as a single binary with no npm tree. Build with `hugo --source website` from the repo root. The generated site lands in `website/public/`, which is gitignored.

The website is entirely hand-written copy, so it stays out of the docs' vale pools by design. If the site ever grows writing gates, they belong to a dedicated `uix-website` set. See `.vale.ini`.

## Files

| File | Role |
| --- | --- |
| `hugo.toml` | Site config. Spartan defaults: no taxonomies, no RSS yet. |
| `layouts/index.html` | The landing page: sticky bar, hero (the brandmark), mock app. |
| `layouts/_default/` | `baseof.html` shell, `single.html` and `list.html` for devlog pages. |
| `content/devlog/` | Devlog posts. `_index.md` is the list page. Each post is one markdown file. |
| `static/styles.css` | Landing styling + the scroll-driven animation. Sectioned. Read its header comment. |
| `static/devlog.css` | Devlog-only styling. Deliberately plain. |
| `static/mock.js` | Toggles the mock theme and slows the arrow's click-scroll. It never changes user-driven scrolling. |
| `static/uix-logo-white.svg` | Favicon. The landing page inlines the brandmark. |
| `static/CNAME` | `uix.sh` for Pages. |

[`pages.yml`](../.github/workflows/pages.yml) builds `website/` with Hugo and publishes `website/public/` to Pages after a push to `main`. The root Markdown docs below stay repo-side for the docs-index script and are copied into the artifact to keep their published URLs.

## Pages

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[accessibility](./accessibility.md)** _(reference)._ Reduced motion is a primary path with semantic structure, hidden decorative content, operable controls, and no translation, scaling, or parallax.
- **[brandmark](./brandmark.md)** _(reference)._ The inline SVG brandmark morphs persistent named parts on one timeline and stays crisp through whole-pixel transforms.
- **[css-architecture](./css-architecture.md)** _(reference)._ styles.css is ordered tokens→reset→a11y→base→motion→keyframes, with the load-bearing rule that ALL motion lives inside the prefers-reduced-motion:no-preference block, so the static version is the base. Sizes and the dock's scroll timeline are tuned via :root knobs, and named scroll/view timelines are element-scoped. _Read before adding or changing any animation, timeline, or :root sizing or timing variable in styles.css._
- **[development](./development.md)** _(how-to)._ Preview the site with Hugo and test reduced motion via DevTools rendering emulation. Run npm install once in the worktree so the pre-commit hook (Prettier + docs:index) works, and keep devlog posts inside the repo-wide markdown checks. _Read before previewing, testing, writing devlog posts, or committing changes to the site._

<!-- INDEX:END -->
