import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createPublicFootballHandler } from '../server/publicFootball/http.ts';
import { publicDirectory, publicTeamSummary } from '../server/publicFootball/directory.ts';
import { snapshotFromMatches } from '../server/publicFootball/store.ts';
import { buildPublicFootballPage } from '../server/publicFootball/model.ts';
import { publicFootballRoute } from '../server/publicFootball/routes.ts';
import { pairPath, publicTeamSlug } from '../server/publicFootball/paths.ts';
import { publicFootballSitemap, publicSitemapIndex, publicSitemapSegments, publicSitemapUrls } from '../server/publicFootball/sitemaps.ts';
import { siteMetadata, APP_PATHS } from '../src/seo/siteMetadata.ts';
import type { PublicMatch, PublicSnapshot } from '../src/types/publicFootball.ts';

const now = new Date('2026-11-22T10:00:00Z');
let sequence = 0;
const match = (extra: Partial<PublicMatch> = {}): PublicMatch => ({ id: (++sequence).toString(16).padStart(32, '0'),
  league: { slug: 'england-premier-league', name: 'Premier League', country: 'England' }, season: '2026/27',
  date: '2026-11-20', time: '20:00', kickoffAt: '2026-11-20T19:00:00Z', homeTeam: 'Arsenal', awayTeam: 'Chelsea',
  status: 'finished', ht: { home: 0, away: 1 }, ft: { home: 2, away: 1 }, checkedAt: now.toISOString(), sources: ['openfootball'], ...extra });
const rows = [match(), match({ homeTeam: 'Chelsea', awayTeam: 'Arsenal', date: '2026-11-18', ft: { home: 1, away: 1 }, ht: { home: 0, away: 0 } }),
  match({ date: '2026-11-22', kickoffAt: '2026-11-22T19:00:00Z', status: 'scheduled', ft: { home: null, away: null }, ht: { home: null, away: null } }),
  match({ homeTeam: 'Other Club', awayTeam: 'Chelsea', date: '2026-11-19', ft: { home: 0, away: 3 }, ht: { home: null, away: null } })];
const snapshot = snapshotFromMatches(rows, now);
const params = (value: Record<string, string> = {}) => new URLSearchParams(value);
const page = (type: Parameters<typeof buildPublicFootballPage>[1], input: Record<string, string> = {}, value = snapshot) => buildPublicFootballPage(value, type, params(input), now);
async function call(url: string, value = snapshot, method = 'GET') {
  let reads = 0;
  const response = { statusCode: 0, headers: {} as Record<string, string>, body: '',
    setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value; }, end(body = '') { this.body = body; } };
  await createPublicFootballHandler(async () => { reads++; return value; }, () => now)({ url, method } as any, response as any);
  return { ...response, reads };
}

test('team directories are derived only from real public participants and separate countries without generating matches', () => {
  const foreign = match({ league: { slug: 'germany-bundesliga', name: 'Bundesliga', country: 'Germany' } });
  const value = snapshotFromMatches([...rows, foreign], now), before = JSON.stringify(value);
  const directory = publicDirectory(value);
  assert.ok(directory.teamBySlug.has('england-arsenal'));
  assert.ok(directory.teamBySlug.has('germany-arsenal'));
  assert.equal(directory.teamBySlug.has('serbia-partizan'), false);
  assert.equal(directory.pairByKey.size, 3);
  assert.equal(publicDirectory(value), directory, 'one cached directory per immutable snapshot');
  assert.equal(JSON.stringify(value), before);
});

test('team statistics use actual results and attribute made/conceded comebacks to the correct side', () => {
  const directory = publicDirectory(snapshot), arsenal = directory.teamBySlug.get('england-arsenal')!, chelsea = directory.teamBySlug.get('england-chelsea')!;
  const home = publicTeamSummary(snapshot.matches, arsenal, now), away = publicTeamSummary(snapshot.matches, chelsea, now);
  assert.deepEqual([home.played, home.won, home.drawn, home.lost, home.goalsFor, home.goalsAgainst], [2, 1, 1, 0, 3, 2]);
  assert.equal(home.madeComebacks, 1); assert.equal(home.concededComebacks, 0);
  assert.equal(away.madeComebacks, 0); assert.equal(away.concededComebacks, 1);
  assert.equal(home.form5.sample, 2); assert.equal(home.htftSample, 2);
  assert.equal(away.form5.sample, 3); assert.equal(away.htftSample, 2);
  assert.equal(home.form10.expected, 10);
});

