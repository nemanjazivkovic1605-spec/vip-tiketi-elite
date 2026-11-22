export function publicFootballRoute(path: string): Record<string, string> | null {
  const staticPages: Record<string, string> = { '/fudbal': 'overview', '/match-finder': 'finder', '/timovi': 'teams', '/h2h': 'h2h', '/analize-danas': 'today', '/sitemap.xml': 'sitemap' };
  if (staticPages[path]) return { page: staticPages[path] };
  let match = path.match(/^\/fudbal\/lige\/([a-z0-9-]{1,100})$/);
  if (match) return { page: 'league', slug: match[1] };
  match = path.match(/^\/fudbal\/utakmice\/([a-f0-9]{32})$/);
  if (match) return { page: 'match', id: match[1] };
  match = path.match(/^\/statistika\/([a-z0-9-]{1,160})$/);
  if (match) return { page: 'team', slug: match[1] };
  match = path.match(/^\/h2h\/([a-z0-9-]{1,160})\/([a-z0-9-]{1,160})$/);
  if (match) return { page: 'pair', first: match[1], second: match[2] };
  match = path.match(/^\/sitemaps\/((?:stranice|lige|timovi|h2h|utakmice)-[1-9]\d{0,3})\.xml$/);
  if (match) return { page: 'sitemap', segment: match[1] };
  match = path.match(/^\/lige\/([a-z0-9-]{1,100})$/);
  if (match) return { page: 'league-alias', slug: match[1] };
  match = path.match(/^\/utakmice\/([a-f0-9]{32})$/);
  if (match) return { page: 'match-alias', id: match[1] };
  return null;
}
