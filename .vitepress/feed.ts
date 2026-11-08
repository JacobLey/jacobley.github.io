import type { Post } from './blog.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { createMarkdownRenderer } from 'vitepress';

const escapeXml = (text: string): string =>
    // `&` first: TypeScript rejects any character before it in a `v`-flag class. Sort the class once it
    // doesn't (microsoft/TypeScript#62707)
    // eslint-disable-next-line regexp/sort-character-class-elements -- TypeScript rejects the sorted order, see above
    text.replaceAll(/[&"'<>]/gv, char => `&#${char.codePointAt(0)!};`);

/**
 * The code a reader should see from a twoslash `ts` block: what follows `// ---cut---`, without
 * the `// @errors`-style directives and `// ^?` queries, which only drive the type-checker.
 *
 * @param code - the block's source
 * @returns the lines a reader should see
 */
const visibleCode = (code: string): string => {
    const cut = code.lastIndexOf('// ---cut---\n');
    return (cut === -1 ? code : code.slice(cut + '// ---cut---\n'.length))
        .split('\n')
        .filter(line => !/^\s*\/\/\s*(?:@\w+|\^\?)/v.test(line))
        .join('\n');
};

/**
 * A post's body as plain HTML for sites that import the feed (dev.to converts it to markdown):
 * code blocks as `<pre><code class="language-…">` without highlighting or type popups, the post
 * header dropped (the feed item has the date), any other component (a live report) replaced by a
 * link to the post, which has it, and every site path made absolute.
 *
 * @param srcDir - the site's source directory
 * @param siteUrl - the site's URL, ending in `/`
 * @returns a renderer of one post's markdown source
 */
const renderers = async (srcDir: string, siteUrl: string) => {
    const { pathname: base } = new URL(siteUrl);
    const md = await createMarkdownRenderer(srcDir, {}, '/');
    md.renderer.rules.fence = (tokens, index) => {
        const { info, content } = tokens[index] ?? { info: '', content: '' };
        const [lang = ''] = info.trim().split(/\s/v, 1);
        const code = lang === 'ts' ? visibleCode(content) : content;
        const langClass = lang ? ` class="language-${lang}"` : '';
        return `<pre><code${langClass}>${md.utils.escapeHtml(code)}</code></pre>\n`;
    };
    return (post: Post, src: string): string => {
        const link = `${siteUrl}${post.url.slice(1)}`;
        const body = src
            // Frontmatter, the title (the feed item has it), HTML comments and the post header
            .replace(/^---\n[\s\S]*?\n---\n/v, '')
            .replace(/^# .*\n/mv, '')
            .replaceAll(/<!--[\s\S]*?-->\n?/gv, '')
            .replaceAll(/^<PostHeader \/>\n/gmv, '')
            .replaceAll(
                /^<[A-Z]\w* \/>$/gmv,
                () =>
                    `<p><a href="${link}">This part is interactive: see it on the original post.</a></p>`
            );
        return (
            md
                .render(body, { relativePath: post.url.slice(1) })
                // Heading permalinks only make sense on the site
                .replaceAll(/ <a class="header-anchor"[^>]*>[^<]*<\/a>/gv, '')
                // Site paths, which the renderer prefixes with `base` and gives a `.html`
                // extension the site's clean URLs don't use
                .replaceAll(
                    /(?<= (?:href|src)=")\/(?!\/)[^"#]*/gv,
                    path =>
                        `${siteUrl}${path.slice(path.startsWith(base) ? base.length : 1).replace(/\.html$/v, '')}`
                )
        );
    };
};

/**
 * Writes the blog's RSS feed to `/blog/feed.xml`, newest first, with each post's full content.
 * Each item's link is the post's page, so a site importing the feed (dev.to) can mark it as the
 * canonical URL.
 *
 * @param outDir - the build's output directory
 * @param srcDir - the site's source directory
 * @param siteUrl - the site's URL, ending in `/`
 * @param title - the blog's name, as feed readers show it
 * @param description - one sentence about the blog, as feed readers show it
 * @param posts - every post, newest first
 */
export const writeFeed = async (
    outDir: string,
    srcDir: string,
    siteUrl: string,
    title: string,
    description: string,
    posts: readonly Post[]
): Promise<void> => {
    const render = await renderers(srcDir, siteUrl);
    const items = await Promise.all(
        posts.map(async post => {
            const link = `${siteUrl}${post.url.slice(1)}`;
            const html = render(post, await readFile(`${srcDir}${post.url.slice(1)}.md`, 'utf8'));
            // eslint-disable-next-line unicorn/prefer-temporal, unicorn/no-unreadable-new-expression -- RSS dates are RFC 822, which `Date#toUTCString` writes and Temporal has no format for
            const pubDate = new Date(`${post.date}T00:00:00Z`).toUTCString();
            return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(post.description)}</description>
      <content:encoded><![CDATA[${html.replaceAll(']]>', ']]]]><![CDATA[>')}]]></content:encoded>
    </item>`;
        })
    );
    await mkdir(Path.join(outDir, 'blog'), { recursive: true });
    await writeFile(
        Path.join(outDir, 'blog', 'feed.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${siteUrl}blog/</link>
    <atom:link href="${siteUrl}blog/feed.xml" rel="self" type="application/rss+xml"/>
    <description>${escapeXml(description)}</description>
    <language>en</language>
${items.join('\n')}
  </channel>
</rss>
`
    );
};