test('team pages do not borrow or truncate the opponent form to this team historical meetings', () => {
  const data = page('team', { slug: 'england-arsenal' });
  assert.equal(data.teamSummary?.played, 2);
  assert.equal(data.rows[0].away.sample, 3);
  assert.equal(data.rows[0].home.sample, 2);
  assert.equal(data.resultsTotal, 2);
  assert.equal(data.results.some(row => row.homeTeam === 'Other Club'), false);
});

test('new SSR pages include real names, statistics, canonical/breadcrumb metadata and navigable related pages', async () => {
  const response = await call('/statistika/england-arsenal');
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /^text\/html/);
  assert.match(response.body, /<h1>Arsenal/);
  assert.ok(response.body.includes('Napravljen potpuni preokret'));
  assert.ok(response.body.includes('https://eliteviptips.com/statistika/england-arsenal'));
  assert.ok(response.body.includes('BreadcrumbList'));
  assert.ok(response.body.includes('SportsTeam'));
  assert.ok(response.body.includes('/fudbal/lige/england-premier-league'));
  assert.ok(response.body.includes('index,follow'));
  assert.equal(response.body.includes('src/main.tsx'), false);
  assert.equal(response.body.includes('firebase'), false);
  const matchPage = await call(`/fudbal/utakmice/${rows[0].id}`);
  assert.ok(matchPage.body.includes('/statistika/england-arsenal'));
  assert.ok(matchPage.body.includes('/h2h/england-arsenal/england-chelsea'));
});

test('H2H is restricted to recorded pairs and reversed URLs redirect to one canonical page', async () => {
  const response = await call('/h2h/england-arsenal/england-chelsea');
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes('2 završenih međusobnih susreta'));
  const reversed = await call('/h2h/england-chelsea/england-arsenal');
  assert.equal(reversed.statusCode, 301);
  assert.equal(reversed.headers.location, '/h2h/england-arsenal/england-chelsea');
  assert.equal((await call('/h2h/england-arsenal/england-other-club')).statusCode, 404);
  assert.equal((await call('/statistika/partizan')).statusCode, 404);
});

test('daily public analysis uses Serbia today and never publishes predictions, prices or AI analysis', async () => {
  const response = await call('/analize-danas?from=2026-11-23&to=2026-11-23');
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes('22.11.2026.'));
  const data = page('today');
  assert.equal(data.total, 1);
  assert.ok(data.rows.every(row => row.match.date === '2026-11-22'));
  assert.ok(!JSON.stringify(data).includes('vipAnalysis'));
  assert.ok(!JSON.stringify(data).includes('prediction'));
  assert.ok(!JSON.stringify(data).includes('odds'));
  const midnight = buildPublicFootballPage(snapshot, 'today', params(), new Date('2026-11-21T23:30:00Z'));
  assert.equal(midnight.today, '2026-11-22');
});

test('directories and independent results/schedule pagination stay bounded and distinguish filters from canonical pages', async () => {
  const values = snapshotFromMatches(Array.from({ length: 65 }, (_, index) => match({ homeTeam: `Home ${index}`, awayTeam: `Away ${index}` })), now);
  const first = page('teams', {}, values), next = page('teams', { offset: '30' }, values);
  assert.equal(first.teams!.length, 30); assert.equal(first.directoryMore, true);
  assert.equal(next.teams!.length, 30); assert.notEqual(first.teams![0].slug, next.teams![0].slug);
  const filtered = await call('/timovi?search=Arsenal');
  assert.ok(filtered.body.includes('noindex,follow'));
  const league = page('league', { slug: 'england-premier-league', offset: '30' }, values);
  assert.equal(league.results.length, 30); assert.notEqual(league.results[0].id, page('league', { slug: 'england-premier-league' }, values).results[0].id);
});

