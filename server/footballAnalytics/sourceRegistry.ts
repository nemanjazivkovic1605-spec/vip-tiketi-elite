import type { AnalyticsDatabase } from "./database.js";
import type {
  CoverageRow,
  SourceCapability,
  SourceCapabilityKey,
  SourcePermission,
  SourceRegistryEntry,
} from "../../src/types/footballAnalytics.js";

type SourceRights = SourceRegistryEntry["rights"];
type SourceDefinition = Omit<
  SourceRegistryEntry,
  | "configured"
  | "status"
  | "checkedAt"
  | "lastSuccessfulSync"
  | "dataAgeHours"
  | "enabled"
  | "canEnable"
  | "enableBlockReason"
  | "usage"
  | "coverage"
  | "reliability"
> & {
  environmentKeys: string[];
  coverageProviders: string[];
  defaultInternalEnabled: boolean;
  defaultPublicEnabled: boolean;
};

const no = "not_supported" satisfies SourceCapability;
const unknown = "not_verified" satisfies SourceCapability;
const yes = "supported" satisfies SourceCapability;
const partial = "partial" satisfies SourceCapability;
const capabilities = (values: Partial<Record<SourceCapabilityKey, SourceCapability>>) => ({
  fixtures: values.fixtures || unknown,
  ft: values.ft || unknown,
  ht: values.ht || unknown,
  h2h: values.h2h || unknown,
  xg: values.xg || unknown,
  xga: values.xga || unknown,
  odds: values.odds || unknown,
  statistics: values.statistics || unknown,
});
const rights = (
  licenseStatus: SourceRights["licenseStatus"],
  internalUse: SourcePermission,
  publicDisplay: SourcePermission,
  commercialUse: SourcePermission,
  redistribution: SourcePermission,
  conditions: string[] = [],
  attribution: string | null = null,
  termsUrl: string | null = null,
): SourceRights => ({
  licenseStatus,
  internalUse,
  publicDisplay,
  commercialUse,
  redistribution,
  attribution,
  conditions,
  termsUrl,
});

