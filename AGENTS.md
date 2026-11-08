# Agent Guide

Jacob Ley's blog: a [VitePress](https://vitepress.dev/) site, deployed to GitHub Pages at https://jacobley.github.io/ from `main`. One package, at the root, installed with pnpm.

This file is the entry point for any coding agent; `CLAUDE.md` is a symlink to it. Agent-focused documentation lives in `SKILL.md` files under `.agents/skills/`, listed below; `.claude/skills` links there for Claude Code.

The setup follows the patterns of [leyman](https://github.com/JacobLey/leyman), taken only where this site needs them. Its [principles](https://jacobley.github.io/leyman/framework/principles) decide anything no skill covers. `leyman-upstream.json` records the leyman commit the devcontainer, worktree scripts, CI and copied skills were last synced with: from a leyman checkout, `node leyman/main/scripts/fork-manifest.mjs drift --fork <this repository>` lists what changed there since, and `resync` records catching up. Formatting and lint come from leyman's published configs: `biome.json` and `tsconfig.json` extend `@leyman/configs`, and `eslint.config.js` is `@leyman/eslint-config`'s.

## Layout

| Path                       | What it is                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `src/`                     | The pages: `index.md` (home), `blog/index.md` (the post list), `blog/<slug>.md` (posts) |
| `.vitepress/config.ts`     | Site config; after the build it writes `/blog/feed.xml` and `/llms.txt`                 |
| `.vitepress/blog.ts`       | Loads the posts and fails the build on incomplete frontmatter                           |
| `.vitepress/feed.ts`       | The RSS feed, with each post's full content                                             |
| `.vitepress/leyman.ts`     | The leyman docs site's URL and the packages posts may name                              |
| `.vitepress/theme/`        | `<BlogPosts />` and `<PostHeader />`                                                    |
| `.devcontainer/`           | Node.js and pnpm only                                                                   |
| `scripts/worktree`         | Creates and opens worktrees, from the host                                              |
| `scripts/commands/`        | On the container's `PATH`; `yolo-claude` is the agent without prompts                   |
| `.github/workflows/ci.yml` | Lint and build on every PR and push; deploy from `main`                                 |

Never add a top-level `leyman/` path (or any other project site's name): it would shadow https://jacobley.github.io/leyman/.

## Commands

| Command          | What it does                                                          |
| ---------------- | --------------------------------------------------------------------- |
| `pnpm dev`       | Dev server on port 5173                                               |
| `pnpm run lint`  | Biome (formatting), ESLint and vue-tsc (types of the site's own code) |
| `pnpm run fix`   | Applies ESLint's safe fixes, then Biome's formatting                  |
| `pnpm run build` | Builds to `dist/`, type-checking every `ts` block in the posts        |
| `pnpm run check` | Lint, then build: what CI runs                                        |

Run `pnpm run check` before anything hard to undo (a merge, a push).

## Dependencies

Only versions published at least 7 days ago install (`minimumReleaseAge` in `pnpm-workspace.yaml`, with leyman's other supply-chain settings). GitHub Actions are pinned by commit SHA, also to releases at least 7 days old.

## Commits

Short subject, reasoning in the body, no attribution trailers: see the commit-messages skill. Commit each step once it works.

## Skills

| Task                           | Skill                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| Writing and publishing a post  | [`.agents/skills/blog-posts/SKILL.md`](./.agents/skills/blog-posts/SKILL.md)           |
| Writing commit messages        | [`.agents/skills/commit-messages/SKILL.md`](./.agents/skills/commit-messages/SKILL.md) |
| Worktrees and the devcontainer | [`.agents/skills/worktrees/SKILL.md`](./.agents/skills/worktrees/SKILL.md)             |
| Lint rules and disabling one   | `eslint-config`, linked by pnpm from `@leyman/eslint-config`                           |
| The principles behind it all   | `principles`, linked by pnpm from `@leyman/configs`                                    |

pnpm links the skills that leyman's packages ship into `.agents/skills` on install (approved under `permissions` in `pnpm-workspace.yaml`), so they change with the installed version. The links aren't committed.
