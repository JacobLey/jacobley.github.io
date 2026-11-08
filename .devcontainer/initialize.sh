#!/bin/sh
# Runs on the HOST (devcontainer `initializeCommand`) before the container starts.
#
# The main checkout stays wherever it was cloned. Worktrees live in one dedicated
# sibling folder named after it, so they never collide with other projects:
#
#   ~/code/jacobley.github.io/            <- main checkout (owns .git)
#   ~/code/jacobley.github.io-worktrees/
#     <branch>/                           <- git worktrees
#     .shared/                            <- pnpm store, Claude and gh config, plans
#   ~/code/.claude-shared/                <- Claude settings and CLAUDE.md shared by every repo
#
# Both folders are bind-mounted into the container at the SAME absolute paths as on the
# host, so git's absolute worktree links resolve on both sides. This writes those paths
# to `.devcontainer/.env`, which docker compose reads for variable substitution.
set -eu

cd "$(dirname "$0")/.."
worktree="$(pwd -P)"
common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
main_checkout="$(dirname "$common_dir")"
worktrees_dir="${main_checkout}-worktrees"
shared="$worktrees_dir/.shared"

if [ "$worktree" != "$main_checkout" ] && [ "$(dirname "$worktree")" != "$worktrees_dir" ]; then
    echo "error: worktree $worktree must live in $worktrees_dir" >&2
    echo "       create worktrees with: git worktree add $worktrees_dir/<branch> <branch>" >&2
    exit 1
fi

mkdir -p "$shared/pnpm-store" "$shared/claude-config" "$shared/gh-config"

# Claude Code settings and user-level CLAUDE.md, shared by every repo's devcontainers (leyman's too): a sibling of the
# main checkout, linked into this repo's CLAUDE_CONFIG_DIR. Memory stays per repo. A repo's own file moves into the
# shared folder when that has none yet; when both exist, the repo's is left alone until merged by hand.
claude_shared="$(dirname "$main_checkout")/.claude-shared"
mkdir -p "$claude_shared"
for file in settings.json CLAUDE.md; do
    link="$shared/claude-config/$file"
    if [ -f "$link" ] && [ ! -L "$link" ]; then
        if [ -e "$claude_shared/$file" ]; then
            echo "warning: $link is not linked to $claude_shared/$file: merge it in by hand, then delete it" >&2
            continue
        fi
        mv "$link" "$claude_shared/$file"
    fi
    if [ ! -e "$claude_shared/$file" ]; then
        if [ "$file" = settings.json ]; then echo '{}' > "$claude_shared/$file"; else : > "$claude_shared/$file"; fi
    fi
    ln -sfn "$claude_shared/$file" "$link"
done

# Plans shared by every worktree, kept out of git: `plans` is a gitignored symlink
mkdir -p "$shared/plans"
if [ ! -e plans ] && [ ! -L plans ]; then
    ln -s "$shared/plans" plans
fi

# Namespace the compose project by repo so same-named worktrees in other repos don't clash
project="$(basename "$main_checkout")"
if [ "$worktree" != "$main_checkout" ]; then
    project="${project}_$(basename "$worktree")"
fi
project="$(printf '%s' "$project" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_-' '-')"

# DNS labels for this worktree's URL, `https://<worktree>.<repo>.localhost`
. .devcontainer/names.sh

{
    printf 'MAIN_CHECKOUT="%s"\n' "$main_checkout"
    printf 'WORKTREES_DIR="%s"\n' "$worktrees_dir"
    printf 'CLAUDE_SHARED="%s"\n' "$claude_shared"
    printf 'COMPOSE_PROJECT_NAME="%s"\n' "$project"
    printf 'REPO_NAME="%s"\n' "$repo_name"
    printf 'WORKTREE_NAME="%s"\n' "$worktree_name"
} > .devcontainer/.env

# The container joins the machine's shared ingress network, so it must exist. The ingress itself (leyman's
# `tools/local-ingress`) is optional: without it, only https://<worktree>.<repo>.localhost doesn't load.
if ! docker network inspect local-ingress > /dev/null 2>&1; then
    docker network create local-ingress > /dev/null 2>&1 || true
fi
