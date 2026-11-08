# Each tool is fetched in its own stage (built in parallel), and the final image copies them in last. Bumping one
# tool's version rebuilds its stage and the cheap copies after it, not the slow system installs before them.
#
# Declare each ARG in the stage that uses it, right before its first use: a changed ARG reruns every RUN after its
# declaration in that stage. ARGs before the first FROM are only for FROM lines.
#
# Only Node.js and pnpm, the site's toolchain, plus gh, oh-my-zsh and Claude Code for working in the repository.

# https://github.com/devcontainers/images/blob/main/src/base-debian/history
ARG BASE_IMAGE=mcr.microsoft.com/devcontainers/base:2.2.1-debian13@sha256:1f851004adcd3dff3776b4a1da86727cf52280b0fdc9d5b0568c9c7d74274286
# Keep the major in sync with `node-version` in `.github/workflows/ci.yml`
ARG NODE_IMAGE=node:26.13.0-trixie-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39

FROM ${NODE_IMAGE} AS node

FROM ${BASE_IMAGE} AS base
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install vim -y
ARG USER=dev
RUN adduser $USER && \
    echo $USER:$USER | chpasswd && \
    adduser $USER sudo
ENV HOME="/home/$USER"

# CI reads the version from `packageManager` in package.json: keep them the same. Only bump to a release at least 7
# days old
FROM base AS pnpm
ARG PNPM_VERSION=12.15.0
ENV PNPM_HOME="$HOME/.local/share/pnpm"
RUN curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=$PNPM_VERSION SHELL=bash sh -

# GitHub CLI, for local use only. Only bump to a release at least 7 days old
FROM base AS gh
ARG GH_VERSION=2.102.0
RUN wget "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_$(dpkg --print-architecture).tar.gz" -O /tmp/gh.tar.gz \
    && mkdir /opt/gh \
    && tar -C /opt/gh --strip-components=1 -xzf /tmp/gh.tar.gz \
    && rm /tmp/gh.tar.gz

FROM base

# Install oh-my-zsh https://ohmyz.sh/
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# Install Claude
# CLAUDE_CONFIG_DIR is set in docker-compose.yml so config is shared across worktrees
RUN curl -fsSL https://claude.ai/install.sh | bash

# Grant permissions to non-root (before the tools are copied in, already owned by them)
RUN mkdir -p $HOME/.config/vscode-dev-containers && \
    chown -R $USER:$USER $HOME

# The tools, last. No npm: pnpm only
COPY --from=gh /opt/gh/bin/gh /usr/local/bin/gh
ENV PNPM_HOME="$HOME/.local/share/pnpm"
COPY --from=pnpm --chown=$USER:$USER $PNPM_HOME $PNPM_HOME
# pnpm 11+ installs global binaries (including itself) under `bin`
ENV PATH="$PNPM_HOME/bin:$PATH"
COPY --from=node /usr/local/bin/node /usr/local/bin/node

# The site's own binaries (vitepress, biome) and `scripts/commands` are on PATH via `remoteEnv` in devcontainer.json,
# since the workspace path differs per worktree.
