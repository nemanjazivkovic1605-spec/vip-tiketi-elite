
export enum TicketStatus {
  WON = 'WON',
  LOST = 'LOST',
  PENDING = 'PENDING',
  POSTPONED = 'POSTPONED',
  REFUND = 'REFUND'
}

export enum TipPublicationStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED'
}

export type TicketProductType = 'elite_ticket' | 'safe_pick' | 'vip_monthly';

export enum MembershipStatus {
  FREE = 'free',
  PENDING = 'pending',
  APPROVED = 'approved',
  REMOVED = 'removed',
  BLOCKED = 'blocked',
  EXPIRED = 'expired'
}

export type AccountStatus = 'active' | 'blocked';

export interface Match {
  id?: string;
  externalMatchId?: string; // Link to results API
  teams: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  prediction: string; // GG, 3+, 1, X, 2, 1X, X2
  odds: number;
  time: string;
  eventDate?: string;
  eventTime?: string;
  result?: string;
  status?: TicketStatus;
  analysis?: string;
}

export enum MatchStatus {
  SCHEDULED = 'SCHEDULED',
  LIVE = 'LIVE',
  FINISHED = 'FINISHED',
  POSTPONED = 'POSTPONED'
}

export interface MatchResult {
  id: string;
  competitionCode?: string;
  source?: 'football-data.org' | 'mock';
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  time: string;
  score?: {
    home: number;
    away: number;
  };
  status: MatchStatus;
}

export interface ImportedMatch {
  id: string;
  date: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
  importedAt: string;
}

export interface FootballCompetition {
  id: number;
  code: string;
  name: string;
  areaName: string;
}

export interface FootballStanding {
  position: number;
  teamId: number;
  teamName: string;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface Tip {
  id: string;
  type?: TicketProductType;
  source?: 'admin' | 'demo';
  sourceProvider?: 'api-football' | 'football-data.org';
  fixtureId?: string;
  publicationStatus?: TipPublicationStatus;
  publishedDate?: string;
  publishedTime?: string;
  publishedAt?: string;
  ticketCode?: string;
  createdAt?: string;
  updatedAt?: string;
  locked?: boolean;
  date: string;
  matches: Match[];
  totalOdds: number;
  totalOddsOverride?: boolean;
  ticketType?: string;
  stake?: number;
  unitsStake?: number;
  status: TicketStatus;
  analysis: string;
  isVip: boolean;
  result?: string;
}

export interface User {
  id: string;
  uid?: string;
  email: string;
  emailVerified: boolean;
  verified?: boolean;
  membershipStatus: MembershipStatus;
  isAdmin: boolean;
  registeredAt: string;
  membershipExpDate?: string;
  displayName?: string;
  selectedPlan?: string;
  plan?: string;
  planName?: string;
  planDurationDays?: number;
  role?: 'admin' | 'user';
  status?: MembershipStatus | string;
  accountStatus?: AccountStatus;
  vipAccess?: boolean;
  vipApproved?: boolean;
  vipStatus?: 'inactive' | 'pending' | 'approved' | 'removed' | 'blocked' | 'expired';
  approved?: boolean;
  vipExpiresAt?: string | null;
  vip_expires_at?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  adminNote?: string;
}

export interface AdminNotification {
  id: string;
  type: 'new_user_registration' | 'vip_plan_request';
  userEmail: string;
  username: string;
  selectedPlan: string;
  createdAt: string;
  read: boolean;
  isRead?: boolean;
  readAt?: string | null;
  readBy?: string | null;
}

export interface GlobalStats {
  totalTips: number;
  winCount: number;
  lossCount: number;
  refundCount: number;
  completedCount: number;
  successRate: number;
  hitRate: number;
  monthlyProfit: number;
  unitsProfit: number;
  totalUnitsStaked: number;
  averageOdds: number;
  yield: number;
  roi: number;
  winStreak: number;
  loseStreak: number;
  monthlyBreakdown: MonthlyStats[];
}

export interface MonthlyStats {
  key: string;
  month: string;
  totalTickets: number;
  wins: number;
  losses: number;
  refunds: number;
  averageOdds: number;
  profitUnits: number;
  profitRsd: number;
  unitsStaked: number;
  yield: number;
  roi: number;
  tickets: Tip[];
}

export interface VipPackage {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  features: string[];
  isPopular?: boolean;
}

export interface Testimonial {
  id: string;
  userName: string;
  comment: string;
  date: string;
  rating: number;
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface Review {
  id: string;
  userId: string;
  name: string;
  rating: number;
  text: string;
  status: ReviewStatus;
  createdAt: string;
  approvedAt?: string | null;
}

export interface AppSettings {
  telegramLink: string;
  whatsappLink: string;
  instagramLink: string;
  viberLink: string;
  contactEmail: string;
}

export type DailyAnalysisAccess = 'FREE' | 'VIP';
export type DailyAnalysisSource = 'api-football' | 'api-basketball' | 'manual';
export type DailyAnalysisSport = 'football' | 'basketball';
export type DailyAnalysisRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type DailyAnalysisStatus = 'ACTIVE' | 'WON' | 'LOST' | 'POSTPONED' | 'REFUND' | 'HIDDEN';

export interface DailyAnalysisItem {
  id: string;
  type?: DailyAnalysisAccess;
  locked?: boolean;
  source: DailyAnalysisSource;
  sport?: DailyAnalysisSport;
  status?: DailyAnalysisStatus;
  manualOverride?: boolean;
  topPick?: boolean;
  units?: number;
  fixtureId?: number;
  date: string;
  matchTime?: string;
  kickoffTime?: string;
  time: string;
  publishedDate?: string;
  publishedTime?: string;
  publishTime?: string;
  publishedAt?: string;
  league: string;
  leagueId?: number;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
  result?: string;
  fixtureStatus?: string;
  elapsed?: number | null;
  isFinished?: boolean;
  resultManualOverride?: boolean;
  homeLogo?: string;
  awayLogo?: string;
  homeFormPercent?: number | null;
  awayFormPercent?: number | null;
  formNote?: string;
  prediction: string;
  odds: number;
  reasoning: string;
  analysis?: string;
  freeAnalysis?: string;
  vipAnalysis?: string;
  aiSource?: 'gemini' | 'fallback';
  confidence?: number;
  riskLevel?: DailyAnalysisRiskLevel;
  averageTotal?: string;
  h2hNote?: string;
  badges?: string[];
  access: DailyAnalysisAccess;
  sortOrder: number;
  enabled: boolean;
  hidden?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