// Registry facts are conservative. Registration never enables a provider by itself.
export const DATA_SOURCE_REGISTRY: SourceDefinition[] = [
  {
    id: "openfootball", name: "OpenFootball", url: "https://github.com/openfootball/football.json", format: "json",
    availability: "integrated", fields: ["raspored", "FT", "HT (delimično)"], tierCoverage: [1, 2, 3, 4],
    countries: ["England"], leagueCoverage: ["Premier League", "Championship", "League One", "League Two"],
    seasonCoverage: [], seasons: "Istorijski fajlovi po sezoni; potvrditi pojedinačni fajl i svežinu",
    capabilities: capabilities({ fixtures: yes, ft: yes, ht: partial, h2h: partial }),
    dailyLimit: null, monthlyLimit: null, rateLimit: "Staticki GitHub feed; ucitavati učtivo i kesirati",
    freePlanLimit: "Javni CC0 skup; nema objavljenog API budzeta", paidPlanLimit: "Nije primenljivo",
    cost: "free-feed", rightsStatus: "confirmed-open", license: "CC0-1.0",
    rights: rights("confirmed", "allowed", "allowed", "allowed", "allowed", [], "CC0-1.0", "https://github.com/openfootball/football.json/blob/master/LICENSE.md"),
    priority: 1, fallback: null,
    qualityNote: "HT nije garantovan; nema kvota, xG, xGA ni detaljnih statistika. Poslednji provereni fajlovi su zastareli.",
    environmentKeys: [], coverageProviders: ["openfootball"], defaultInternalEnabled: true, defaultPublicEnabled: true,
  },
  {
    id: "football-data.org", name: "football-data.org", url: "https://www.football-data.org/coverage", format: "api",
    availability: "integrated", fields: ["raspored", "FT", "HT gde postoji", "tabele"], tierCoverage: [1, 2],
    countries: ["England"], leagueCoverage: ["Premier League", "Championship"], seasonCoverage: [],
    seasons: "Po takmičenju i nalogu; proveriti katalog pre importa",
    capabilities: capabilities({ fixtures: yes, ft: yes, ht: partial, h2h: partial, statistics: partial }),
    dailyLimit: null, monthlyLimit: null, rateLimit: "Besplatni plan: 10 zahteva/min, do 12 takmičenja",
    freePlanLimit: "10 zahteva/min; 12 takmičenja; rezultati mogu kasniti", paidPlanLimit: "Prema planu; nije provereno za ovaj nalog",
    cost: "free-feed", rightsStatus: "attribution-required", license: "API uslovi; komercijalni cache/redisplay nije potvrđen",
    rights: rights("conditional", "allowed_with_conditions", "unknown", "unknown", "unknown", ["Atribucija", "Pisano razjašnjenje trajnog komercijalnog prikaza"], "Data provided by football-data.org", "https://www.football-data.org/terms"),
    priority: 2, fallback: "openfootball",
    qualityNote: "Besplatna pokrivenost ne obuhvata engleske rangove 3-7; stanje zavisi od takmičenja i sezone.",
    environmentKeys: ["FOOTBALL_DATA_API_KEY"], coverageProviders: ["football-data.org"], defaultInternalEnabled: false, defaultPublicEnabled: false,
  },
  {
    id: "pitchapi", name: "PitchAPI", url: "https://pitchapi.dev/", format: "api",
    availability: "integrated", fields: ["Raspored i rezultati prema ligi", "HT/FT", "xG samo gde payload postoji"], tierCoverage: [],
    countries: [], leagueCoverage: [], seasonCoverage: [], seasons: "Prema katalogu naloga; nije potvrđeno za engleske rangove 1-7",
    capabilities: capabilities({ fixtures: partial, ft: partial, ht: partial, h2h: partial, xg: partial, xga: partial, statistics: partial }),
    dailyLimit: null, monthlyLimit: null, rateLimit: "Limit nije nezavisno potvrđen",
    freePlanLimit: "Nije potvrđeno", paidPlanLimit: "Nije potvrđeno; ne kupovati bez odobrenja",
    cost: "unknown", rightsStatus: "unverified", license: null,
    rights: rights("unverified", "unknown", "unknown", "unknown", "unknown", ["Potreban produkcijski credential i pisana potvrda prava"], null, "https://pitchapi.dev/"),
    priority: null, fallback: null,
    qualityNote: "Postoji integracija, ali produkcijski ključ, tačna pokrivenost i prava trajnog prikaza nisu potvrđeni.",
    environmentKeys: ["PITCHAPI_KEY", "PITCHAPI_API_KEY"], coverageProviders: ["pitchapi"], defaultInternalEnabled: false, defaultPublicEnabled: false,
  },
  {
    id: "api-football", name: "API-Football / API-Sports", url: "https://www.api-football.com/coverage", format: "api",
    availability: "integrated", fields: ["Raspored", "FT/HT", "H2H", "odds/statistike gde postoje"], tierCoverage: [1, 2, 3, 4, 5, 6, 7],
    countries: ["England"], leagueCoverage: ["Premier League", "Championship", "League One", "League Two", "National League", "National League North", "National League South", "Isthmian Premier", "Northern Premier", "Southern Premier Central", "Southern Premier South"],
    seasonCoverage: [], seasons: "Katalog po ligi/sezoni; coverage flag nije garancija potpunih podataka",
    capabilities: capabilities({ fixtures: partial, ft: partial, ht: partial, h2h: partial, xg: partial, xga: partial, odds: partial, statistics: partial }),
    dailyLimit: 100, monthlyLimit: null, rateLimit: "Besplatni plan: 100 zahteva/dan; reset po UTC",
    freePlanLimit: "100 zahteva/dan", paidPlanLimit: "Prema planu; nije provereno niti kupljeno",
    cost: "free-feed", rightsStatus: "permission-required", license: "Uslovi API pristupa ne potvrđuju pravo javne redistribucije podataka",
    rights: rights("permission_required", "allowed_with_conditions", "unknown", "unknown", "unknown", ["Proveriti coverage po sezoni", "Potvrditi prava izvornog takmičenja i trajno čuvanje"], null, "https://api-sports.io/terms"),
    priority: null, fallback: "football-data.org",
    qualityNote: "Deklarisana je pokrivenost engleskih rangova 1-7, ali polja i sezonska potpunost moraju biti provereni jednim budžetiranim zahtevom.",
    environmentKeys: ["API_FOOTBALL_KEY"], coverageProviders: ["api-football"], defaultInternalEnabled: false, defaultPublicEnabled: false,
  },
  {
    id: "football-data.co.uk", name: "Football-Data.co.uk", url: "https://www.football-data.co.uk/data.php", format: "csv",
    availability: "catalog_only", fields: ["FT", "HT", "istorijske kvote", "neke statistike"], tierCoverage: [1, 2, 3, 4, 5],
    countries: ["England"], leagueCoverage: ["Premier League", "Championship", "League One", "League Two", "National League"], seasonCoverage: [],
    seasons: "Arhiva po CSV fajlu; istorijske sezone",
    capabilities: capabilities({ fixtures: partial, ft: yes, ht: yes, h2h: partial, odds: yes, statistics: partial }),
    dailyLimit: null, monthlyLimit: null, rateLimit: "Ručni pristup; poštovati fair-use uslove",
    freePlanLimit: "Lična/akademska upotreba; bez komercijalnog korišćenja", paidPlanLimit: "Zatražiti posebnu licencu",
    cost: "manual", rightsStatus: "permission-required", license: "Besplatni fair-use ne odobrava komercijalnu upotrebu",
    rights: rights("permission_required", "not_allowed", "not_allowed", "not_allowed", "not_allowed", ["Pisana komercijalna licenca"], null, "https://www.football-data.co.uk/contact.php"),
    priority: null, fallback: null,
    qualityNote: "Ne uvoziti u komercijalnu produkciju bez posebne dozvole izvora.",
    environmentKeys: [], coverageProviders: ["football-data.co.uk"], defaultInternalEnabled: false, defaultPublicEnabled: false,
  },
  {
    id: "statsbomb-open-data", name: "StatsBomb Open Data", url: "https://github.com/hudl/open-data", format: "json",
    availability: "catalog_only", fields: ["događaji", "detaljna statistika", "xG za izabrane mečeve"], tierCoverage: [],
    countries: [], leagueCoverage: [], seasonCoverage: [], seasons: "Izabrana takmičenja i sezone; nije aktuelni raspored",
    capabilities: capabilities({ ft: partial, ht: partial, h2h: partial, xg: partial, xga: partial, statistics: partial }),
    dailyLimit: null, monthlyLimit: null, rateLimit: "Statički GitHub fajlovi; nema API kvote",
    freePlanLimit: "Istraživački/open-data skup; ograničen katalog", paidPlanLimit: "Komercijalna upotreba zahteva dozvolu",
    cost: "free-feed", rightsStatus: "research-only", license: "Open-data agreement; komercijalna redistribucija nije potvrđena",
    rights: rights("permission_required", "not_allowed", "not_allowed", "not_allowed", "not_allowed", ["Istraživački uslovi i atribucija; tražiti komercijalnu dozvolu"], "StatsBomb", "https://github.com/hudl/open-data"),
    priority: null, fallback: null,
    qualityNote: "Detaljni podaci su ograničeni na odabrane mečeve; nije potpuna engleska piramida niti live feed.",
    environmentKeys: [], coverageProviders: ["statsbomb-open-data"], defaultInternalEnabled: false, defaultPublicEnabled: false,
  },
  {
    id: "openligadb", name: "OpenLigaDB", url: "https://www.openligadb.de/en/license", format: "api",
    availability: "integrated", fields: ["raspored", "FT", "HT gde postoji"], tierCoverage: [],
    countries: ["Germany"], leagueCoverage: ["Bundesliga", "2. Bundesliga", "3. Liga"], seasonCoverage: [], seasons: "Po nemačkom takmičenju",
    capabilities: capabilities({ fixtures: yes, ft: yes, ht: partial, h2h: partial }),
    dailyLimit: null, monthlyLimit: null, rateLimit: "Javni API; nema objavljenog SLA-a",
    freePlanLimit: "Javni API; koristiti razumno i keširati", paidPlanLimit: "Nije primenljivo",
    cost: "free-feed", rightsStatus: "attribution-required", license: "ODbL 1.0; atribucija i share-alike pri distribuciji izvedene baze",
    rights: rights("conditional", "allowed", "allowed_with_conditions", "allowed_with_conditions", "allowed_with_conditions", ["Atribucija", "ODbL share-alike za distribuiranu izvedenu bazu"], "OpenLigaDB (ODbL 1.0)", "https://www.openligadb.de/en/license"),
    priority: 3, fallback: null,
    qualityNote: "Koristan samo za Nemačku; dostupnost HT zavisi od utakmice. Nije fallback za engleske lige.",
    environmentKeys: [], coverageProviders: ["openligadb"], defaultInternalEnabled: true, defaultPublicEnabled: false,
  },
  {
    id: "thesportsdb", name: "TheSportsDB", url: "https://www.thesportsdb.com/API.php", format: "api",
    availability: "integrated", fields: ["osnovni raspored i rezultati"], tierCoverage: [],
    countries: ["England (ograničena katalog pokrivenost)"], leagueCoverage: [], seasonCoverage: [], seasons: "Zavisi od lige; svežina nije garantovana",
    capabilities: capabilities({ fixtures: partial, ft: partial, h2h: partial }),
    dailyLimit: null, monthlyLimit: null, rateLimit: "Besplatni API: do 30 zahteva/min prema dokumentaciji",
    freePlanLimit: "30 zahteva/min; endpoint limiti", paidPlanLimit: "Prema nalogu; nije provereno",
    cost: "free-feed", rightsStatus: "commercial-display", license: "Monetizovan web prikaz dozvoljen uz uslove; proveriti plan i obaveze",
    rights: rights("conditional", "allowed_with_conditions", "allowed_with_conditions", "allowed_with_conditions", "not_allowed", ["Poštovati plan, atribuciju i zabranu redistribucije sirovog feed-a"], "TheSportsDB", "https://www.thesportsdb.com/docs_terms_of_use.php"),
    priority: null, fallback: null,
    qualityNote: "Prethodna provera nije našla PL, Championship, League One/Two ni National League; nema pouzdanih kvota ili xG.",
    environmentKeys: ["THESPORTSDB_API_KEY"], coverageProviders: ["thesportsdb"], defaultInternalEnabled: false, defaultPublicEnabled: false,
  },
  {
    id: "the-odds-api", name: "The Odds API", url: "https://the-odds-api.com/terms-and-conditions.html", format: "api",
    availability: "integrated", fields: ["predstojeći događaji", "1X2 kvote", "totals gde su ponuđeni"], tierCoverage: [],
    countries: [], leagueCoverage: [], seasonCoverage: [], seasons: "Aktuelne/naredne ponude; istorijske kvote nisu u besplatnom planu",
    capabilities: capabilities({ fixtures: partial, odds: yes }),
    dailyLimit: null, monthlyLimit: 500, rateLimit: "Besplatni Starter plan: 500 kredita/mesec; cena poziva zavisi od parametara",
    freePlanLimit: "500 kredita/mesec", paidPlanLimit: "Prema planu; nije kupljeno",
    cost: "free-feed", rightsStatus: "commercial-display", license: "Komercijalni prikaz dozvoljen pod uslovima; sirovi feed ne redistribuirati",
    rights: rights("conditional", "allowed_with_conditions", "allowed_with_conditions", "allowed_with_conditions", "not_allowed", ["Prikaz po uslovima; bez samostalne redistribucije sirovih kvota"], "Odds API", "https://the-odds-api.com/terms-and-conditions.html"),
    priority: 1, fallback: null,
    qualityNote: "Samo dopunski izvor tržišnih kvota; ne zamenjuje raspored, rezultat ili HT/FT. Potrošnja kredita trenutno nije merena.",
    environmentKeys: ["ODDS_API_KEY"], coverageProviders: [], defaultInternalEnabled: false, defaultPublicEnabled: false,
  },
  {
    id: "bigballsdata", name: "BigBallsData", url: "https://bigballsdata.com/docs/sports", format: "api",
    availability: "catalog_only", fields: ["raspored", "rezultati", "tabele/statistike prema planu"], tierCoverage: [1],
    countries: ["England"], leagueCoverage: ["Premier League"], seasonCoverage: [], seasons: "Plan i endpoint moraju biti provereni; dokumentacija se ne slaže oko free istorije",
    capabilities: capabilities({ fixtures: partial, ft: partial, ht: unknown, h2h: unknown, xg: partial, xga: partial, odds: no, statistics: partial }),
    dailyLimit: 1000, monthlyLimit: null, rateLimit: "Free: do 1.000 zahteva/dan (do 2.000 uz GitHub); limit prema dokumentaciji",
    freePlanLimit: "1.000 zahteva/dan; jedan izabrani sport", paidPlanLimit: "Prema planu; ne kupovati bez odobrenja",
    cost: "free-feed", rightsStatus: "commercial-display", license: "Čuvanje/prikaz u aplikaciji uz uslove; sirova polja se ne redistribuiraju",
    rights: rights("conditional", "allowed_with_conditions", "allowed_with_conditions", "allowed_with_conditions", "not_allowed", ["Plan/coverage potvrda", "Bez redistribucije sirovih polja"], null, "https://bigballsdata.com/legal/terms"),
    priority: null, fallback: null,
    qualityNote: "Nije aktiviran niti je credential potvrđen; pokrivenost rangova 2-7 nije dokazana, match-level xG nije potvrđen.",
    environmentKeys: ["BIGBALLSDATA_API_KEY", "BBS_API_KEY"], coverageProviders: ["bigballsdata"], defaultInternalEnabled: false, defaultPublicEnabled: false,
  },
  {
    id: "api-ninjas", name: "API Ninjas", url: "https://api-ninjas.com/pricing", format: "api",
    availability: "inactive", fields: ["Fudbalska pokrivenost nije potvrđena"], tierCoverage: [],
    countries: [], leagueCoverage: [], seasonCoverage: [], seasons: "Nije potvrđeno za engleske lige 1-7",
    capabilities: capabilities({}), dailyLimit: null, monthlyLimit: 3000, rateLimit: "Free: 100 zahteva/sat; 3.000/mesečno",
    freePlanLimit: "Samo evaluacija/lična upotreba", paidPlanLimit: "Komercijalna upotreba zahteva odgovarajući plan",
    cost: "free-feed", rightsStatus: "permission-required", license: "Besplatni plan ne dozvoljava komercijalnu upotrebu",
    rights: rights("permission_required", "not_allowed", "not_allowed", "not_allowed", "not_allowed", ["Komercijalna licenca i potvrđena fudbalska pokrivenost"], null, "https://api-ninjas.com/pricing"),
    priority: null, fallback: null,
    qualityNote: "Nije aktiviran i ne sme se koristiti u produkciji preko ličnog/evaluacionog free plana.",
    environmentKeys: [], coverageProviders: [], defaultInternalEnabled: false, defaultPublicEnabled: false,
  },
  {
    id: "england-football-results", name: "England Football Results (GitHub)", url: "https://github.com/seanelvidge/England-football-results", format: "json",
    availability: "catalog_only", fields: ["istorijski FT; ostala polja nisu potvrđena"], tierCoverage: [1, 2, 3, 4],
    countries: ["England"], leagueCoverage: [], seasonCoverage: [], seasons: "Commit ažurnost proveravati; prava svih upstream podataka nisu potvrđena",
    capabilities: capabilities({ ft: partial, ht: unknown, h2h: partial }),
    dailyLimit: null, monthlyLimit: null, rateLimit: "GitHub feed; koristiti učtivo i proveriti commit",
    freePlanLimit: "Repo javno dostupan; to nije licenca za sadržane upstream podatke", paidPlanLimit: "Nije objavljeno",
    cost: "free-feed", rightsStatus: "unverified", license: "CC BY za doprinose autora; prava trećih lica ostaju rezervisana",
    rights: rights("unverified", "unknown", "unknown", "unknown", "unknown", ["Proveriti upstream poreklo i dozvolu za svaki skup"], "Prema repository licenci", "https://github.com/seanelvidge/England-football-results/blob/main/LICENCE.md"),
    priority: null, fallback: null,
    qualityNote: "Nije odobren kao produkcijski izvor; ne koristiti za HT/FT ili kvote bez provere polja.",
    environmentKeys: [], coverageProviders: ["england-football-results"], defaultInternalEnabled: false, defaultPublicEnabled: false,
  },
  {
    id: "datascraper-pro", name: "DataScraper Pro", url: "", format: "manual",
    availability: "contract_only", fields: ["Schema adapter spreman; API nije povezan"], tierCoverage: [],
    countries: [], leagueCoverage: [], seasonCoverage: [], seasons: "Nepoznato dok ne dobijemo stvarnu OpenAPI specifikaciju",
    capabilities: capabilities({}), dailyLimit: null, monthlyLimit: null, rateLimit: null,
    freePlanLimit: "Nepoznato", paidPlanLimit: "Nepoznato; ne kupovati niti aktivirati",
    cost: "unknown", rightsStatus: "unverified", license: null,
    rights: rights("unverified", "unknown", "unknown", "unknown", "unknown", ["Potreban endpoint, scoped credential, API dokumentacija i licenca"]),
    priority: null, fallback: null,
    qualityNote: "Samo validacioni ugovor; nema mrežnog klijenta, konekcije ili tvrdnje da API radi.",
    environmentKeys: ["DATASCRAPER_PRO_API_URL", "DATASCRAPER_PRO_API_KEY"], coverageProviders: [], defaultInternalEnabled: false, defaultPublicEnabled: false,
  },
  {
    id: "manual", name: "Ručni CSV/JSON", url: "", format: "manual",
    availability: "integrated", fields: ["Zavisi od fajla; obavezni izvor i prava"], tierCoverage: [],
    countries: [], leagueCoverage: [], seasonCoverage: [], seasons: "Neograničeno u modelu; validirati svaki dataset",
    capabilities: capabilities({}), dailyLimit: null, monthlyLimit: null, rateLimit: null,
    freePlanLimit: "Nije primenljivo", paidPlanLimit: "Zavisi od vlasnika izvora",
    cost: "manual", rightsStatus: "unverified", license: null,
    rights: rights("unverified", "unknown", "unknown", "unknown", "unknown", ["Navođenje porekla i potvrda prava pre uvoza"]),
    priority: null, fallback: null,
    qualityNote: "Nepoznate vrednosti ostaju null; CSV dostupnost nije dozvola za redistribuciju.",
    environmentKeys: [], coverageProviders: ["manual"], defaultInternalEnabled: false, defaultPublicEnabled: false,
  },
];

