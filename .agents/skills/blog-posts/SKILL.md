---
name: blog-posts
description: Writing and publishing a blog post (frontmatter, links, type-checked examples, live reports, the RSS feed and dev.to)
---

# Blog posts

A post is `src/blog/<slug>.md`, served at `https://jacobley.github.io/blog/<slug>`. Once merged to `main` it is deployed, listed on `/blog/`, in the RSS feed (`/blog/feed.xml`) and in `/llms.txt`, so drafts stay out of `main` until they should go live. A slug is permanent: the URL is the canonical one dev.to and search engines point at.

## A post

- Frontmatter: `title`, `description`, `date` (`YYYY-MM-DD`, the publication date) and optionally `packages`, the slugs of the leyman packages it is about. A slug must be listed in [`.vitepress/leyman.ts`](../../../.vitepress/leyman.ts): add it there the first time a post names it.
- `<PostHeader />` right under the title: the date, the packages and a link back to all posts.
- The build fails when a field is missing, a slug isn't listed, or `<PostHeader />` is missing ([`.vitepress/blog.ts`](../../../.vitepress/blog.ts)).
- Lead with a measured result or a real story. Numbers come from a generated, reproducible report, with the versions measured, and the post says how to rerun it.

## Links

Chosen by what the reader needs at that point:

- **Leyman packages: their docs pages**, as absolute URLs under `https://jacobley.github.io/leyman/packages/<slug>/`, not npm or GitHub. Site paths (`/blog/...`) only for this site's own pages. Never put a page at a top-level path that names a project site (`/leyman/`): GitHub Pages would serve this site's page instead of the project's.
- **Other projects' packages: npm** (or their own docs site, when the point is a feature). Neutral, and shows the version the post names.
- **Code, data and issues: GitHub**, pinned to `main`. Where a reader would check a claim, link the file that backs it.

## Live reports

Live comparison components and in-browser benchmarks document packages, so they stay on the leyman docs site (genever's is `/leyman/packages/genever/comparison`). A post carries a dated static table of the run it describes and links to the live page.

## Examples are type-checked

Every `ts` block is type-checked by twoslash when the site builds, with [`tsconfig.twoslash.json`](../../../tsconfig.twoslash.json); an unexpected error fails the build. Mark an intended error with `// @errors: <codes>`, and hide setup code above `// ---cut---`. An example that imports a package needs that package's published version as a devDependency, at least 7 days old like every dependency.

## The feed

The feed carries each post's full content for sites that import it (dev.to): site paths become absolute URLs, code blocks lose highlighting and twoslash directives (only the code after `// ---cut---` is kept), `<PostHeader />` is dropped, and any other component becomes a link to the post ([`.vitepress/feed.ts`](../../../.vitepress/feed.ts)). So a post must read well without components.

## Publishing

1. Draft on a branch, or in the gitignored `plans/`. Leave `<!-- Author to fill: ... -->` where a first-hand detail is needed; never invent one. Comments are stripped from the page and the feed.
2. Set `date` to the publish day. `pnpm run check` (lint and build) passes.
3. Merge to `main`: CI deploys to GitHub Pages.
4. In dev.to: open the draft the feed import created, check tables, code and the canonical URL (the post's URL here), add tags, publish.
