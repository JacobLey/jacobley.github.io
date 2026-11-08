# jacobley.github.io

Source of [Jacob Ley's blog](https://jacobley.github.io/blog/), served at https://jacobley.github.io/. Built with [VitePress](https://vitepress.dev/) and deployed to GitHub Pages from `main`.

The RSS feed, with each post's full content, is https://jacobley.github.io/blog/feed.xml.

## Develop

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm run check    # lint and build, as CI does
```

Or open it in the devcontainer (Node.js and pnpm). Posts are `src/blog/<slug>.md`; see [AGENTS.md](./AGENTS.md).

The [leyman](https://github.com/JacobLey/leyman) packages the posts write about are documented at https://jacobley.github.io/leyman/.