type SourceScope = "internal" | "public";
type SavedProvider = Record<string, any> & {
  activation?: { internal?: boolean; public?: boolean; internalAcknowledgedAt?: string | null; publicAcknowledgedAt?: string | null };
};

const hasEnv = (keys: string[]) => keys.some((key) => Boolean(process.env[key]?.trim()));
const finiteCount = (value: unknown) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
const permissionBlock = (definition: SourceDefinition, scope: SourceScope) => {
  const required = scope === "internal"
    ? [definition.rights.internalUse]
    : [definition.rights.publicDisplay, definition.rights.commercialUse];
  if (definition.availability === "inactive" || definition.availability === "contract_only")
    return "Nema potvrđene aktivne integracije.";
  if (required.some((value) => value === "unknown")) return "Prava za ovu namenu nisu potvrđena.";
  if (required.some((value) => value === "not_allowed")) return "Uslovi izvora ne dozvoljavaju ovu namenu.";
  return null;
};

export function collectorSourcePolicy(id: string, allowedSources = process.env.PUBLIC_FOOTBALL_COLLECTOR_SOURCES) {
  const definition = DATA_SOURCE_REGISTRY.find(source => source.id === id);
  if (!definition) return { allowed: false, reason: 'Izvor nije registrovan.' };
  if (!allowedSources?.trim()) return { allowed: false, reason: 'Collector allowlista nije podešena.' };
  if (!allowedSources.split(',').map(source => source.trim()).includes(id))
    return { allowed: false, reason: 'Izvor nije uključen u collector allowlistu.' };
  if (!definition.defaultPublicEnabled || definition.rights.licenseStatus !== 'confirmed'
    || definition.rights.publicDisplay !== 'allowed' || definition.rights.commercialUse !== 'allowed'
    || permissionBlock(definition, 'public'))
    return { allowed: false, reason: 'Prava za javni komercijalni snapshot nisu bezuslovno potvrđena.' };
  return { allowed: true, reason: null };
}

