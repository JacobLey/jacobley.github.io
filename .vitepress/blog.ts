import { createContentLoader } from 'vitepress';
import { leymanPackages } from './leyman.js';

/**
 * A blog post, from the frontmatter of `src/blog/<slug>.md`.
 */
export interface Post {
    /**
     * Site path (`/blog/<slug>`).
     */
    readonly url: string;
    readonly title: string;
    readonly description: string;
    /**
     * Publication date, `YYYY-MM-DD`.
     */
    readonly date: string;
    /**
     * Slugs of the leyman packages the post is about (see `leyman.ts`).
     */
    readonly packages: readonly string[];
}

/**
 * YAML reads an unquoted `2026-11-07` as a Date (at midnight UTC), so both forms are accepted.
 *
 * @param value - the frontmatter's `date`
 * @returns the date as `YYYY-MM-DD`, or `undefined` when it is neither form
 */
const toDate = (value: unknown): string | undefined => {
    const date = value instanceof Date ? value.toISOString().slice(0, 10) : value;
    return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/v.test(date) ? date : undefined;
};

/**
 * Loads every post (not the `/blog/` index), newest first. Fails, in the dev server and the build,
 * when a post's frontmatter is incomplete, names a leyman package `leyman.ts` doesn't list, or the post is
 * missing `<PostHeader />` under its title.
 *
 * @returns the loader, for a data loader file's default export or a direct `load()`
 */
export const createPostsLoader = (): ReturnType<typeof createContentLoader<Post[]>> =>
    createContentLoader('blog/*.md', {
        includeSrc: true,
        transform(pages): Post[] {
            const problems: string[] = [];
            const posts = pages
                .filter(({ url }) => url !== '/blog/')
                .map(({ url, src = '', frontmatter }): Post => {
                    const { title, description, packages: about = [] } = frontmatter;
                    const date = toDate(frontmatter.date);
                    for (const [field, value] of [
                        ['title', title],
                        ['description', description],
                    ] as const) {
                        if (typeof value !== 'string' || value === '') {
                            problems.push(`${url}: frontmatter needs a "${field}"`);
                        }
                    }
                    if (date === undefined) {
                        problems.push(`${url}: frontmatter needs a "date" (YYYY-MM-DD)`);
                    }
                    if (
                        !Array.isArray(about) ||
                        about.some(slug => typeof slug !== 'string' || !leymanPackages.has(slug))
                    ) {
                        problems.push(
                            `${url}: "packages" must list slugs of leyman packages (leyman.ts)`
                        );
                    }
                    if (!src.includes('<PostHeader />')) {
                        problems.push(`${url}: missing <PostHeader /> under its title`);
                    }
                    return {
                        url,
                        title: String(title),
                        description: String(description),
                        date: date ?? '',
                        packages: Array.isArray(about) ? about.map(String) : [],
                    };
                });
            if (problems.length > 0) {
                throw new Error(`src/blog:\n${problems.join('\n')}`);
            }
            return posts.toSorted(
                (a, b) => b.date.localeCompare(a.date) || a.url.localeCompare(b.url)
            );
        },
    });
