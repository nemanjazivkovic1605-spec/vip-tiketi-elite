const UNKNOWN_LEAGUE = 'Nepoznata liga';

const LEAGUE_NAMES: Record<string, string> = {
  E0: 'Premier League',
  E1: 'Championship',
  E2: 'League One',
  E3: 'League Two',
  EC: 'National League',
  SP1: 'La Liga',
  SP2: 'Primera Federación',
  I1: 'Serie A',
  I2: 'Serie B',
  D1: 'Bundesliga',
  D2: '2. Bundesliga',
  F1: 'Ligue 1',
  F2: 'Ligue 2',
  N1: 'Eredivisie',
  P1: 'Primeira Liga',
  B1: 'Belgian Pro League',
  T1: 'Süper Lig',
  G1: 'Super League Greece',
  SC0: 'Scottish Premiership',
  SC1: 'Scottish Championship',
  SC2: 'Scottish League One',
  SC3: 'Scottish League Two',
  PL: 'Premier League',
  ELC: 'Championship',
  PD: 'La Liga',
  SA: 'Serie A',
  BL1: 'Bundesliga',
  FL1: 'Ligue 1',
  CL: 'UEFA Champions League',
  DED: 'Eredivisie',
  PPL: 'Primeira Liga',
  BSA: 'Campeonato Brasileiro Série A',
  CLI: 'Copa Libertadores',
};

const HIDDEN_SOURCE_LABELS = new Set([
  'soccerbase results',
  'imported league',
  'football',
  'unknown',
  'n/a',
]);

const PUBLIC_ACRONYMS = new Set([
  'NBA',
  'WNBA',
  'NCAA',
  'FIBA',
  'ACB',
  'ABA',
]);

const INTERNAL_CODE_PATTERN = /^[A-Z]{1,4}\d{0,2}$/;

export const formatLeagueName = (league?: string | null) => {
  const value = String(league || '').trim();
  if (!value || HIDDEN_SOURCE_LABELS.has(value.toLowerCase())) return UNKNOWN_LEAGUE;

  const [base, ...suffixParts] = value.split(/\s*·\s*/);
  const normalizedBase = base.trim().toUpperCase();
  const mapped = LEAGUE_NAMES[normalizedBase];
  if (mapped) {
    const suffix = suffixParts.join(' · ').trim();
    return suffix ? `${mapped} · ${suffix}` : mapped;
  }

  if (INTERNAL_CODE_PATTERN.test(normalizedBase) && !PUBLIC_ACRONYMS.has(normalizedBase)) {
    return UNKNOWN_LEAGUE;
  }

  return value;
};

export const isUnknownLeague = (league?: string | null) =>
  formatLeagueName(league) === UNKNOWN_LEAGUE;