async function readSavedProviders(db?: AnalyticsDatabase) {
  const saved = new Map<string, SavedProvider>();
  if (!db) return saved;
  const rows = await db.query("SELECT id,payload FROM fa_providers ORDER BY id");
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload);
      if (payload && typeof payload === "object" && !Array.isArray(payload)) saved.set(row.id, payload);
    } catch { /* Ignore malformed legacy status without breaking admin reads. */ }
  }
  return saved;
}

export async function sourceRegistry(db?: AnalyticsDatabase, coverageRows: CoverageRow[] = []) {
  const saved = await readSavedProviders(db);
  return DATA_SOURCE_REGISTRY.map((definition): SourceRegistryEntry => {
    const current = saved.get(definition.id);
    const matching = coverageRows.filter((row) => definition.coverageProviders.includes(row.provider));
    const lastSuccessfulSync = matching.map((row) => row.lastSyncedAt).filter((value): value is string => Boolean(value)).sort().at(-1) || null;
    const syncTime = lastSuccessfulSync ? Date.parse(lastSuccessfulSync) : Number.NaN;
    const dataAgeHours = Number.isFinite(syncTime) ? Math.max(0, Math.round((Date.now() - syncTime) / 3_600_000)) : null;
    const aggregate = matching.reduce((total, row) => ({
      matches: total.matches + finiteCount(row.imported),
      total: total.total + finiteCount(row.total),
      finished: total.finished + finiteCount(row.finished),
      withHt: total.withHt + finiteCount(row.withHt),
      withXg: total.withXg + finiteCount(row.withXg),
    }), { matches: 0, total: 0, finished: 0, withHt: 0, withXg: 0 });
    const activation = current?.activation || {};
    const configured = hasEnv(definition.environmentKeys);
    const usage = current?.usage && typeof current.usage === "object" ? current.usage : {};
    const canEnable = {
      internal: permissionBlock(definition, "internal") === null,
      public: permissionBlock(definition, "public") === null,
    };
    const internalNeedsAcknowledgement = definition.rights.internalUse === "allowed_with_conditions";
    const publicNeedsAcknowledgement = definition.rights.publicDisplay === "allowed_with_conditions"
      || definition.rights.commercialUse === "allowed_with_conditions";
    const internalAcknowledged = typeof activation.internalAcknowledgedAt === "string" && Boolean(activation.internalAcknowledgedAt);
    const publicAcknowledged = typeof activation.publicAcknowledgedAt === "string" && Boolean(activation.publicAcknowledgedAt);
    const status = current?.status || (configured ? "configured_not_verified" : "not_checked");
    return {
      id: definition.id, name: definition.name, url: definition.url, format: definition.format,
      availability: definition.availability, fields: definition.fields, tierCoverage: definition.tierCoverage,
      countries: definition.countries, leagueCoverage: definition.leagueCoverage,
      seasonCoverage: [...new Set([...definition.seasonCoverage, ...matching.map((row) => row.season)])].sort().reverse(),
      seasons: definition.seasons, capabilities: definition.capabilities,
      dailyLimit: definition.dailyLimit, monthlyLimit: definition.monthlyLimit, rateLimit: definition.rateLimit,
      freePlanLimit: definition.freePlanLimit, paidPlanLimit: definition.paidPlanLimit,
      cost: definition.cost, rightsStatus: definition.rightsStatus, license: definition.license,
      rights: definition.rights, priority: definition.priority, fallback: definition.fallback,
      qualityNote: definition.qualityNote, reliability: aggregate.matches ? "observed" : "unverified",
      configured, status, checkedAt: current?.checkedAt || null, lastSuccessfulSync, dataAgeHours,
      enabled: {
        internal: canEnable.internal && (!internalNeedsAcknowledgement || internalAcknowledged)
          && (activation.internal ?? definition.defaultInternalEnabled),
        public: canEnable.public && (!publicNeedsAcknowledgement || publicAcknowledged)
          && (activation.public ?? definition.defaultPublicEnabled),
      },
      canEnable,
      enableBlockReason: {
        internal: permissionBlock(definition, "internal"),
        public: permissionBlock(definition, "public"),
      },
      usage: {
        requestsUsed: typeof usage.requestsUsed === "number" && Number.isFinite(usage.requestsUsed) && usage.requestsUsed >= 0 ? usage.requestsUsed : null,
        requestsRemaining: typeof usage.requestsRemaining === "number" && Number.isFinite(usage.requestsRemaining) && usage.requestsRemaining >= 0 ? usage.requestsRemaining : null,
        checkedAt: typeof usage.checkedAt === "string" ? usage.checkedAt : null,
      },
      coverage: {
        ...aggregate,
        completenessPct: aggregate.total > 0 ? Math.round((aggregate.matches / aggregate.total) * 10_000) / 100 : null,
      },
    };
  });
}

