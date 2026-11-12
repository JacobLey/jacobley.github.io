/**
 * Where the leyman project's docs site is published, as a project site beside this one.
 */
export const leymanUrl = 'https://jacobley.github.io/leyman/';

/**
 * The leyman packages a post may name in its `packages` frontmatter, by their slug on the leyman
 * docs site (`/leyman/packages/<slug>/`), with the title that site gives them. Add a package here
 * when a post is first about it.
 */
export const leymanPackages: ReadonlyMap<string, string> = new Map([
    ['generated-signature', 'generated-signature'],
    ['genever', 'genever'],
    ['juniper', 'Juniper'],
    ['populate-files', 'populate-files'],
]);

/**
 * A package's page on the leyman docs site, and its title there.
 *
 * @param slug - the package's slug, as in `leymanPackages`
 * @returns the link, titled by the slug when the package isn't listed
 */
export const packageLink = (slug: string): { readonly text: string; readonly link: string } => ({
    text: leymanPackages.get(slug) ?? slug,
    link: `${leymanUrl}packages/${slug}/`,
});
