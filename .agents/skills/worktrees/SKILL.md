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
      pnpm-cache/                <- pnpm's metadata cache
      claude-config/             <- CLAUDE_CONFIG_DIR
      gh-config/                 <- GH_CONFIG_DIR (`gh auth login` once for every worktree)
      plans/                     <- plans shared by every worktree (`<worktree>/plans` links here, gitignored)
  .claude-shared/                <- shared with every repo's devcontainers (leyman's too)
    settings.json                <- `claude-config/settings.json` links here
    CLAUDE.md                    <- `claude-config/CLAUDE.md` links here: user-level instructions
```

Every devcontainer mounts all three folders at their host paths, so git's absolute worktree links resolve on both sides. [`.devcontainer/initialize.sh`](../../../.devcontainer/initialize.sh) runs on the host first: it refuses a folder that is neither the main checkout nor a child of `<main>-worktrees/`, creates `.shared/`, links `plans`, links Claude's settings and `CLAUDE.md` into `.claude-shared/` (moving this repo's in when the shared folder has none, warning when both exist), and writes `.devcontainer/.env` (paths, a compose project name per worktree, and the worktree's DNS names).

The container has Node.js and pnpm (the site's toolchain), gh, Python (for ad-hoc scripts), zsh with oh-my-zsh, and Claude Code. `node_modules` is per worktree; the pnpm store is shared. Claude's memory is per repo; preferences that apply across repos go in `.claude-shared/CLAUDE.md`. `scripts/commands` is on `PATH` (via `remoteEnv`): `yolo-claude` runs Claude Code without permission prompts, which is only safe inside the container.

## Rebuilding

**Rebuild Container** in VS Code sometimes fails the first time with `container is marked for removal and cannot be started`; Retry works. VS Code runs `docker compose up --no-recreate` before Docker has finished deleting the old container, a Dev Containers bug: [microsoft/vscode-remote-release#11967](https://github.com/microsoft/vscode-remote-release/issues/11967). Deleting is slower when Docker is busy and when the container wrote a lot to its own filesystem, so caches that grow go to `.shared/` (pnpm's store and metadata cache) and `/tmp` is a tmpfs. Check with `docker ps --size`: the container's own layer should stay small.

To confirm a failure was this race, the old container's `destroy` lands after the failed `up`:

```sh
docker events --since 10m --until 0s --filter type=container \
  --filter "label=devcontainer.local_folder=$(git rev-parse --show-toplevel)" \
  --format '{{.Time}} {{.Action}} {{.Actor.ID}}' | grep -E ' (kill|destroy|create|start) '
```

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
