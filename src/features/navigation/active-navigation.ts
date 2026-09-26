/** A parent section is active only when no more specific section matches. */
export function activeNavigation(path: string, hrefs: string[]): string | undefined {
  return hrefs
    .filter((href) => path === href || path.startsWith(href + '/'))
    .sort((a, b) => b.length - a.length)[0];
}
