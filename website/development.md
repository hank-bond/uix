---
summary: "Preview the site by opening index.html over file:// (the scroll animation works there) and test reduced motion via DevTools rendering emulation. Run npm install once in the worktree so the pre-commit hook (Prettier + docs:index) works."
kind: how-to
read_when: "Read before previewing, testing, or committing changes to the site."
status: active
---

# Development

## Preview

- Open `index.html` directly. The scroll-driven animation works over `file://`.
- Test reduced motion: DevTools → Rendering → "Emulate prefers-reduced-motion: reduce".

## Committing

The repository pre-commit hook runs Prettier and regenerates documentation indexes from `./node_modules`. A fresh worktree has no installed toolchain, so run `npm install` once. The static site itself has no dependencies. Without installation, the hook fails and commits require `--no-verify`.
