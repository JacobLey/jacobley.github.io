---
title: "A cached Nx run took almost 3 minutes. Now it takes 40 seconds"
description: "With every task in leyman cached, nx run-many -t verify still took 2m 22s to 2m 54s. Most of it was Nx copying finished tasks' results into native code on every hashing pass. The fix is in Nx 24.0.4."
date: 2026-11-16
---

# A cached Nx run took almost 3 minutes. Now it takes 40 seconds

<PostHeader />

In [leyman](https://github.com/JacobLey/leyman), `verify` is the stage that runs every check and every test. With nothing changed since the last run, so that every one of its 1,796 tasks was a cache hit, `nx run-many -t verify` still took between 2m 22s and 2m 54s. On November 1 I got that down to about 40 seconds.

Most of the time went to one bug in [Nx](https://www.npmjs.com/package/nx): without the Nx daemon, each pass of task hashing copied the result of every task hashed so far into native code, and threw the copy away. I patched it locally the same day and sent the fix upstream as [nrwl/nx#37714](https://github.com/nrwl/nx/pull/37714). It shipped in Nx 24.0.4, so getting it now means upgrading. There's no patch to copy.

| Setup (Nx 23.3.1, 62 projects, 1,796 tasks, 14 cores, 2026-11-01) | Warm `verify` |
| ----------------------------------------------------------------- | ------------- |
| No daemon, as Nx defaults to in Docker                            | 2m 22s–2m 54s |
| No daemon, with the patch                                         | 37.5s         |
| Daemon on, `NX_PARALLEL=5`, with the patch                        | about 40s     |
| Nx 24.0.x, no patch                                               | TBD           |

<!-- Author to fill: the last table row, with the exact Nx version leyman bumped to and the warm verify timing after the bump (replace TBD). -->

The first two rows come from [the pull request](https://github.com/nrwl/nx/pull/37714). Per call, the native hash planner went from about 400ms to about 11ms.

## What a cached run still does

The [previous post](/blog/nx-lifecycle) covered how [nx-lifecycle](https://jacobley.github.io/leyman/packages/nx-lifecycle/) orders leyman's targets into stages. `verify` sits at the end and depends on `check` and `test` ([`lifecycle.json`](https://github.com/JacobLey/leyman/blob/main/leyman/main/lifecycle.json)), so running it for every project pulls in builds, lint, type checks, packaging checks and tests across all 62 projects.

A cache hit isn't free. Nx has to hash each task's inputs to know which cached result to restore, and in leyman many inputs include `dependentTasksOutputFiles`: the files that dependencies' tasks produced. Those can't be hashed until the dependency has finished (or been restored from cache), so Nx hashes in waves as tasks complete. A full warm `verify` called the native planner about 270 times.

## Profiling it

leyman's [devcontainer](https://github.com/JacobLey/leyman/tree/main/.devcontainer) runs in Docker, and Nx turns its [daemon](https://nx.dev/concepts/nx-daemon) off in Docker by default ([nrwl/nx#14126](https://github.com/nrwl/nx/issues/14126)). CI runs without one too. So every run went through Nx's daemonless path.

I ran Nx under Node.js's CPU profiler, [`node --cpu-prof`](https://nodejs.org/api/cli.html#--cpu-prof), pointed at Nx's own entry point. From leyman's root:

```sh
node --cpu-prof leyman/main/node_modules/nx/dist/bin/nx.js run-many -t verify
```

<!-- Author to fill: anything worth adding about reading the profile (the tool you opened it in, what the flame chart looked like) -->

The profile put most of the main thread's time in the hasher's `plan` method, which calls the planner. My first reading was that Nx re-planned the graph for every task. That was wrong: the profile charges the conversion of arguments into native code to the function that makes the call, and the planning itself was cheap.

<!-- Author to fill: confirm you're happy to tell the wrong-first-guess story; it comes from your session notes -->

## What the planner was given

The planner is written in Rust and called through [N-API](https://nodejs.org/api/n-api.html), which converts JavaScript objects into native structures on every call, synchronously, on the main thread. The hasher passed it the live task graph.

That graph isn't static during a run. As each task is hashed, Nx writes its `hash` and `hashDetails` onto the task object in the graph, and `hashDetails` holds the hash of every input: in leyman about a million entries by the end of a run. The planner reads neither field, but N-API converted them anyway, so every wave copied the details of every task hashed before it. The cost of a call grew with the run, to about 400ms, and with about 270 calls that came to roughly 112 seconds of a warm `verify`.

Nx already had a fix for this, in two other places. [nrwl/nx#36716](https://github.com/nrwl/nx/pull/36716) stopped resending those results to the daemon, and [nrwl/nx#37015](https://github.com/nrwl/nx/pull/37015) stopped sending them to task workers. Both go through a helper, `pruneTaskGraph`, that returns the graph without run results. The daemonless planner call was the one path left.

## The patch

The fix is a single call: prune the graph before handing it to the planner. leyman carried it as a [pnpm patch](https://pnpm.io/settings#patcheddependencies) of Nx 23.3.1's compiled code ([the patch](https://github.com/JacobLey/leyman/blob/49959e5128b9959326b5f36c9069d2be7979ed17/patches/nx@23.3.1.patch), [commit](https://github.com/JacobLey/leyman/commit/49959e51)):

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

The results stay on the original graph, where the rest of the run reads them; only the planner's copy loses them. To check that the change was safe, I compared the hashes of all 1,796 tasks with and without it. They were identical, apart from one flip I come back to below.

## Upstream

I opened [nrwl/nx#37714](https://github.com/nrwl/nx/pull/37714) about an hour after the patch landed in leyman: the same change in TypeScript source, and a test that hashes a task whose dependency already carries `hash` and `hashDetails`, then checks the planner received the dependency without them while the original task kept its own. [Leosvel Pérez Espinosa](https://github.com/leosvelperez) approved it the next day, and it was merged on November 2 and released in [Nx 24.0.4](https://github.com/nrwl/nx/releases/tag/24.0.4) on November 3. No 23.x release has it.

<!-- Author to fill: anything first-hand about sending the PR (e.g. how you chose to frame it, or the 944 local hasher and tasks-runner tests you ran before submitting) if worth a line -->

leyman ran the patch until today, when it moved to Nx <!-- Author to fill: exact Nx version --> and dropped it (<!-- Author to fill: link to the leyman bump commit -->).

## The other changes

Two settings in the devcontainer changed the same day.

`NX_DAEMON=true` turns the daemon back on ([commit](https://github.com/JacobLey/leyman/commit/e05797d5)). Nx turns it off in Docker so that a container exiting can't cut off Nx Cloud's background calls, and leyman doesn't use Nx Cloud. A long-lived devcontainer is closer to a laptop than to a CI job. With the daemon on, a single-project command starts about a second sooner, and outputs already on disk aren't restored again. The daemon path was already pruned by #36716, so it never had the slow planner calls, but CI runs without the daemon, so the patch was still needed there.

`NX_PARALLEL=5` moved from `.bashrc` into the devcontainer's environment ([commit](https://github.com/JacobLey/leyman/commit/e3d87f41)). It had only reached bash, while the terminals and editor tasks ran zsh and so used Nx's default of 3 parallel tasks. I tried higher values: anything above 5 saved only about 5 seconds on a warm run, so it stays at 5, the cap the old `.bashrc` line already had.

<!-- Author to fill: why 5 rather than the core count, if worth saying (the old Dockerfile comment worried about file overload) -->

I also measured the tasks that never cache, in case they were the problem. They weren't: `sync-injected` takes 48ms, `biome` 49ms, and all the no-op tasks together about a second.

## A hash that wouldn't stay put

While comparing hashes, one target's kept changing between identical runs. `check-package` lists the `ignore` package in its [`externalDependencies`](https://github.com/JacobLey/leyman/blob/main/nx.json), and leyman's lockfile has three versions of it: 5.3.2, 7.0.6 and 7.0.14. With no single `ignore` to match, Nx 23.3.1 took the first matching version from a Rust `HashMap`, whose iteration order changes per process. When a run picked a version whose hash wasn't cached yet, all 29 `check-package` tasks reran, about 74 seconds.

That one was already fixed upstream by [nrwl/nx#37327](https://github.com/nrwl/nx/pull/37327), which hashes every installed version in sorted order. It shipped in Nx 24.0.0 and wasn't backported to 23.x, so leyman got it with the same upgrade.

## What's left

About 24 of the remaining 40 seconds are Nx hashing dependencies' outputs on the main thread, in `hashPlansFor`. Those hashes are needed for the `dependentTasksOutputFiles` inputs, so this isn't wasted work like the planner copies were. Moving it off the main thread is the next thing I'd look at.

## Timing it yourself

This needs Nx and the whole workspace, so it can't run in the browser. In leyman's devcontainer (`nx` is on the `PATH` there; elsewhere use `leyman/main/node_modules/.bin/nx` after `pnpm install`), run `verify` once to fill the cache, then time a second run:

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

Then check out <!-- Author to fill: the leyman bump commit --> for Nx <!-- Author to fill: exact Nx version --> and do the same. Run each a few times: on 23.3.1 the `check-package` flip can add over a minute to any one run.

In your own workspace, the test is the same: time a fully cached `nx run-many` with `NX_DAEMON=false` before and after upgrading to Nx 24.0.4 or later. The more tasks that hash dependencies' outputs, the bigger the difference.