export async function setSourceActivation(
  db: AnalyticsDatabase,
  id: string,
  scope: SourceScope,
  enabled: boolean,
  acknowledgeConditions = false,
) {
  const definition = DATA_SOURCE_REGISTRY.find((source) => source.id === id);
  if (!definition) throw new Error("Nepoznat izvor podataka.");
  if (scope !== "internal" && scope !== "public") throw new Error("Nepoznata namena izvora.");
  if (typeof enabled !== "boolean") throw new Error("Status izvora mora biti true ili false.");
  if (enabled) {
    const block = permissionBlock(definition, scope);
    if (block) throw new Error(block);
    const required = scope === "internal"
      ? [definition.rights.internalUse]
      : [definition.rights.publicDisplay, definition.rights.commercialUse];
    if (required.some((value) => value === "allowed_with_conditions") && !acknowledgeConditions)
      throw new Error("Uslovi licence nisu potvrđeni. Pregledajte obaveze i potvrdite ih pre aktivacije.");
  }
  const saved = await readSavedProviders(db);
  const existing = saved.get(id) || {};
  const currentActivation = existing.activation || {};
  const now = new Date().toISOString();
  const activation = {
    ...currentActivation,
    [scope]: enabled,
    ...(enabled && acknowledgeConditions ? { [`${scope}AcknowledgedAt`]: now } : {}),
    updatedAt: now,
  };
  await db.query(
    "INSERT INTO fa_providers(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
    [id, JSON.stringify({ ...existing, id, activation })],
  );
  return (await sourceRegistry(db)).find((source) => source.id === id) || null;
}

export async function isSourceEnabled(db: AnalyticsDatabase, id: string, scope: SourceScope) {
  const source = (await sourceRegistry(db)).find((entry) => entry.id === id);
  return Boolean(source && source.enabled[scope]);
}

export function sourceCanEnable(definition: SourceDefinition, scope: SourceScope) {
  return permissionBlock(definition, scope) === null;
}
