---
summary: "Preview the site with Hugo and test reduced motion via DevTools rendering emulation. Run npm install once in the worktree so the pre-commit hook (Prettier + docs:index) works, and keep devlog posts inside the repo-wide markdown checks."
kind: how-to
read_when: "Read before previewing, testing, writing devlog posts, or committing changes to the site."
---

# Development

## Preview

- Hugo is a single binary, not an npm dependency: `brew install hugo` once, then `cd website && hugo serve` (or `hugo serve --source website` from the repo root). Build output is `website/public/`.
- Test reduced motion: DevTools → Rendering → "Emulate prefers-reduced-motion: reduce".

## Writing a devlog post

Add `content/devlog/<slug>.md` with `title`, `date`, and `summary` frontmatter and a single `# H1` in the body. The repo-wide markdown checks (`npm run docs:check`) validate every markdown file, so posts must keep: frontmatter starting with `---` and carrying `summary`; exactly one H1 in the body, ending without punctuation; and no relative links to files outside the repo. Post titles and dates render from frontmatter; the body's H1 is the visible title.

## Committing

The repository pre-commit hook runs Prettier and regenerates documentation indexes from `./node_modules`. A fresh worktree has no installed toolchain, so run `npm install` once. The site itself adds no npm dependencies — Hugo is a separate binary. Without installation, the hook fails and commits require `--no-verify`.
