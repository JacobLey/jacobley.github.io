---
name: worktrees
description: Worktree-based development: the folder layout, what the devcontainer mounts and shares, and creating, opening and removing worktrees
---

# Worktrees

Do all development in a git worktree, each opened in its own devcontainer. The main checkout is best left on `main`, as the place new worktrees start from.

## Layout

```
~/code/
  jacobley.github.io/            <- main checkout, owns .git
  jacobley.github.io-worktrees/  <- created automatically
    post-x/                      <- worktree for branch post/x
    .shared/
      pnpm-store/                <- pnpm's content-addressed store
      claude-config/             <- CLAUDE_CONFIG_DIR
      gh-config/                 <- GH_CONFIG_DIR (`gh auth login` once for every worktree)
      plans/                     <- plans shared by every worktree (`<worktree>/plans` links here, gitignored)
```

Every devcontainer mounts both folders at their host paths, so git's absolute worktree links resolve on both sides. [`.devcontainer/initialize.sh`](../../../.devcontainer/initialize.sh) runs on the host first: it refuses a folder that is neither the main checkout nor a child of `<main>-worktrees/`, creates `.shared/`, links `plans`, and writes `.devcontainer/.env` (paths, a compose project name per worktree, and the worktree's DNS names).

The container has Node.js and pnpm (the site's toolchain), gh and Claude Code. `node_modules` is per worktree; the pnpm store is shared. `scripts/commands` is on `PATH` (via `remoteEnv`): `yolo-claude` runs Claude Code without permission prompts, which is only safe inside the container.

## Dev server

`pnpm dev` listens on `0.0.0.0:5173`. When the machine runs leyman's shared HTTPS ingress (`tools/local-ingress` in [leyman](https://github.com/JacobLey/leyman)), the worktree is at `https://<worktree>.jacobley-github-io.localhost`; trust its CA once from `http://ingress.localhost`. Without it, use the editor's port forwarding.

## Commands (on the host)

| Action                      | CLI                                                                     |
| --------------------------- | ----------------------------------------------------------------------- |
| Start work                  | `scripts/worktree new post/x [--from main]`                             |
| Reopen later                | `scripts/worktree open post/x [--local] [--print]`                      |
| Container without an editor | `scripts/worktree up post/x` / `scripts/worktree shell post/x [cmd...]` |
| Clean up                    | `scripts/worktree rm post/x [--delete-branch] [--force]`                |
| List                        | `scripts/worktree list`                                                 |

The same commands are VS Code tasks (`.vscode/tasks.json`), for a window opened locally on the main checkout. `scripts/worktree --help` has the details.
