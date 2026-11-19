---
title: "An agent's sandbox: every worktree is a standalone devcontainer"
description: 'Every Claude Code session I spin up is provisioned in a separate worktree, with its own Postgres, Valkey and HTTPS origin, while sharing the pnpm, Go and Nx caches. Going from downloading the repo to running it locally is a single "build container" away, and tests run against those real local services instead of mocks.'
date: 2026-11-19
---

# An agent's sandbox: every worktree is a standalone devcontainer

<PostHeader />

Once I leaned into agentic development, I often had more than one task I wanted to work on at once, and I wanted each [Claude Code](https://www.npmjs.com/package/@anthropic-ai/claude-code) session to just work. A single checkout doesn't give you that. It has one set of installed dependencies, one database and one dev server, so two sessions working in it on different tasks tread on each other. That was only a bit of a problem in practice, but for each session to just work it needed an isolated environment.

On [leyman](https://github.com/JacobLey/leyman), my monorepo, every session now gets a [git worktree](https://git-scm.com/docs/git-worktree) opened in its own [devcontainer](https://containers.dev/), with its own Postgres, Valkey and HTTPS origin, and the only things sessions share are caches. The part that carries to any repo is that a worktree should map to an isolated(-ish) container, and that once every environment has real services in it, it is better to test against those than against mocks.

## Every task gets a full environment, as every tab did on Meta's DevServers

The original inspiration was Meta's [DevServer setup](https://developers.facebook.com/blog/post/2022/11/15/meta-developers-workflow-exploring-tools-used-to-code/): on-demand servers that just work, with a full environment, where each VS Code tab was a completely separate machine. I don't need VMs in the cloud to follow the same pattern, because a worktree plus a devcontainer gives each session its own full environment on one machine. A single session _should_ be able to be as chaotic as it needs to be when testing, without risking the other sessions, and if it really goes off the rails, it is one container rebuild away from recovery.

I run about three sessions at once on leyman, and use the same pattern in other repos, so this is less about incredible horizontal scale than about following a pattern of "one click setup". A new session's environment is built from nothing, so any manual step would have to be repeated in every worktree, which makes it a forcing function: setting up the entire repo _has_ to be codified. Once it is, going from downloading the repo to running it locally is a single "build container" away, for a person as much as for an agent.

## Isolate what holds state, and share what's expensive to rebuild

Each session keeps to itself whatever holds state: the checkout and the dependencies installed into it, its databases, and the origin its dev server answers on. What the sessions share is what's expensive to rebuild and safe to share, like a package manager's content-addressed store and build caches keyed by their inputs, and most tools take their cache directory from an environment variable. Inside its environment every session sees the same names (the database is at the same hostname, so `DATABASE_URL` is the same string everywhere), which means no configuration is derived per session.

The "-ish" is that none of this is a security sandbox between sessions. Each leyman container mounts every worktree read-write and talks to the host's Docker, so a session can still delete another worktree or stop its containers. At the end of the day an agent could be highly destructive to the other worktrees, but I haven't found that to be a realistic concern: as long as work is pushed to GitHub periodically, there isn't much damage it can do.

## A mock is always catching up with the service you could run locally

Giving every session its own database is also what lets the tests stop mocking it. Mocks are always playing catch-up with the service they stand in for, and there's little point mocking "insert into the database and read it back" when you can just _do_ the write and the read in a local Postgres, or mocking that an email can be sent when you can run an actual SMTP server locally. Many of the best services come with a local version, even AWS ones ([DynamoDB local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html), for example). Mocks aren't 100% avoidable (an integration with Slack probably needs to be mocked out), but that also means being _very_ careful about isolating what you depend on and take in from Slack behind a well-shaped interface.

I'm sure there are edge cases to "can run locally", but it is the general preference. Many times the pushback is something like "it's harder to do" or "I can't properly isolate tests", and that is a setup issue. Lean into local services as the preferred solution, and once the setup is there, future tests are easier. You need a way to test "if the setup is X and I do Y, Z happens" against a realistic local service anyway, because if you can't do that, you probably don't have a strong understanding of your system, and the same "I can't know if it works correctly" is going to rear its ugly head in prod. I would much rather deal with those headaches on my local machine _before_ they get to prod.

It does take very intentional consideration in your code. No session has a database that somebody set up by hand, so every table, seed row and extension has to come from a script, and codifying all of that is easier said than done.

## The same images run locally and in CI, at the versions meant for prod

The other half of the benefit is parity. The services a test talks to on my machine are the same images CI runs, and those versions should generally match what you intend to run in prod, so testing locally, then in Docker, then in prod happens with fairly consistent logic. If anything CI could cover a wider range than local does (iterating the tests on both Postgres 17 and 18, say), though leyman's doesn't today.

In leyman, [Postgres](https://www.postgresql.org/) and [Valkey](https://valkey.io/) are sidecars in each worktree's compose project. Every worktree reaches them at `postgres:5432` and `valkey:6379`, because each compose project has its own default network and those names resolve on it to that worktree's containers. Neither keeps anything, and the compose file says why:

```yaml
postgres:
  # Nothing is persisted (in memory, not even an anonymous volume), so a restart starts from empty.
  # Dev data comes from scripts, never from what a database happens to hold.
  tmpfs:
    - /var/lib/postgresql
```

For the "I can't properly isolate tests" part, [pg-dolly](https://jacobley.github.io/leyman/packages/pg-dolly/) builds a template database from the schema's SQL once and gives each test its own copy, so parallel tests on one worktree's server don't see each other. CI runs the tests in [Dagger](https://dagger.io/) with the same Postgres and Valkey images, pinned by the same digests and under the same hostnames, and a `check-parity` target fails when the pins drift ([devcontainer skill](https://github.com/JacobLey/leyman/blob/main/.agents/skills/devcontainer/SKILL.md#version-parity-devcontainer--dagger)).

## What you'd hit copying leyman's setup

The whole thing is the [compose file](https://github.com/JacobLey/leyman/blob/main/.devcontainer/docker-compose.yml), [`initialize.sh`](https://github.com/JacobLey/leyman/blob/main/.devcontainer/initialize.sh) (which runs on the host before the container starts) and [`scripts/worktree`](https://github.com/JacobLey/leyman/blob/main/scripts/worktree) (the one click: `scripts/worktree new feat/x`), along with the [worktrees](https://github.com/JacobLey/leyman/blob/main/.agents/skills/worktrees/SKILL.md) and [devcontainer](https://github.com/JacobLey/leyman/blob/main/.agents/skills/devcontainer/SKILL.md) skills, which are what the agents read. The high-level architecture is entirely mine, but actually getting the implementation working, iterated on and debugged was an agent-heavy process. An agent is just so much faster at writing Dockerfiles than a human could hope to be.

Worktrees go in a folder beside the main checkout, with the shared caches next to them:

```
~/code/
  leyman/                      <- main checkout, owns .git
  leyman-worktrees/
    feat-x/                    <- worktree for branch feat/x
    .shared/
      pnpm-store/, pnpm-cache/
      go-build/, go-mod/
      nx-cache/                <- served by the nx-cache sidecar
```

Every container mounts the main checkout and the worktrees folder at the absolute paths they have on the host. Git records absolute paths in a worktree's links to the main checkout's `.git`, and they have to resolve from both sides. Docker inside the container is also the host's Docker ([docker-outside-of-docker](https://github.com/devcontainers/features/tree/main/src/docker-outside-of-docker), which Dagger needs), so a bind mount started from inside names a path that the host's daemon resolves on the host.

The [pnpm](https://pnpm.io/) store is shared by setting `pnpm_config_store_dir` in the container's environment, and it has one trap: [`storeDir`](https://pnpm.io/settings#storedir) in `pnpm-workspace.yaml` takes precedence over the environment variable, so setting it would quietly give each worktree its own store again.

[Nx](https://www.npmjs.com/package/nx) couldn't share its cache through a folder. It only restores a result that has a row in its cache database ([`cache.rs`](https://github.com/nrwl/nx/blob/19a9e5f4e525b517faa4b1ab086781c9d158957d/packages/nx/src/native/cache/cache.rs#L275-L303)), and pointing `NX_CACHE_DIRECTORY` at a shared folder leaves that database in each checkout's own `.nx/` ([`cache-directory.ts`](https://github.com/nrwl/nx/blob/19a9e5f4e525b517faa4b1ab086781c9d158957d/packages/nx/src/utils/cache-directory.ts#L310-L326)), so anything another worktree built is a miss. Nx's self-hosted remote cache does work across worktrees, so each compose project runs a small cache server as a sidecar ([`nx-cache-server.mjs`](https://github.com/JacobLey/leyman/blob/main/.devcontainer/nx-cache-server.mjs)), all of them reading and writing the same `.shared/nx-cache`. Nx 24 can do the cross-worktree part itself ([nrwl/nx#36514](https://github.com/nrwl/nx/pull/36514)), but the sidecar stays for now because it also reads results it doesn't have from the hosted cache that CI on `main` writes to ([commit](https://github.com/JacobLey/leyman/commit/cb89b60a)), so a new worktree doesn't start cold.

Rebuild Container once failed for me with `container is marked for removal and cannot be started`, while two other repos' devcontainers were rebuilding at the same time. Docker was still deleting the old container when the Dev Containers extension ran `docker compose up --no-recreate`, so compose found the old one ([microsoft/vscode-remote-release#11967](https://github.com/microsoft/vscode-remote-release/issues/11967); I've seen it once, and retrying worked). The race is the extension's, but how long a delete takes is partly up to me, because Docker deletes everything the container wrote to its own filesystem along with it. So what grows moved out of the container ([commit](https://github.com/JacobLey/leyman/commit/12c4ae75)): pnpm's metadata cache and Go's caches to `.shared/`, and `/tmp` to a [tmpfs](https://docs.docker.com/engine/storage/tmpfs/), which took the container's layer from 2.44 GB to 1.08 GB by `docker ps --size`.

That tmpfs then broke every `nx` command. Docker mounts a tmpfs `noexec` by default, and Nx copies its native binding to `/tmp/.nx` and loads it from there (always the literal `/tmp`, never `$TMPDIR`), so it falls back to WASM, which fails with `WorkspaceContext is not a constructor`. The mount has to be `/tmp:exec` ([commit](https://github.com/JacobLey/leyman/commit/b42b45e7)).

For the dev server, one [Caddy](https://caddyserver.com/) per machine routes `https://<worktree>.<repo>.localhost` to that worktree's container ([`tools/local-ingress`](https://github.com/JacobLey/leyman/blob/main/tools/local-ingress/README.md)). Browsers resolve `*.localhost` to loopback themselves ([RFC 6761, section 6.3](https://www.rfc-editor.org/rfc/rfc6761#section-6.3)), and because every worktree is its own origin, cookies and OAuth redirect URIs don't collide.

## A worktree costs about 2 GiB of memory

The machine is a Mac with 36 GB of RAM, 24 GB of it granted to [OrbStack](https://orbstack.dev/), which I did have to raise from 10 GB at one point. One leyman worktree's compose project came to between 1.9 and 2.5 GiB over three `docker stats --no-stream` readings, nearly all of it the workspace container.

## Where to start

Simply adopt devcontainers to start. That alone means nobody has to manage `nvm`, or coordinate across teams to get everyone on the right version of Python. From there, sharing data across devcontainers (the pnpm store, say) is fairly straightforward. The long-term goal is the database setup, since that is the part that asks something of your code.

This blog's repo is a much smaller copy to start from: its [`.devcontainer`](https://github.com/JacobLey/jacobley.github.io/tree/main/.devcontainer) has Node.js and pnpm as its toolchain, no Nx and no databases.