test('sitemap index/shards cover all actual public fixtures, not only 600 recent rows, without fake modification dates', () => {
  const values = snapshotFromMatches(Array.from({ length: 1205 }, (_, index) => match({ date: index % 2 ? '2023-08-01' : '2026-11-20' })), now);
  const index = publicSitemapIndex(values);
  assert.ok(index.includes('<sitemapindex'));
  assert.ok(index.includes('/sitemaps/utakmice-2.xml'));
  const segments = publicSitemapSegments(values);
  const urls = segments.flatMap(segment => publicSitemapUrls(values, segment)!);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter(url => url.startsWith('/fudbal/utakmice/')).length, 1205);
  assert.ok(urls.includes('/statistika/england-arsenal'));
  assert.ok(urls.includes('/h2h/england-arsenal/england-chelsea'));
  for (const segment of segments) assert.ok(publicSitemapUrls(values, segment)!.length <= 1000);
  assert.equal(publicFootballSitemap(values, now, 'utakmice-999'), null);
  assert.equal(/<lastmod>|admin|checkout|token|prediction/.test(publicFootballSitemap(values, now, 'utakmice-1')!), false);
});

test('sitemap, aliases and real 404 responses are read-only and reject mutations before opening data', async () => {
  assert.match((await call('/sitemap.xml')).body, /<sitemapindex/);
  assert.match((await call('/sitemaps/utakmice-1.xml')).headers['content-type'], /^application\/xml/);
  assert.equal((await call('/sitemaps/utakmice-999.xml')).statusCode, 404);
  const alias = await call('/lige/premier-league');
  assert.equal(alias.statusCode, 301); assert.equal(alias.headers.location, '/fudbal/lige/england-premier-league');
  const missing = await call('/api/public-football?page=not-found');
  assert.equal(missing.statusCode, 404); assert.equal(missing.reads, 0); assert.ok(missing.body.includes('noindex,follow'));
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const response = await call('/statistika/england-arsenal', snapshot, method);
    assert.equal(response.statusCode, 405); assert.equal(response.reads, 0);
  }
});

test('path-derived entity routes cannot be changed into another page by query action manipulation', async () => {
  const response = await call('/statistika/england-arsenal?page=match&id=' + rows[0].id + '&action=sync');
  assert.equal(response.statusCode, 200); assert.ok(response.body.includes('<h1>Arsenal'));
  assert.equal(publicFootballRoute('/statistika/../users'), null);
  assert.equal(publicTeamSlug('Arsenal', 'England'), 'england-arsenal');
  assert.equal(pairPath({ slug: 'z' }, { slug: 'a' }), '/h2h/a/z');
});

test('existing SPA pages keep routes, private noindex rules and nine serverless functions', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const fallback = config.rewrites.findIndex((rule: any) => rule.destination.includes('page=not-found'));
  assert.ok(config.rewrites.findIndex((rule: any) => rule.source === '/statistika/:slug') < fallback);
  assert.equal(siteMetadata('/').noindex, false);
  assert.equal(siteMetadata('/history').noindex, false);
  assert.equal(siteMetadata('/stats').noindex, false);
  assert.equal(siteMetadata('/tickets', '?active=1').noindex, true);
  for (const path of ['/login', '/register', '/checkout', '/admin', '/dashboard', '/daily-tips', '/vip-tips']) assert.equal(siteMetadata(path).noindex, true);
  const publicPages = /^\/(contact|faq|terms|bankroll-management|daily-analysis|early-information|history|stats)$/;
  const shell = config.rewrites.find((rule: any) => rule.destination === '/app.html' && rule.source.includes(':page('));
  const shellPattern = new RegExp('^' + shell.source.replace(':page(', '(?:') + '$');
  for (const path of APP_PATHS) assert.ok(path === '/' || path === '/__/auth/action' || publicPages.test(path) || shellPattern.test(path), `Missing SPA route: ${path}`);
  assert.equal(readdirSync(new URL('../api/', import.meta.url)).filter(name => name.endsWith('.ts')).length, 9);
});
