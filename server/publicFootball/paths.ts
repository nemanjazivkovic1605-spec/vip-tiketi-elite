import type { PublicMatch, PublicTeam } from '../../src/types/publicFootball.js';

export const PUBLIC_ORIGIN = 'https://eliteviptips.com';
export const publicSlug = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const publicTeamSlug = (name: string, country: string) => `${publicSlug(country)}-${publicSlug(name)}`;
export const matchPath = (match: Pick<PublicMatch, 'id'>) => `/fudbal/utakmice/${match.id}`;
export const leaguePath = (slug: string) => `/fudbal/lige/${slug}`;
export const teamPath = (team: Pick<PublicTeam, 'slug'>) => `/statistika/${team.slug}`;
export const pairPath = (first: Pick<PublicTeam, 'slug'>, second: Pick<PublicTeam, 'slug'>) =>
  `/h2h/${[first.slug, second.slug].sort().join('/')}`;
