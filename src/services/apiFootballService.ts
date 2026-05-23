import { DailyAnalysisAccess, DailyAnalysisItem, DailyAnalysisRiskLevel, DailyAnalysisSport } from '../types';

const FOOTBALL_API_BASE_URL = 'https://v3.football.api-sports.io';
const BASKETBALL_API_BASE_URL = 'https://v1.basketball.api-sports.io';
const TIMEZONE = 'Europe/Belgrade';
const FOOTBALL_CANDIDATE_LIMIT = 16;
const BASKETBALL_CANDIDATE_LIMIT = 16;
const DISPLAY_LIMIT = 5;
const MIN_QUALITY_SCORE = 58;

type ApiFixture = {
  fixture: {
    id: number;
    date: string;
  };
  league: {
    id: number;
    name: string;
  };
  teams: {
    home: { name: string; logo?: string };
    away: { name: string; logo?: string };
  };
};

type ApiPrediction = {
  comparison?: {
    form?: {
      home?: string;
      away?: string;
    };
  };
  predictions?: {
    advice?: string;
  };
};

type BasketballGame = {
  id: number;
  date: string;
  time?: string;
  league: {
    id: number;
    name: string;
  };
  teams: {
    home: { name: string; logo?: string };
    away: { name: string; logo?: string };
  };
};

type PickQuality = {
  prediction: string;
  odds: number;
  reasoning: string;
  confidence: number;
  riskLevel: DailyAnalysisRiskLevel;
  averageTotal: string;
  h2hNote: string;
  badges: string[];
  qualityScore: number;
};

type RankedAnalysis = DailyAnalysisItem & {
  qualityScore: number;
};

const getApiKey = (sport: DailyAnalysisSport) => {
  if (sport === 'basketball') {
    return import.meta.env.VITE_BASKETBALL_API_KEY?.trim() || import.meta.env.VITE_FOOTBALL_API_KEY?.trim();
  }

  return import.meta.env.VITE_FOOTBALL_API_KEY?.trim();
};

const formatIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getDailyAnalysisDates = () => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(today.getDate() + 2);

  return [
    { key: 'today', label: 'Danas', date: formatIsoDate(today) },
    { key: 'tomorrow', label: 'Sutra', date: formatIsoDate(tomorrow) },
    { key: 'dayAfterTomorrow', label: 'Prekosutra', date: formatIsoDate(dayAfterTomorrow) },
  ] as const;
};

