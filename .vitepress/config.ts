import type { Post } from './blog.js';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformerTwoslash } from '@shikijs/vitepress-twoslash';
import ts from 'typescript';
import { defineConfig } from 'vitepress';
import { createPostsLoader } from './blog.js';
import { writeFeed } from './feed.js';
import { leymanUrl } from './leyman.js';

const tsConfigPath = fileURLToPath(new URL('../tsconfig.twoslash.json', import.meta.url));
const { options: compilerOptions, errors } = ts.convertCompilerOptionsFromJson(
    (JSON.parse(readFileSync(tsConfigPath, 'utf8')) as { readonly compilerOptions: unknown })
        .compilerOptions,
    Path.dirname(tsConfigPath)
);
if (errors.length > 0) {
    throw new Error(ts.formatDiagnostics(errors, ts.createCompilerHost({})));
}

/**
 * Where the site is published: the GitHub Pages user site, at the root of the domain. Project
 * sites share the domain under their repository's name (`/leyman/`), so no page may live at a
 * path that names one.
 */
const siteUrl = 'https://jacobley.github.io/';
const title = 'Jacob Ley';
const blogTitle = "Jacob Ley's blog";
const blogDescription =
    'Benchmarks, comparisons and the stories behind the open-source projects I work on.';
const srcDir = fileURLToPath(new URL('../src/', import.meta.url));

/**
 * Writes `/llms.txt` ([llmstxt.org](https://llmstxt.org/)): an index of the site for AI agents,
 * with every post. Generated from the posts, so it lists exactly what the site does.
 *
 * @param outDir - the build's output directory
 * @param posts - every post, newest first
 */
const writeLlmsTxt = async (outDir: string, posts: readonly Post[]): Promise<void> => {
    const lines = [
        `# ${title}`,
        '',
        `> ${blogDescription}`,
        '',
        `The TypeScript packages the posts are about are documented at ${leymanUrl}, which has its own [llms.txt](${leymanUrl}llms.txt).`,
        '',
        '## Blog',
        '',
        ...posts.map(
            ({ url, title: postTitle, date, description }) =>
                `- [${postTitle}](${siteUrl}${url.slice(1)}) (${date}): ${description}`
        ),
    ];
    await writeFile(Path.join(outDir, 'llms.txt'), `${lines.join('\n')}\n`);
};

export default defineConfig({
    title,
    description: blogDescription,
    base: '/',
    // Tracked pages live in `src/` and the build in `dist/`
    srcDir: 'src',
    outDir: 'dist',
    cacheDir: 'node_modules/.vitepress',
    cleanUrls: true,
    lastUpdated: false,
    head: [
        // Search Console's ownership check for the https://jacobley.github.io/ property
        [
            'meta',
            {
                name: 'google-site-verification',
                content: 'kpt0sH4Vqc3ICu7HCEQyGQESqJ3OfiKaGGSbo2VCu18',
            },
        ],
        [
            'link',
            {
                rel: 'alternate',
                type: 'application/rss+xml',
                title: blogTitle,
                href: `${siteUrl}blog/feed.xml`,
            },
        ],
    ],
    // `sitemap.xml` at the site's root, listing every page by its full URL
    sitemap: { hostname: siteUrl },
    markdown: {
        codeTransformers: [
            transformerTwoslash({
                // Every `ts` block is type-checked, not only those marked `twoslash`. A type error
                // not expected with `// @errors` fails the build (the dev server shows it inline
                // instead).
                explicitTrigger: false,
                // Render `// ^?` results inline, pushing the code below down, rather than as a
                // popup over the text. Also shows them without JavaScript.
                queryRendering: 'line',
                twoslashOptions: { compilerOptions },
            }),
        ],
        languages: ['js', 'ts', 'tsx', 'json', 'sh'],
    },
    async buildEnd({ outDir }) {
        const posts = await createPostsLoader().load();
        await writeLlmsTxt(outDir, posts);
        await writeFeed(outDir, srcDir, siteUrl, blogTitle, blogDescription, posts);
    },
    themeConfig: {
        nav: [
            { text: 'Blog', link: '/blog/', activeMatch: '^/blog/' },
            { text: 'Leyman', link: leymanUrl },
        ],
        socialLinks: [{ icon: 'github', link: 'https://github.com/JacobLey' }],
    },
});
