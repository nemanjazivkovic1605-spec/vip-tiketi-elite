import type { PublicSnapshot } from '../../src/types/publicFootball.js';
import { publicDirectory } from './directory.js';
import { PUBLIC_ORIGIN, leaguePath, matchPath, pairPath, teamPath } from './paths.js';

export const SITEMAP_PAGE_SIZE = 1000;
export const PUBLIC_SITE_PATHS = ['/', '/fudbal', '/timovi', '/h2h', '/analize-danas', '/history', '/stats', '/contact', '/terms', '/faq', '/bankroll-management', '/daily-analysis', '/early-information'];
const escapeXml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!));

function sitemapGroups(snapshot: PublicSnapshot): Record<string, string[]> {
  const directory = publicDirectory(snapshot);
  return { stranice: PUBLIC_SITE_PATHS, lige: snapshot.leagues.map(league => leaguePath(league.slug)),
    timovi: directory.teams.map(teamPath), h2h: directory.pairs.filter(pair => pair.finished > 0).map(pair => pairPath(pair.first, pair.second)),
    utakmice: [...snapshot.matches].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)).map(matchPath) };
}

export function publicSitemapSegments(snapshot: PublicSnapshot): string[] {
  return Object.entries(sitemapGroups(snapshot)).flatMap(([name, paths]) => Array.from({ length: Math.ceil(paths.length / SITEMAP_PAGE_SIZE) }, (_, index) => `${name}-${index + 1}`));
}

export function publicSitemapIndex(snapshot: PublicSnapshot): string {
  const entries = publicSitemapSegments(snapshot).map(segment => `<sitemap><loc>${PUBLIC_ORIGIN}/sitemaps/${segment}.xml</loc></sitemap>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`;
}

export function publicSitemapUrls(snapshot: PublicSnapshot, segment?: string): string[] | null {
  const groups = sitemapGroups(snapshot);
  if (!segment) return Object.values(groups).flat();
  const match = segment.match(/^(stranice|lige|timovi|h2h|utakmice)-([1-9]\d{0,3})$/);
  if (!match) return null;
  const start = (Number(match[2]) - 1) * SITEMAP_PAGE_SIZE, paths = groups[match[1]];
  return start < paths.length ? paths.slice(start, start + SITEMAP_PAGE_SIZE) : null;
}

export function publicFootballSitemap(snapshot: PublicSnapshot, _now = new Date(), segment?: string): string | null {
  const paths = publicSitemapUrls(snapshot, segment);
  if (!paths) return null;
  // checkedAt records verification, not necessarily a material change. Do not invent lastmod dates.
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${escapeXml(PUBLIC_ORIGIN + path)}</loc></url>`).join('')}</urlset>`;
}