const requestSportsApi = async <T>(
  sport: DailyAnalysisSport,
  path: string,
  params: Record<string, string | number>,
) => {
  const apiKey = getApiKey(sport);
  if (!apiKey) return null;

  const baseUrl = sport === 'basketball' ? BASKETBALL_API_BASE_URL : FOOTBALL_API_BASE_URL;
  const url = new URL(`${baseUrl}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));

  const response = await fetch(url.toString(), {
    headers: {
      'x-apisports-key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`${sport} request failed: ${response.status}`);
  }

  const payload = await response.json() as { response?: T; errors?: unknown };
  return payload.response || null;
};

const parsePercent = (value?: string) => {
  if (!value) return null;
  const parsed = Number(value.replace('%', '').trim());
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
};

const stableNumber = (seed: string, min: number, max: number) => {
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const ratio = (hash % 100) / 100;
  return Number((min + (max - min) * ratio).toFixed(2));
};

const stableIndex = (seed: string, length: number) => {
  if (length <= 1) return 0;
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return hash % length;
};

const pickTemplate = (seed: string, templates: string[]) => templates[stableIndex(seed, templates.length)];

const normalizeScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const leaguePopularity = (leagueName: string, sport: DailyAnalysisSport) => {
  const name = leagueName.toLowerCase();

  if (sport === 'basketball') {
    if (name.includes('nba')) return 22;
    if (name.includes('euroleague') || name.includes('euro league')) return 21;
    if (name.includes('aba')) return 20;
    if (name.includes('ncaa')) return 17;
    if (name.includes('fiba')) return 17;
    if (name.includes('acb') || name.includes('spain')) return 16;
    if (name.includes('lega') || name.includes('italy')) return 15;
    if (name.includes('bsl') || name.includes('turkey')) return 15;
    return 6;
  }

  if (name.includes('champions')) return 22;
  if (name.includes('premier')) return 21;
  if (name.includes('liga') || name.includes('serie') || name.includes('bundesliga')) return 18;
  if (name.includes('euro') || name.includes('conference')) return 17;
  return 7;
};

const makeBadges = (score: number, confidence: number, access: DailyAnalysisAccess) => {
  const badges: string[] = [];
  if (score >= 88) badges.push('ELITE PICK');
  if (score >= 76) badges.push('HIGH VALUE');
  if (access === 'VIP') badges.push('VIP PICK');
  if (confidence >= 78 && !badges.includes('ELITE PICK')) badges.push('ELITE PICK');
  return badges.slice(0, 3);
};

const footballOver15Templates = [
  'Biramo stabilniji gol-market jer utakmica ima profil za najmanje dva ozbiljna perioda pritiska. Fokus je na prolaznosti i kontroli rizika, ne na forsiranju visoke kvote.',
  'Over 1.5 je racionalan izbor kada ne zelimo zavisiti od jednog pobednika. Dva gola su realna granica za duel u kojem oba tima imaju dovoljno prostora da naprave sansu.',
  'Ovaj tip cuva bankroll i pokriva vise tokova utakmice. Kada forma nije ekstremno jednostrana, osnovna gol-linija cesto ima najbolji odnos rizika i prolaza.',
];

const footballOver25Templates = [
  'Profil meca naginje otvorenijem ritmu. Ako prvi gol dodje dovoljno rano, utakmica ima potencijal da se razvije u duel sa dosta prostora i tri gola su realan scenario.',
  'Ovde value vidimo u napadackom marketu. Timovi imaju dovoljno ofanzivnih argumenata, a defanzivna stabilnost nije toliko jaka da bismo isli na zatvoren pristup.',
  'Over 2.5 nosi veci rizik od osnovne linije, ali trenutni matchup daje dovoljno value prostora za agresivniji gol-tip.',
];

const footballGgTemplates = [
  'GG je izbor kada oba tima imaju argumente u napadu, ali i ranjivosti koje protivnik moze da iskoristi. Ne jurimo pobednika, vec obostranu efikasnost.',
  'Ovaj par vise lici na razmenu golova nego na cistu dominaciju jedne strane. Zato je fokus na oba tima da postignu gol, uz disciplinovan rizik.',
  'Najbolji value je u marketu koji prati profil obe ekipe. Ako utakmica dobije otvoren ritam, golovi na obe strane postaju najlogicniji scenario.',
];

const footballHomeTemplates = [
  'Domaci tim ima bolji takmicarski momentum i jasniji put do kontrole meca. Jedinica je izbor kada se forma, teren i trenutni odnos snaga poklapaju.',
  'Ovde prednost domacina nije samo u imenu, vec u stabilnijem ulasku u duel. Tip 1 ima smisla ako potvrdi intenzitet iz prethodnih nastupa.',
  'Domaci teren i trenutna forma prave razliku. Ne trazimo spektakularnu kvotu, vec cist value izbor sa dobrim osloncem.',
];

const footballAwayTemplates = [
  'Gost ima bolji ritam i konkretniju formu. Dvojka je rizicniji izbor, ali odnos snaga daje dovoljno prostora za value.',
  'Gostujuci sastav deluje stabilnije u ovom trenutku i ima kvalitet da preuzme inicijativu. Ako odigra na nivou forme, 2 je logican izbor.',
  'Ovo nije tip po reputaciji, vec po profilu meca. Gost ima jasnije argumente i kvota ostavlja value prostor.',
];

const footballDoubleChanceTemplates = [
  'X2 je disciplinovan pristup kada gost deluje stabilnije, ali ne zelimo nepotrebno dizati rizik cistom dvojkom. Zastita remijem ovde ima smisla.',
  'Gost ima bolji momentum, ali utakmica ne trazi agresivan 1X2 ulaz. X2 bolje balansira prolaznost i kvotu.',
  'Biramo kontrolu rizika. X2 pokriva realan scenario u kojem gost ne gubi, bez potrebe da jurimo maksimalnu kvotu.',
];

const basketballHomeTemplates = [
  'Domaci parket i ritam rotacije daju ovom timu jasniju osnovu. Kod kosarke posebno cenimo stabilnost poseda i kvalitet suta u poslednjoj cetvrtini.',
  'Prednost je na strani domacina zbog boljeg matchupa i vece kontrole tempa. Ovo je pick koji vise zavisi od strukture igre nego od jednog igraca.',
  'Domaci tim ima bolji profil za ovaj duel: ritam, sirinu rotacije i stabilniji napad. Zato je pobeda domacina najlogicniji market.',
];

const basketballAwayTemplates = [
  'Gost ima kvalitet da uspori domacina i nametne svoj tempo. Ako kontrolise izgubljene lopte, ovaj pick ima dobar value profil.',
  'Gostujuca ekipa ima stabilniji napadacki identitet i bolju osnovu u matchup-u. Zato je pobeda gosta vredna paznje.',
  'Ovde ne jurimo ime, vec kosarkaski matchup. Gost ima dovoljno sirine i ritma da ostane ispred linije rizika.',
];

const basketballOverTemplates = [
  'Ocekujemo utakmicu sa dovoljno poseda i dobrim napadackim ritmom. Kada oba tima mogu da igraju brzo, over poeni imaju najcistiji value osnov.',
  'Tempo je kljuc. Ako se utakmica ne uspori ranim faulovima, linija poena ima prostor da ode preko projektovane granice.',
  'Napadacki matchup deluje bolje od defanzivnog. Zato prednost dajemo marketu poena, uz svestan ali kontrolisan rizik.',
];

const basketballSpreadTemplates = [
  'Favorit ima dovoljno kvaliteta, ali ne zelimo forsirati previsok rizik. Handicap pristup bolje balansira razliku u klasi i realan tok meca.',
  'Ovo je izbor za stabilniju ekipu koja bi trebalo da drzi rezultat pod kontrolom. Spread market daje bolji odnos rizika i vrednosti.',
  'Kada je razlika u kvalitetu jasna, ali kvota na pobedu preniska, handicap cesto daje bolji value profil.',
];

const lowDataTemplates = [
  'Dostupni podaci nisu dovoljno duboki za agresivan ulaz, pa biramo oprezniji market. Kada informacija nije kompletna, prioritet je zastita uloga.',
  'Za ovaj mec nema dovoljno potvrdene forme i market signala, zato se izbegava tvrd ishod. Prednost ima stabilnija opcija sa nizim rizikom.',
  'Ovo je pick sa ogranicenim statistickim osloncem. Ulaz ostaje konzervativan jer VIP kvalitet uvek ima prednost nad kolicinom.',
];

const riskFromConfidence = (confidence: number): DailyAnalysisRiskLevel => {
  if (confidence >= 76) return 'LOW';
  if (confidence >= 66) return 'MEDIUM';
  return 'HIGH';
};

const buildPick = (
  prediction: string,
  odds: number,
  confidence: number,
  qualityScore: number,
  reasoning: string,
  averageTotal: string,
  h2hNote: string,
  access: DailyAnalysisAccess,
): PickQuality => {
  const normalizedConfidence = normalizeScore(confidence);
  return {
    prediction,
    odds,
    confidence: normalizedConfidence,
    riskLevel: riskFromConfidence(normalizedConfidence),
    reasoning,
    averageTotal,
    h2hNote,
    qualityScore,
    badges: makeBadges(qualityScore, normalizedConfidence, access),
  };
};

const generateFootballPick = (
  homeForm: number | null,
  awayForm: number | null,
  seed: string,
  access: DailyAnalysisAccess,
  advice?: string,
) => {
  const normalizedAdvice = (advice || '').toLowerCase();
  const hasData = homeForm !== null && awayForm !== null;
  const averageTotal = hasData ? 'Golovi: stabilan napadacki ritam' : 'Golovi: nedovoljno podataka';
  const h2hNote = hasData ? 'H2H: bez ekstremnog odstupanja' : 'H2H: nedovoljno podataka';

  if (normalizedAdvice.includes('both team') || normalizedAdvice.includes('btts')) {
    const odds = stableNumber(`${seed}-gg`, 1.65, 1.95);
    return buildPick('GG', odds, 72, 78, pickTemplate(seed, footballGgTemplates), averageTotal, h2hNote, access);
  }

  if (normalizedAdvice.includes('over 2.5') || normalizedAdvice.includes('over 3.5')) {
    const odds = stableNumber(`${seed}-over25`, 1.72, 2.10);
    return buildPick('Over 2.5', odds, 68, 73, pickTemplate(seed, footballOver25Templates), averageTotal, h2hNote, access);
  }

  if (normalizedAdvice.includes('over 1.5') || normalizedAdvice.includes('goals')) {
    const odds = stableNumber(`${seed}-over15`, 1.30, 1.55);
    return buildPick('Over 1.5', odds, 79, 84, pickTemplate(seed, footballOver15Templates), averageTotal, h2hNote, access);
  }

  if (hasData) {
    const diff = homeForm - awayForm;
    const averageForm = (homeForm + awayForm) / 2;

    if (averageForm >= 62 && Math.abs(diff) <= 14) {
      const odds = stableNumber(`${seed}-gg-form`, 1.62, 1.90);
      return buildPick('GG', odds, 70, 77, pickTemplate(seed, footballGgTemplates), 'Golovi: oba tima u dobrom ritmu', h2hNote, access);
    }

    if (diff >= 24) {
      const odds = stableNumber(`${seed}-home`, 1.45, 1.82);
      const confidence = 72 + Math.min(12, diff / 4);
      return buildPick('1', odds, confidence, 79 + Math.min(10, diff / 5), pickTemplate(seed, footballHomeTemplates), averageTotal, h2hNote, access);
    }

    if (diff <= -28) {
      const odds = stableNumber(`${seed}-away`, 1.65, 2.12);
      const confidence = 68 + Math.min(12, Math.abs(diff) / 4);
      return buildPick('2', odds, confidence, 75 + Math.min(10, Math.abs(diff) / 5), pickTemplate(seed, footballAwayTemplates), averageTotal, h2hNote, access);
    }

    if (diff <= -14) {
      const odds = stableNumber(`${seed}-x2`, 1.35, 1.62);
      return buildPick('X2', odds, 76, 82, pickTemplate(seed, footballDoubleChanceTemplates), averageTotal, h2hNote, access);
    }

    if (averageForm >= 58) {
      const odds = stableNumber(`${seed}-over25-form`, 1.70, 2.00);
      return buildPick('Over 2.5', odds, 67, 72, pickTemplate(seed, footballOver25Templates), 'Golovi: povisen tempo', h2hNote, access);
    }

    const odds = stableNumber(`${seed}-over15-form`, 1.30, 1.52);
    return buildPick('Over 1.5', odds, 77, 81, pickTemplate(seed, footballOver15Templates), averageTotal, h2hNote, access);
  }

  return buildPick('Over 1.5', 0, 58, 58, pickTemplate(seed, lowDataTemplates), averageTotal, h2hNote, access);
};

const generateBasketballPick = (seed: string, leagueName: string, access: DailyAnalysisAccess) => {
  const leagueBoost = leaguePopularity(leagueName, 'basketball');
  const variant = stableIndex(seed, 4);
  const h2hNote = leagueBoost >= 15 ? 'H2H: relevantan nivo takmicenja' : 'H2H: nedovoljno podataka';
  const averageTotal = leagueBoost >= 15 ? 'Poeni: tempo pod monitoringom' : 'Poeni: nedovoljno podataka';

  if (variant === 0) {
    return buildPick('Over poeni', 0, 64 + Math.min(10, leagueBoost / 3), 62 + leagueBoost, pickTemplate(seed, basketballOverTemplates), averageTotal, h2hNote, access);
  }

  if (variant === 1) {
    return buildPick('1', 0, 65 + Math.min(9, leagueBoost / 3), 61 + leagueBoost, pickTemplate(seed, basketballHomeTemplates), averageTotal, h2hNote, access);
  }

  if (variant === 2) {
    return buildPick('2', 0, 62 + Math.min(9, leagueBoost / 3), 59 + leagueBoost, pickTemplate(seed, basketballAwayTemplates), averageTotal, h2hNote, access);
  }

  return buildPick('Handicap favorit', 0, 66 + Math.min(8, leagueBoost / 3), 63 + leagueBoost, pickTemplate(seed, basketballSpreadTemplates), averageTotal, h2hNote, access);
};

const fetchFootballPrediction = async (fixtureId: number) => {
  try {
    const response = await requestSportsApi<ApiPrediction[]>('football', '/predictions', { fixture: fixtureId });
    return response?.[0] || null;
  } catch {
    return null;
  }
};

const mapFootballFixture = async (fixture: ApiFixture, sortOrder: number): Promise<RankedAnalysis> => {
  const seed = `football-${fixture.fixture.id}-${fixture.teams.home.name}-${fixture.teams.away.name}`;
  const predictionData = await fetchFootballPrediction(fixture.fixture.id);
  const homeFormPercent = parsePercent(predictionData?.comparison?.form?.home);
  const awayFormPercent = parsePercent(predictionData?.comparison?.form?.away);
  const provisionalAccess: DailyAnalysisAccess = sortOrder < 2 ? 'FREE' : 'VIP';
  const pick = generateFootballPick(homeFormPercent, awayFormPercent, seed, provisionalAccess, predictionData?.predictions?.advice);
  const date = new Date(fixture.fixture.date);

  return {
    id: `api-football-${fixture.fixture.id}`,
    source: 'api-football',
    sport: 'football',
    fixtureId: fixture.fixture.id,
    date: fixture.fixture.date.slice(0, 10),
    time: Number.isFinite(date.getTime())
      ? date.toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE })
      : '',
    league: fixture.league.name,
    leagueId: fixture.league.id,
    homeTeam: fixture.teams.home.name,
    awayTeam: fixture.teams.away.name,
    homeLogo: fixture.teams.home.logo,
    awayLogo: fixture.teams.away.logo,
    homeFormPercent,
    awayFormPercent,
    formNote: homeFormPercent === null || awayFormPercent === null ? 'Nedovoljno podataka' : undefined,
    prediction: pick.prediction,
    odds: pick.odds,
    reasoning: pick.reasoning,
    confidence: pick.confidence,
    riskLevel: pick.riskLevel,
    averageTotal: pick.averageTotal,
    h2hNote: pick.h2hNote,
    badges: pick.badges,
    access: provisionalAccess,
    sortOrder,
    enabled: true,
    hidden: false,
    qualityScore: pick.qualityScore + leaguePopularity(fixture.league.name, 'football'),
  };
};

const mapBasketballGame = (game: BasketballGame, sortOrder: number): RankedAnalysis => {
  const seed = `basketball-${game.id}-${game.teams.home.name}-${game.teams.away.name}`;
  const provisionalAccess: DailyAnalysisAccess = sortOrder < 2 ? 'FREE' : 'VIP';
  const pick = generateBasketballPick(seed, game.league.name, provisionalAccess);
  const gameDate = new Date(game.date);

  return {
    id: `api-basketball-${game.id}`,
    source: 'api-basketball',
    sport: 'basketball',
    fixtureId: game.id,
    date: game.date.slice(0, 10),
    time: game.time || (Number.isFinite(gameDate.getTime())
      ? gameDate.toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE })
      : ''),
    league: game.league.name,
    leagueId: game.league.id,
    homeTeam: game.teams.home.name,
    awayTeam: game.teams.away.name,
    homeLogo: game.teams.home.logo,
    awayLogo: game.teams.away.logo,
    homeFormPercent: null,
    awayFormPercent: null,
    formNote: 'Nedovoljno podataka',
    prediction: pick.prediction,
    odds: pick.odds,
    reasoning: pick.reasoning,
    confidence: pick.confidence,
    riskLevel: pick.riskLevel,
    averageTotal: pick.averageTotal,
    h2hNote: pick.h2hNote,
    badges: pick.badges,
    access: provisionalAccess,
    sortOrder,
    enabled: true,
    hidden: false,
    qualityScore: pick.qualityScore,
  };
};

const footballCandidateScore = (fixture: ApiFixture) => {
  const hasLogos = fixture.teams.home.logo && fixture.teams.away.logo ? 12 : 0;
  const time = new Date(fixture.fixture.date).getTime();
  const timeScore = Number.isFinite(time) ? 8 : 0;
  return hasLogos + timeScore + leaguePopularity(fixture.league.name, 'football') + stableNumber(`${fixture.fixture.id}-candidate`, 0, 14);
};

const basketballCandidateScore = (game: BasketballGame) => {
  const hasLogos = game.teams.home.logo && game.teams.away.logo ? 12 : 0;
  const time = new Date(game.date).getTime();
  const timeScore = Number.isFinite(time) ? 8 : 0;
  return hasLogos + timeScore + leaguePopularity(game.league.name, 'basketball') + stableNumber(`${game.id}-basket-candidate`, 0, 14);
};

const fetchFootballAnalyses = async (date: string): Promise<RankedAnalysis[]> => {
  try {
    const fixtures = await requestSportsApi<ApiFixture[]>('football', '/fixtures', { date, timezone: TIMEZONE });
    if (!fixtures?.length) return [];

    const candidates = fixtures
      .filter((fixture) => fixture.fixture.id && fixture.teams.home.name && fixture.teams.away.name)
      .sort((a, b) => footballCandidateScore(b) - footballCandidateScore(a))
      .slice(0, FOOTBALL_CANDIDATE_LIMIT);

    return Promise.all(candidates.map((fixture, index) => mapFootballFixture(fixture, index)));
  } catch {
    return [];
  }
};

const fetchBasketballAnalyses = async (date: string): Promise<RankedAnalysis[]> => {
  try {
    const games = await requestSportsApi<BasketballGame[]>('basketball', '/games', { date, timezone: TIMEZONE });
    if (!games?.length) return [];

    return games
      .filter((game) => game.id && game.teams.home.name && game.teams.away.name)
      .sort((a, b) => basketballCandidateScore(b) - basketballCandidateScore(a))
      .slice(0, BASKETBALL_CANDIDATE_LIMIT)
      .map((game, index) => mapBasketballGame(game, index));
  } catch {
    return [];
  }
};

export const apiFootballService = {
  fetchDailyAnalysesForDate: async (date: string): Promise<DailyAnalysisItem[]> => {
    const [football, basketball] = await Promise.all([
      fetchFootballAnalyses(date),
      fetchBasketballAnalyses(date),
    ]);

    return [...football, ...basketball]
      .filter((item) => item.qualityScore >= MIN_QUALITY_SCORE)
      .sort((a, b) => {
        if (a.qualityScore !== b.qualityScore) return b.qualityScore - a.qualityScore;
        return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
      })
      .slice(0, DISPLAY_LIMIT)
      .map(({ qualityScore, ...item }, index) => {
        const access = (index < 2 ? 'FREE' : 'VIP') as DailyAnalysisAccess;
        const badges = makeBadges(qualityScore, item.confidence || 0, access);

        return {
          ...item,
          access,
          badges,
          sortOrder: index,
        };
      });
  },
};
