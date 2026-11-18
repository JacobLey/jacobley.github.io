---
title: "nx-lifecycle: dependency injection for Nx task pipelines"
description: "Making Rust a supported language in leyman took five new Nx targets. With nx-lifecycle that was five lines of config; written by hand, 86 dependsOn entries across every existing target."
date: 2026-11-15
packages: [nx-lifecycle]
---

# nx-lifecycle: dependency injection for Nx task pipelines

<PostHeader />

On November 1, Rust became a supported language in [leyman](https://github.com/JacobLey/leyman), my monorepo ([commit](https://github.com/JacobLey/leyman/commit/97a41c04)). That meant five new [Nx](https://nx.dev/) targets: `rustfmt`, `rust-clippy`, `rust-wasm`, `rust-test` and `rust-coverage-report`. They all have to run in the right order. Format first, build the wasm before anything imports it, coverage after tests.

The ordering itself only took five lines in [`lifecycle.json`](https://github.com/JacobLey/leyman/blob/main/leyman/main/lifecycle.json):

```json
{
    "bindings": {
        "rustfmt": "prepare:format",
        "rust-clippy": "check:lint",
        "rust-wasm": "build:run",
        "rust-test": "test:run",
        "rust-coverage-report": "test:report"
    }
}
```

Wiring the same order by hand would have meant adding 86 [`dependsOn`](https://nx.dev/reference/project-configuration#dependson) entries, spread over all 25 existing targets, plus dependency lists for the five new ones. [nx-lifecycle](https://jacobley.github.io/leyman/packages/nx-lifecycle/) generated all of it for me.

Nx thrives on micro-packages (efficient caching/testing) but that means all the boilerplate for every package gets multiplied every time you need to tweak task dependencies. I wanted to give teams a way to get packages up to speed, while only caring about the "important parts" (e.g. _how_ you test, not _when_ you test). Basically, I needed dependency injection for my task runners.

## Interface and implementation

In leyman, tests always run after the build, but "build" is different per project: `tsc` for a TypeScript package, `rust-wasm` for a crate compiled to WebAssembly, `vitepress-build` for the docs site, and nothing at all for a Go module. Nx's `dependsOn` only takes concrete target names, so every target that waits on the build has to name `tsc`, `rust-wasm`, and so on itself.

nx-lifecycle splits that into two parts, the way dependency injection does. Stages and their hooks are the interface: the intended order, with no tool named. These are leyman's:

```json
{
    "stages": {
        "install": { "dependsOn": ["^build"] },
        "prepare": { "hooks": ["generate", "format"], "dependsOn": ["install"] },
        "check": { "hooks": ["lint"], "dependsOn": ["^build", "prepare", "build"] },
        "build": { "hooks": ["run", "post", "sync"], "dependsOn": ["^build", "prepare"] },
        "test": { "hooks": ["compile", "run", "report"], "dependsOn": ["build"] },
        "verify": { "dependsOn": ["check", "test"] }
    }
}
```

Bindings are the implementations: each tool is bound to one hook, once. Each stage becomes a chain of no-op targets (`build:_ → build:run → build:post → build:sync → build`), a bound target depends on the hook before its own, and the hook depends on every target bound to it. All the `dependsOn` get generated from those two maps.

## Counting the hand-written version

To compare, I needed a version of leyman without nx-lifecycle. Leyman configures its targets in `nx.json`'s [`targetDefaults`](https://nx.dev/reference/nx-json#target-defaults), one entry per target shared by every project, so the hand-written version is one `dependsOn` per target there.

The count assumes a hand-written entry lists every target it waits for, not only the one just before it. Chaining through the step in between only works in projects that have it, because Nx [skips a same-project dependency the project doesn't declare](https://github.com/nrwl/nx/blob/0239b3ee05b9051a7558c5a444a14b2d448f8d4d/packages/nx/src/tasks-runner/create-task-graph.ts#L243), along with everything that dependency would have waited on. If `mocha-unit-test` depended on `populate-files` alone, then in the 49 projects that run `tsc` without `populate-files`, nothing would order mocha after `tsc`. (On leyman's `main` as of November 14, 55 of 86 projects declare `tsc`, and 7 declare `populate-files`, 6 of them alongside `tsc`.)

So each entry comes down to two rules. A new target `t` bound to stage S must be added to an existing target's entry:

- as `t`, if the existing target is in a later hook of S, or in a stage that runs after S in the same project;
- as `^t`, if its stage, or a stage that one runs after, has a `^` dependency on S or on a stage that runs after S. These are the dependent projects.

This script applies those two rules to the bindings that already existed:

```js
// Which bound targets must wait for the given ones, in their own project or a dependent one.
// git show <commit>:leyman/main/lifecycle.json | node waiters.mjs <target>...
import { readFileSync } from 'node:fs';

const { stages, bindings } = JSON.parse(readFileSync(0, 'utf8'));
const deps = stage => stages[stage].dependsOn ?? [];
// The stages a stage runs after in the same project, transitively, and the stage itself.
const upTo = (stage, seen = new Set([stage])) => {
    for (const dep of deps(stage)) {
        if (!dep.startsWith('^') && !seen.has(dep)) {
            seen.add(dep);
            upTo(dep, seen);
        }
    }
    return seen;
};
const at = target => {
    const [stage, hook] = bindings[target].split(':');
    return [stage, hook ? stages[stage].hooks.indexOf(hook) : 0];
};

const added = process.argv.slice(2);
let targets = 0;
let entries = 0;
for (const target of Object.keys(bindings).filter(t => !added.includes(t))) {
    const [stage, hook] = at(target);
    const needs = added.flatMap(newTarget => {
        const [newStage, newHook] = at(newTarget);
        const sameProject = stage === newStage ? hook > newHook : upTo(stage).has(newStage);
        const dependent = [...upTo(stage)].some(s =>
            deps(s).some(dep => dep.startsWith('^') && upTo(dep.slice(1)).has(newStage))
        );
        return [...(sameProject ? [newTarget] : []), ...(dependent ? [`^${newTarget}`] : [])];
    });
    if (needs.length > 0) {
        targets++;
        entries += needs.length;
        console.log(`${target}: ${needs.join(', ')}`);
    }
}
console.log(`${targets} targets, ${entries} dependsOn entries`);
```

Run it from a leyman checkout against the Rust commit:

```sh
git show 97a41c04:leyman/main/lifecycle.json \
  | node waiters.mjs rustfmt rust-clippy rust-wasm rust-test rust-coverage-report
```

It lists 25 targets, which is every binding in the parent commit, and 86 entries. Two of the five tools are almost all of it:

- `rustfmt` and `rust-wasm`. Formatting and the build run early, and since `install` waits on `^build`, every stage of a dependent project waits on them. Most targets need both `rustfmt` and `^rustfmt`, and the same for `rust-wasm`.
- `rust-test` adds 2 entries, to `coverage-report` and `go-coverage-report`, the only targets that run after `test:run`.
- `rust-clippy` and `rust-coverage-report` add none. Nothing waits on lint or on coverage.

## What was generated instead

Leyman runs nx-lifecycle's executor, so the generated `dependsOn` are committed and the commit shows them. In `nx.json`, each new target depends on the one hook before its own (`rust-wasm` on `build:_`, `rust-test` on `test:compile`), and each of the five hook targets gained one name: `build:run` now waits on `rust-wasm` beside `tsc` and `vitepress-build`. No existing target's entry changed. One existing project, constant-consistent-hash's test vectors, opted into `rustfmt` with a one-line `"rustfmt": {}` in its `project.json`.

The Rust targets themselves come from a [small Nx plugin in the repo](https://github.com/JacobLey/leyman/blob/main/leyman/main/scripts/nx-rust-plugin.mjs) that reads each crate's `Cargo.toml`. It only defines the commands. The `dependsOn` all come from nx-lifecycle.

## Plugin or executor

You can run nx-lifecycle as a plugin or as an executor.

The plugin infers every lifecycle target when Nx builds the project graph. It doesn't write anything to your files, so there's no generated config to drift. If a project's own `dependsOn` replaces an inferred one and drops its lifecycle dependency, the plugin fails and names the entry to add.

The executor writes the targets into `nx.json` and each `project.json`, to be committed. In CI it only checks that the files match what it would write, and fails if they don't. Leyman uses it because Nx loads plugins before building anything, so a workspace can't run the plugin from its own unbuilt source. Anywhere else, use the plugin.

## Mixed toolchains, partial projects

Several tools can bind to one hook. In leyman, `test:run` alone has two mocha suites, vitest, `go-test` and `rust-test`. Targets bound to the same hook run in parallel.

A project only gets the bound targets it declares, so not every project implements every hook. A Go module has nothing in `build:run`, and its tests still wait on its `prepare` stage and on its dependencies' builds, since that's set on the stage, not the tool. `nx run <project>:build` runs `tsc` in a TypeScript package and nothing in a Go module.

The stage at the end is `verify`, which is `check` and `test`. `nx run-many -t verify` lints, builds and tests everything. How long it takes is [the next post](/blog/nx-cached-verify).

## Testing the planner

nx-lifecycle validates its options with a JSON Schema built in [Juniper](https://jacobley.github.io/leyman/packages/juniper/). One unit test feeds the planner stage configurations generated from that same schema by [juniper-arbitrary](https://jacobley.github.io/leyman/packages/juniper-arbitrary/) and [fast-check](https://www.npmjs.com/package/fast-check), with a fixed seed, and fails if planning throws on any of them ([test](https://github.com/JacobLey/leyman/blob/main/apps/nx-lifecycle/test/unit/lifecycle/generated-stages.spec.ts)):

```js
fc.assert(
    fc.property(makeArbitrary(stagesSchema), stages => {
        planLifecycle({ stages, bindings: {} });
    }),
    { seed: 42 }
);
```

So whenever I make the planner reject something new, I have to make the schema reject it too, or the test will generate one and fail. The schema now requires hook names to be non-empty, unique, and not `_` (the name of a stage's anchor target), matching what the planner rejects as of nx-lifecycle 1.4.2 ([commit](https://github.com/JacobLey/leyman/commit/d3be6ecf)).

## Try it

```sh
pnpm add -D nx-lifecycle
```

Install it in the workspace root, where Nx resolves plugins, and add the plugin to `nx.json` with your stages and bindings:

```json
{
    "plugins": [
        {
            "plugin": "nx-lifecycle/plugin",
            "options": {
                "stages": {
                    "build": { "hooks": ["pre", "run", "post"], "dependsOn": ["^build"] },
                    "test": { "hooks": ["run", "report"], "dependsOn": ["build"] }
                },
                "bindings": {
                    "tsc": "build:run",
                    "mocha": "test:run"
                }
            }
        }
    ]
}
```

Each project opts into a binding by declaring the target (`"tsc": {}`) in its `project.json`. `nx show project <name>` lists the inferred targets, and `pnpx nx-lifecycle explain <name>` prints what runs in which order. nx-lifecycle 1.5.0 needs Node.js 24 and Nx 24; for Nx 23, use 1.4.2.

Setup is in the [getting started guide](https://jacobley.github.io/leyman/packages/nx-lifecycle/getting-started). [Stages and hooks](https://jacobley.github.io/leyman/packages/nx-lifecycle/guides/stages-and-hooks) explains the generated targets. The [why](https://jacobley.github.io/leyman/packages/nx-lifecycle/why) page does the hand-written version of a smaller example. Leyman's own [`lifecycle.json`](https://github.com/JacobLey/leyman/blob/main/leyman/main/lifecycle.json) is a full real config.
