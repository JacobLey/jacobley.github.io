---
title: "A cached Nx run took almost 3 minutes. Now it takes 40 seconds"
description: "With every task in leyman cached, nx run-many -t verify still took 2m 22s to 2m 54s. Most of it was Nx copying finished tasks' results into native code on every hashing pass. The fix is in Nx 24.0.4."
date: 2026-11-15
---

# A cached Nx run took almost 3 minutes. Now it takes 40 seconds

<PostHeader />

In [leyman](https://github.com/JacobLey/leyman), `verify` is the stage that runs every check and every test. Nothing had changed, so all 1,796 tasks were cache hits, and `nx run-many -t verify` still took between 2m 22s and 2m 54s. On November 1 I got that down to about 40 seconds.

Most of the time went to one bug in [Nx](https://www.npmjs.com/package/nx): without the Nx daemon, each pass of task hashing copied the result of every task hashed so far into native code, and threw the copy away. I patched it locally the same day and sent the fix upstream as [nrwl/nx#37714](https://github.com/nrwl/nx/pull/37714). It's in Nx 24.0.4, so you just need to upgrade.

| Setup (62 projects, 1,796 tasks, 14 cores)           | Warm `verify` |
| ---------------------------------------------------- | ------------- |
| Nx 23.3.1, no daemon, as Nx defaults to in Docker    | 2m 22s–2m 54s |
| Nx 23.3.1 with the patch, no daemon                  | 37.5s         |
| Nx 23.3.1 with the patch, daemon on, `NX_PARALLEL=5` | about 40s     |
| Nx 24.0.5, no patch, no daemon                       | 36s           |

The Nx 23.3.1 rows were measured on November 1, the Nx 24.0.5 row on November 15, when leyman upgraded ([commit](https://github.com/JacobLey/leyman/commit/3cb81500)). The first two rows come from [the pull request](https://github.com/nrwl/nx/pull/37714). Per call, the native hash planner went from about 400ms to about 11ms.

## Why a cached run is slow at all

The [previous post](/blog/nx-lifecycle) covered how [nx-lifecycle](https://jacobley.github.io/leyman/packages/nx-lifecycle/) orders leyman's targets into stages. `verify` sits at the end and depends on `check` and `test` ([`lifecycle.json`](https://github.com/JacobLey/leyman/blob/main/leyman/main/lifecycle.json)), so running it for every project pulls in builds, lint, type checks, packaging checks and tests across all 62 projects.

Nx still hashes every task's inputs on a cache hit. In leyman a lot of those inputs are `dependentTasksOutputFiles` (files the dependencies' tasks produced), which can't be hashed until the dependency is done, so it hashes in waves. A full warm `verify` called the native planner about 270 times.

## Profiling it

leyman's [devcontainer](https://github.com/JacobLey/leyman/tree/main/.devcontainer) runs in Docker, and Nx turns its [daemon](https://nx.dev/concepts/nx-daemon) off in Docker by default ([nrwl/nx#14126](https://github.com/nrwl/nx/issues/14126)). CI runs without one too. So I was never running with a daemon.

I ran Nx under Node.js's CPU profiler, [`node --cpu-prof`](https://nodejs.org/api/cli.html#--cpu-prof), pointed at Nx's own entry point. From leyman's root:

```sh
node --cpu-prof leyman/main/node_modules/nx/dist/bin/nx.js run-many -t verify
```

I didn't open the profile myself. This whole investigation was heavily AI-assisted, and I had Claude read it. It put most of the main thread's time in the hasher's `plan` method, which calls the planner, so our first conclusion was that Nx re-planned the graph for every task. That turned out to be wrong. The profiler counts the time spent converting arguments for native code against the caller, so the time it put on `plan` was really spent converting what `plan` handed the planner.

## The planner's input

The planner is written in Rust and called through [N-API](https://nodejs.org/api/n-api.html), which converts JavaScript objects into native structures on every call. It does that on the main thread, blocking. And the hasher was passing it the whole live task graph.

As each task is hashed, Nx writes its `hash` and `hashDetails` onto the task object in the graph, and `hashDetails` holds the hash of every input: in leyman about a million entries by the end of a run. The planner reads neither field, but N-API converted them anyway, so every wave copied the details of every task hashed before it. So each call got slower as the run went on. At about 400ms a call, against 11ms with the fix, the ~270 calls make up most of the two minutes the fix saved.

Nx had actually fixed this twice already. [nrwl/nx#36716](https://github.com/nrwl/nx/pull/36716) stopped resending results to the daemon and [nrwl/nx#37015](https://github.com/nrwl/nx/pull/37015) stopped sending them to task workers, both through a helper called `pruneTaskGraph` that strips run results off the graph. Nobody had added it to the daemonless planner call.

## The patch

The fix just prunes the graph before it goes to the planner. leyman carried it as a [pnpm patch](https://pnpm.io/settings#patcheddependencies) of Nx 23.3.1's compiled code ([the patch](https://github.com/JacobLey/leyman/blob/49959e5128b9959326b5f36c9069d2be7979ed17/patches/nx@23.3.1.patch), [commit](https://github.com/JacobLey/leyman/commit/49959e51)):

```diff
     plan(taskIds, taskGraph, ultracacheConfigurations) {
+        const prunedGraph = (0, prune_task_graph_1.pruneTaskGraph)(taskGraph);
         if (!ultracacheConfigurations) {
-            return this.planner.getPlansReference(taskIds, taskGraph);
+            return this.planner.getPlansReference(taskIds, prunedGraph);
         }
-        return this.planner.getPlansReference(taskIds, taskGraph, ultracacheConfigurations, (0, overrides_1.ultracacheEligibilityOptions)(this.projectGraph, taskGraph));
+        return this.planner.getPlansReference(taskIds, prunedGraph, ultracacheConfigurations, (0, overrides_1.ultracacheEligibilityOptions)(this.projectGraph, taskGraph));
     }
```

Only the planner gets the pruned copy. Everything else still reads the original graph. To check that the change was safe, I compared the hashes of all 1,796 tasks with and without it. They were identical, apart from one flip I come back to below.

## Upstream

I sent the same change upstream as [nrwl/nx#37714](https://github.com/nrwl/nx/pull/37714). It was merged on November 2 and released in [Nx 24.0.4](https://github.com/nrwl/nx/releases/tag/24.0.4) on November 3. No 23.x release has it.

leyman ran the patch until November 15, when it moved to Nx 24.0.5 and dropped it ([commit](https://github.com/JacobLey/leyman/commit/3cb81500)). That's 24.0.5 rather than the newer 24.0.6 because leyman only installs releases at least 7 days old. On stock 24.0.5, a warm `verify` without the daemon takes 36s, about the same as 23.3.1 with the patch.

## The other changes

Two settings in the devcontainer changed the same day.

`NX_DAEMON=true` turns the daemon back on ([commit](https://github.com/JacobLey/leyman/commit/e05797d5)). Nx turns it off in Docker so that a container exiting can't cut off Nx Cloud's background calls, and leyman doesn't use Nx Cloud. With the daemon on, a single-project command starts about a second sooner, and outputs already on disk aren't restored again. The daemon path was already fixed by #36716. CI doesn't use the daemon though, so CI still needed the patch.

_Update, November 19:_ the second-sooner start claimed above didn't hold up when measured on Nx 24.0.5 with [hyperfine](https://github.com/sharkdp/hyperfine), 20 runs per side (6 for `verify`). The daemon saved about 50 ms of project-graph work, building one project took the same time either way, cached or not, and a warm `verify` was 1.7 s slower with it (42.65 s against 40.95 s, medians). So leyman turned the daemon off again ([commit](https://github.com/JacobLey/leyman/commit/92fc25df)). To rerun the comparison in a leyman worktree: `scripts/commands/nx-daemon-bench unknown-error`.

`NX_PARALLEL=5` moved from `.bashrc` into the devcontainer's environment ([commit](https://github.com/JacobLey/leyman/commit/e3d87f41)). It had only reached bash, while the terminals and editor tasks ran zsh and so used Nx's default of 3 parallel tasks. It's still 5 (CPU count, capped at 5), same as the old `.bashrc` line.

I also measured the tasks that never cache, in case they were the problem, and they weren't: `sync-injected` is 48ms, `biome` 49ms, and all the no-op tasks together about a second.

## A hash that wouldn't stay put

While comparing hashes, one target's kept changing between identical runs. `check-package` lists the `ignore` package in its [`externalDependencies`](https://github.com/JacobLey/leyman/blob/main/nx.json), and leyman's lockfile has three versions of it: 5.3.2, 7.0.6 and 7.0.14. With no single `ignore` to match, Nx 23.3.1 took the first matching version from a Rust `HashMap`, whose iteration order changes per process. When a run picked a version whose hash wasn't cached yet, all 29 `check-package` tasks reran, about 74 seconds.

That one was already fixed upstream by [nrwl/nx#37327](https://github.com/nrwl/nx/pull/37327), which hashes every installed version in sorted order. It shipped in Nx 24.0.0 and wasn't backported to 23.x, so leyman got it with the same upgrade.

## What's left

About 24 of the remaining 40 seconds are Nx hashing dependencies' outputs on the main thread, in `hashPlansFor`. Those hashes are needed for the `dependentTasksOutputFiles` inputs. Moving it off the main thread is the next thing I'd look at.

## Timing it yourself

In leyman's devcontainer (`nx` is on the `PATH` there; elsewhere use `leyman/main/node_modules/.bin/nx` after `pnpm install`), run `verify` once to fill the cache, then time a second run:

```sh
nx run-many -t verify
time NX_DAEMON=false nx run-many -t verify
```

`NX_DAEMON=false` matters: with the daemon on, Nx 23.3.1 takes the already-fixed path and the difference disappears. To see the old behaviour, check out the commit just before the patch, which is Nx 23.3.1 unpatched, and repeat:

```sh
git checkout 49959e51~1 && pnpm install
nx run-many -t verify
time NX_DAEMON=false nx run-many -t verify
```

Then do the same on the upgrade to Nx 24.0.5:

```sh
git checkout 3cb81500 && pnpm install
nx run-many -t verify
time NX_DAEMON=false nx run-many -t verify
```

Run each a few times: on 23.3.1 the `check-package` flip can add over a minute to any one run.

In your own workspace, the test is the same: time a fully cached `nx run-many` with `NX_DAEMON=false` before and after upgrading to Nx 24.0.4 or later.
