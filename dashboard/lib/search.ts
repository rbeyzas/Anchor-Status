import type { AnchorViewModel } from './types';

/** Lower case, accents off, and anything that is not a letter or digit as a
 * space: "Grupo Anchor S.A." and "grupo anchor sa" read the same. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Every word of the query appears somewhere in the anchor's name, domain
 * or id. An empty query matches everything. */
export function matchesQuery(anchor: Pick<AnchorViewModel, 'name' | 'domain' | 'anchorId'>, query: string): boolean {
  const words = fold(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [anchor.name, anchor.domain, anchor.anchorId].map(fold).join(' ');
  const compact = haystack.replace(/ /g, '');
  return words.every((w) => haystack.includes(w) || compact.includes(w));
}
