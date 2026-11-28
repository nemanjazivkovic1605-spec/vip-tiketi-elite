export type AnalyticsEnvironment = "real" | "test";
export type AnalyticsProvider = "pitchapi" | "football-data.org" | "football-data.co.uk" | "openligadb" | "openfootball" | "manual";
export type SourceRightsStatus = "confirmed-open" | "attribution-required" | "commercial-display" | "permission-required" | "unverified" | "research-only";
export type SourcePermission = "allowed" | "allowed_with_conditions" | "not_allowed" | "unknown";
export type SourceCapability = "supported" | "partial" | "not_supported" | "not_verified";
export type SourceCapabilityKey = "fixtures" | "ft" | "ht" | "h2h" | "xg" | "xga" | "odds" | "statistics";
export type SourceRegistryEntry = {
  id: string;
  name: string;
  url: string;
  format: "api" | "json" | "csv" | "manual";
  availability: "integrated" | "catalog_only" | "contract_only" | "inactive";
  fields: string[];
  tierCoverage: number[];
  countries: string[];
  leagueCoverage: string[];
  seasonCoverage: string[];
  seasons: string;
  capabilities: Record<SourceCapabilityKey, SourceCapability>;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  rateLimit: string | null;
  freePlanLimit: string;
  paidPlanLimit: string;
  cost: "unknown" | "free-feed" | "manual";
  rightsStatus: SourceRightsStatus;
  license: string | null;
  rights: {
    licenseStatus: "confirmed" | "conditional" | "unverified" | "permission_required";
    internalUse: SourcePermission;
    publicDisplay: SourcePermission;
    commercialUse: SourcePermission;
    redistribution: SourcePermission;
    attribution: string | null;
    conditions: string[];
    termsUrl: string | null;
  };
  priority: number | null;
  fallback: string | null;
  qualityNote: string;
  reliability: "unverified" | "observed";
  configured: boolean;
  status: string;
  checkedAt: string | null;
  lastSuccessfulSync: string | null;
  dataAgeHours: number | null;
  enabled: { internal: boolean; public: boolean };
  canEnable: { internal: boolean; public: boolean };
  enableBlockReason: { internal: string | null; public: string | null };
  collector: { sourceAllowed: boolean; reason: string | null };
  usage: { requestsUsed: number | null; requestsRemaining: number | null; checkedAt: string | null };
  coverage: { matches: number; total: number; finished: number; withHt: number; withXg: number; completenessPct: number | null };
};
export type ScorePair = { home: number | null; away: number | null };
export type SideNumbers = { home: number | null; away: number | null };
export type AnalyticsEvent = {
  type: string;
  minute: number | null;
  added: number | null;
  side: "home" | "away" | null;
  penalty: boolean | null;
  score?: ScorePair;
};
export type AnalyticsShot = {
  id: string;
  side: "home" | "away" | null;
  minute: number | null;
  xg: number | null;
  onTarget: boolean | null;
  penalty: boolean | null;
  x: number | null;
  y: number | null;
};
export type MatchObservation = {
  provider: AnalyticsProvider;
  sourceId: string;
  environment: AnalyticsEnvironment;
  league: { sourceId: string; name: string; country: string; tier?: number };
  season: string;
  kickoffAt: string | null;
  matchDate?: string;
  matchTime?: string | null;
  timeZone?: string | null;
  sourceUrl?: string;
  license?: string;
  lastCheckedAt?: string;
  home: { sourceId: string; name: string };
  away: { sourceId: string; name: string };
  status:
    | "scheduled"
    | "live"
    | "finished"
    | "postponed"
    | "canceled"
    | "unknown";
  ht: ScorePair;
  ft: ScorePair;
  extraTime: ScorePair;
  penalties: ScorePair;
  xg: SideNumbers;
  shots: SideNumbers;
  shotsOnTarget: SideNumbers;
  nonPenaltyXg?: SideNumbers;
  eventCoverage?: { goals: boolean; penalties: boolean; redCards: boolean };
  events: AnalyticsEvent[] | null;
  individualShots: AnalyticsShot[] | null;
  observedAt: string;
  statsChecked: boolean;
};
export type AnalyticsMatch = MatchObservation & {
  id: string;
  leagueId: string;
  homeId: string;
  awayId: string;
  provenance: Record<
    string,
    { provider: AnalyticsProvider; sourceId: string; observedAt: string }
  >;
  sources: Array<{ provider: AnalyticsProvider; sourceId: string }>;
};
export type AnalyticsLeague = {
  id: string;
  provider: AnalyticsProvider;
  sourceId: string;
  name: string;
  country: string;
  seasons: string[];
  environment: AnalyticsEnvironment;
};
export type CoverageRow = {
  id: string;
  leagueId: string;
  leagueName: string;
  country: string;
  provider: AnalyticsProvider;
  sourceId: string;
  season: string;
  environment: AnalyticsEnvironment;
  state:
    | "unverified"
    | "queued"
    | "importing"
    | "complete"
    | "empty"
    | "unavailable"
    | "error";
  cursor: number;
  total: number;
  imported: number;
  finished: number;
  withHt: number;
  withXg: number;
  statsChecked: number;
  lastSyncedAt: string | null;
  error: string | null;
};
export type MetricSample = {
  value: number | null;
  available: number;
  total: number;
  matchIds: string[];
};
export type TeamWindow = {
  matches: AnalyticsMatch[];
  metrics: Record<
    | "goalsFor"
    | "goalsAgainst"
    | "xg"
    | "xga"
    | "nonPenaltyXg"
    | "shots"
    | "shotsOnTarget"
    | "goalsMinusXg",
    MetricSample
  >;
  extremes: { matchId: string; goals: number; averageWithout: number } | null;
  context: {
    knownEventMatches: number;
    knownCardMatches: number;
    penalties: number;
    earlyReds: number;
  };
};
export type MatchAnalysis = {
  match: AnalyticsMatch;
  asOf: string;
  scope: "league" | "all";
  conclusion: string;
  caution: string;
  home: { last5: TeamWindow; last10: TeamWindow; venue5: TeamWindow };
  away: { last5: TeamWindow; last10: TeamWindow; venue5: TeamWindow };
  h2h: AnalyticsMatch[];
  htft: { code: string; count: number; denominator: number }[];
  opponentStrength: Array<{
    matchId: string;
    pointsPerMatch: number | null;
    sample: number;
  }>;
  priority: number;
  reason: string;
};
export type AnalyticsOverview = {
  database: {
    configured: boolean;
    kind: string;
    ready: boolean;
    message?: string;
  };
  providers: Array<{
    id: string;
    status: string;
    message: string;
    checkedAt: string | null;
    environment?: string;
  }>;
  sources?: SourceRegistryEntry[];
  coverage: CoverageRow[];
  totals: {
    leagues: number;
    matches: number;
    finished: number;
    withHt: number;
    withXg: number;
    unresolved: number;
  };
};
