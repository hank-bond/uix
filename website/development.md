---
summary: "Preview the site by opening index.html over file:// (the scroll animation works there) and test reduced motion via DevTools rendering emulation; run npm install once in the worktree so the pre-commit hook (Prettier + docs:index) works."
read_when: "Read before previewing, testing, or committing changes to the site."
status: active
---

# Development

## Preview

- Open `index.html` directly — the scroll-driven animation works over `file://`.
- Test reduced motion: DevTools → Rendering → "Emulate prefers-reduced-motion: reduce".

## Committing

The repo's pre-commit hook formats staged files with Prettier and regenerates the doc indexes, running from `./node_modules`. A freshly-created worktree has none, so run `npm install` once here to enable it — the static site itself has no dependencies; this install is purely for the toolchain. Until you do, the hook fails and commits need `--no-verify`.
