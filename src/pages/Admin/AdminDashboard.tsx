import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { 
  BarChart3, Users, FileText, Settings, LogOut, ChevronRight, 
  Menu, X, ShieldCheck, TrendingUp, AlertTriangle, Clock, Link as LinkIcon, RefreshCw, CheckCircle2, XCircle, Upload, Database, Trash2, Plus, MinusCircle, Bell, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { mockTipsService } from '../../services/mockTips';
import { mockSettingsService } from '../../services/mockSettings';
import { importedMatchesService } from '../../services/importedMatchesService';
import { dailyAnalysesService } from '../../services/dailyAnalysesService';
import { getDailyAnalysisDates } from '../../utils/dailyDates';
import { authService } from '../../services/authService';
import { Tip, TicketStatus, ImportedMatch, MembershipStatus, GlobalStats, AppSettings, TipPublicationStatus, User, AdminNotification, DailyAnalysisItem, DailyAnalysisRiskLevel, DailyAnalysisStatus } from '../../types';
import TipModal from '../../components/TipModal';
import TicketEditModal from '../../components/admin/TicketEditModal';
import AdminOverview from '../../components/admin/AdminOverview';
import { buildPublishedAt, calculateTotalOdds, formatLocalTime, getDefaultUnitsStake, getStatusLabel, getTicketKind, normalizeOdds, unitsToRsd } from '../../utils/tickets';
import { evaluateImportedMatchPrediction } from '../../utils/predictionResults';
import { createDailyPublicationMeta, dailyPublicationMetaFromInput, formatDailyPublishedAt, getDailyPublicationInputValue, getKickoffTime } from '../../utils/dailyPublication';
import { isFinishedDailyAnalysisStatus, isVisibleInAdminActiveDailyList } from '../../utils/dailyLifecycle';

const tipOptions = ['1', 'X', '2', '1X', 'X2', 'GG', '3+'];
const dailyPredictionOptions = ['1', 'X', '2', '1X', 'X2', 'GG', '2+', '3+', 'Over 1.5', 'Over 2.5', 'Over poeni', 'Handicap favorit'];

type TicketBuilderItem = {
  match: ImportedMatch;
  prediction: string;
  odds: string;
  analysis: string;
};

type TicketAccessType = 'FREE' | 'VIP';
type BuilderTicketType = 'VIP Dubl' | 'VIP Combo';
type UserStatusFilter = 'all' | 'pending' | 'approved' | 'expired' | 'blocked' | 'free' | 'silver' | 'gold' | 'elite';
type TipPublicationFilter = 'all' | 'draft' | 'published';
type DailyLifecycleFilter = 'active' | 'finished';

type HistoricalPick = {
  match: ImportedMatch;
  prediction: '1' | 'X' | '2';
  odds: number;
  status: TicketStatus;
};

const getIsoDate = (date: Date) => date.toISOString().split('T')[0];
const dailyPullDates = getDailyAnalysisDates();

const getSixMonthsAgo = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setMonth(date.getMonth() - 6);
  return date;
};

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'matches' | 'tips' | 'analyses' | 'settings'>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isTipModalOpen, setIsTipModalOpen] = useState(false);
  const [editingTip, setEditingTip] = useState<Tip | undefined>(undefined);
  const [editingTicket, setEditingTicket] = useState<Tip | null>(null);
  
  // Fake state for lists
  const [userList, setUserList] = useState<User[]>([]);
  const [userStatusFilter, setUserStatusFilter] = useState<UserStatusFilter>('all');
  const [userSearch, setUserSearch] = useState('');
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [tips, setTips] = useState<Tip[]>([]);
  const [dailyAnalyses, setDailyAnalyses] = useState<DailyAnalysisItem[]>([]);
  const [dailyPullMessage, setDailyPullMessage] = useState('');
  const [dailyPullLoadingDate, setDailyPullLoadingDate] = useState('');
  const [dailyAiLoadingId, setDailyAiLoadingId] = useState('');
  const [dailyResultLoadingId, setDailyResultLoadingId] = useState('');
  const [dailyLifecycleFilter, setDailyLifecycleFilter] = useState<DailyLifecycleFilter>('active');
  const [dailyAnalysisForm, setDailyAnalysisForm] = useState<DailyAnalysisItem>({
    id: '',
    source: 'manual',
    sport: 'football',
    status: 'ACTIVE',
    manualOverride: true,
    topPick: false,
    units: 3,
    date: new Date().toISOString().split('T')[0],
    time: '20:00',
    matchTime: '20:00',
    kickoffTime: '20:00',
    ...createDailyPublicationMeta(),
    league: '',
    homeTeam: '',
    awayTeam: '',
    homeLogo: '',
    awayLogo: '',
    homeFormPercent: null,
    awayFormPercent: null,
    formNote: '',
    prediction: 'Over 1.5',
    odds: 1.5,
    reasoning: '',
    freeAnalysis: '',
    vipAnalysis: '',
    confidence: 70,
    riskLevel: 'MEDIUM',
    averageTotal: '',
    h2hNote: '',
    badges: [],
    access: 'FREE',
    sortOrder: 0,
    enabled: true,
    hidden: false,
  });
  const [tipPublicationFilter, setTipPublicationFilter] = useState<TipPublicationFilter>('all');
  const [availableMatches, setAvailableMatches] = useState<ImportedMatch[]>([]);
  const [matchTeamFilter, setMatchTeamFilter] = useState('');
  const [matchLeagueFilter, setMatchLeagueFilter] = useState('all');
  const [matchDateFilter, setMatchDateFilter] = useState('');
  const apiIssues: Array<{ competitionCode: string; competitionName: string; message: string }> = [];
  const [resultTipMatch, setResultTipMatch] = useState<ImportedMatch | null>(null);
  const [importMessage, setImportMessage] = useState('');
  const [historyPrepMessage, setHistoryPrepMessage] = useState('');
  const [resultTipForm, setResultTipForm] = useState({
    prediction: 'GG',
    odds: '1.80',
    unitsStake: '5',
    status: TicketStatus.WON,
    analysis: '',
    isVip: true,
  });
  const [ticketCart, setTicketCart] = useState<TicketBuilderItem[]>([]);
  const [ticketAccessType, setTicketAccessType] = useState<TicketAccessType>('VIP');
  const [builderTicketType, setBuilderTicketType] = useState<BuilderTicketType>('VIP Dubl');
  const [ticketStatus, setTicketStatus] = useState<TicketStatus>(TicketStatus.PENDING);
  const [ticketUnits, setTicketUnits] = useState('5');
  const [ticketPublishedTime, setTicketPublishedTime] = useState(() => formatLocalTime(new Date()));
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => mockSettingsService.getSettings());
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tipPageSize, setTipPageSize] = useState(8);

  const availableLeagues = useMemo(() => {
    return Array.from(new Set(availableMatches.map((match) => match.league).filter(Boolean))).sort();
  }, [availableMatches]);

  const filteredAvailableMatches = useMemo(() => {
    const team = matchTeamFilter.trim().toLowerCase();

    return availableMatches.filter((match) => {
      const matchesTeam = !team
        || match.homeTeam.toLowerCase().includes(team)
        || match.awayTeam.toLowerCase().includes(team);
      const matchesLeague = matchLeagueFilter === 'all' || match.league === matchLeagueFilter;
      const matchesDate = !matchDateFilter || match.date === matchDateFilter;

      return matchesTeam && matchesLeague && matchesDate;
    });
  }, [availableMatches, matchDateFilter, matchLeagueFilter, matchTeamFilter]);

  const activeAdminTips = useMemo(() => dailyAnalyses.filter((analysis) => isVisibleInAdminActiveDailyList(analysis)), [dailyAnalyses]);
  const finishedAdminTips = useMemo(() => dailyAnalyses.filter((analysis) => isFinishedDailyAnalysisStatus(analysis.status)), [dailyAnalyses]);

  const filteredDailyAnalyses = useMemo(() => (
    dailyLifecycleFilter === 'active' ? activeAdminTips : finishedAdminTips
  ), [activeAdminTips, dailyLifecycleFilter, finishedAdminTips]);

  const ticketTotalOdds = useMemo(() => {
    const matches = ticketCart.map((item) => ({
      teams: `${item.match.homeTeam} - ${item.match.awayTeam}`,
      homeTeam: item.match.homeTeam,
      awayTeam: item.match.awayTeam,
      league: item.match.league,
      prediction: item.prediction,
      odds: normalizeOdds(item.odds),
      time: 'FT',
    }));

    return calculateTotalOdds(matches);
  }, [ticketCart]);

  const draftTips = useMemo(() => {
    return tips.filter((tip) => tip.publicationStatus !== TipPublicationStatus.PUBLISHED);
  }, [tips]);

  const filteredUsers = useMemo(() => {
    const search = userSearch.trim().toLowerCase();

    return userList.filter((currentUser) => {
      const plan = (currentUser.plan || 'free').toLowerCase();
      const selectedPlan = (currentUser.selectedPlan || plan).toLowerCase();
      const membership = currentUser.membershipStatus;
      const accountStatus = currentUser.accountStatus || currentUser.status;
      const matchesSearch = !search
        || currentUser.email.toLowerCase().includes(search)
        || (currentUser.displayName || '').toLowerCase().includes(search);

      const isVipActive = currentUser.membershipStatus === MembershipStatus.APPROVED && currentUser.vipAccess === true;
      const isFreeAccount = currentUser.emailVerified === true && !isVipActive && accountStatus !== 'blocked';
      const matchesFilter =
        userStatusFilter === 'all'
        || (userStatusFilter === 'pending' && membership === MembershipStatus.PENDING)
        || (userStatusFilter === 'approved' && membership === MembershipStatus.APPROVED)
        || (userStatusFilter === 'expired' && membership === MembershipStatus.EXPIRED)
        || (userStatusFilter === 'blocked' && (membership === MembershipStatus.BLOCKED || accountStatus === 'blocked'))
        || (userStatusFilter === 'free' && isFreeAccount)
        || (userStatusFilter === 'silver' && (plan === 'silver_7' || selectedPlan === 'silver_7'))
        || (userStatusFilter === 'gold' && (plan === 'gold_30' || selectedPlan === 'gold_30'))
        || (userStatusFilter === 'elite' && (plan === 'elite_90' || selectedPlan === 'elite_90'));

      return matchesSearch && matchesFilter;
    });
  }, [userList, userSearch, userStatusFilter]);

  const filteredTips = useMemo(() => {
    if (tipPublicationFilter === 'draft') {
      return tips.filter((tip) => tip.publicationStatus !== TipPublicationStatus.PUBLISHED);
    }

    if (tipPublicationFilter === 'published') {
      return tips.filter((tip) => tip.publicationStatus === TipPublicationStatus.PUBLISHED);
    }

    return tips;
  }, [tips, tipPublicationFilter]);

  const visibleTips = useMemo(() => filteredTips.slice(0, tipPageSize), [filteredTips, tipPageSize]);
  const hasMoreTips = filteredTips.length > visibleTips.length;
  const unreadNotifications = useMemo(() => notifications.filter((notification) => !notification.read), [notifications]);
  const notificationsRef = useRef(notifications);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const refreshData = useCallback(async (options: { includeUsers?: boolean; includeNotifications?: boolean } = {}) => {
    const includeUsers = options.includeUsers ?? true;
    const includeNotifications = options.includeNotifications ?? true;

    const [fetchedTips, fetchedMatches, fetchedStats, fetchedDailyAnalyses] = await Promise.all([
      mockTipsService.getAllTips(),
      importedMatchesService.getMatches(),
      mockTipsService.getStats(),
      dailyAnalysesService.getAdminAnalyses(),
    ]);

    const fetchedUsers = includeUsers ? await authService.getUsers() : userList;
    const fetchedNotifications = includeNotifications
      ? await authService.getAdminNotifications()
      : notificationsRef.current;

    const existingNotificationMap = new Map<string, AdminNotification>(
      notificationsRef.current.map((notification) => [notification.id, notification]),
    );
    const mergedNotifications = fetchedNotifications.map((notification) => {
      const previous = existingNotificationMap.get(notification.id);
      return previous && (previous.read || previous.isRead)
        ? {
          ...notification,
          read: previous.read,
          isRead: previous.isRead,
          readAt: previous.readAt || notification.readAt,
          readBy: previous.readBy || notification.readBy,
        }
        : notification;
    });

    const debugActive = fetchedDailyAnalyses.filter((analysis) => isVisibleInAdminActiveDailyList(analysis));
    const debugFinished = fetchedDailyAnalyses.filter((analysis) => isFinishedDailyAnalysisStatus(analysis.status));

    console.debug('[daily-admin-debug] view split', {
      firestoreCount: fetchedDailyAnalyses.length,
      statuses: fetchedDailyAnalyses.map((analysis) => analysis.status),
      dates: fetchedDailyAnalyses.reduce<Record<string, number>>((acc, analysis) => {
        acc[analysis.date] = (acc[analysis.date] || 0) + 1;
        return acc;
      }, {}),
      activeCount: debugActive.length,
      finishedCount: debugFinished.length,
      activeByDate: debugActive.reduce<Record<string, number>>((acc, analysis) => {
        acc[analysis.date] = (acc[analysis.date] || 0) + 1;
        return acc;
      }, {}),
      finishedByDate: debugFinished.reduce<Record<string, number>>((acc, analysis) => {
        acc[analysis.date] = (acc[analysis.date] || 0) + 1;
        return acc;
      }, {}),
    });

    setTips(fetchedTips);
    setAvailableMatches(fetchedMatches);
    setStats(fetchedStats);
    setDailyAnalyses(fetchedDailyAnalyses);
    if (includeUsers) setUserList(fetchedUsers);
    if (includeNotifications) setNotifications(mergedNotifications);
  }, [userList]);

  useEffect(() => {
    void refreshData({ includeUsers: true, includeNotifications: true });

    const unsubscribeTips = mockTipsService.subscribe(() => {
      void refreshData({ includeUsers: false, includeNotifications: false });
    });
    const unsubscribeMatches = importedMatchesService.subscribe(() => {
      void refreshData({ includeUsers: false, includeNotifications: false });
    });
    const unsubscribeDailyAnalyses = dailyAnalysesService.subscribeAdmin(() => {
      void refreshData({ includeUsers: false, includeNotifications: false });
    });
    const unsubscribeNotifications = authService.subscribeAdminNotifications(setNotifications);

    return () => {
      unsubscribeTips();
      unsubscribeMatches();
      unsubscribeDailyAnalyses();
      unsubscribeNotifications();
    };
  }, [refreshData]);

  const handleCreateTip = async (newTip: Tip) => {
    if (editingTip) {
      await mockTipsService.updateTip(newTip);
    } else {
      await mockTipsService.addTip(newTip);
    }
    setIsTipModalOpen(false);
    setEditingTip(undefined);
    refreshData();
  };

  const getDefaultOddsForPrediction = (prediction: string, match: ImportedMatch) => {
    if (prediction === '1' || prediction === '1X') return match.oddsHome;
    if (prediction === 'X') return match.oddsDraw;
    if (prediction === '2' || prediction === 'X2') return match.oddsAway;
    return 1.8;
  };

  const applyDefaultTicketStake = (accessType: TicketAccessType, matchCount: number) => {
    setTicketUnits(String(getDefaultUnitsStake(accessType === 'VIP', matchCount)));
  };

  const getSuggestedBuilderTicketType = (matchCount: number): BuilderTicketType =>
    matchCount >= 3 ? 'VIP Combo' : 'VIP Dubl';

  const handleOpenResultTip = (match: ImportedMatch) => {
    const prediction = 'GG';
    setResultTipMatch(match);
    setResultTipForm({
      prediction,
      odds: getDefaultOddsForPrediction(prediction, match).toFixed(2),
      unitsStake: String(getDefaultUnitsStake(true, 1)),
      status: TicketStatus.WON,
      analysis: `${match.homeTeam} - ${match.awayTeam}`,
      isVip: true,
    });
  };

  const handleCreateTipFromResult = async (publishNow = false) => {
    if (!resultTipMatch) return;

    const odds = Number(resultTipForm.odds);
    const unitsStake = Number(resultTipForm.unitsStake);
    if (!Number.isFinite(odds) || odds <= 0 || !Number.isFinite(unitsStake) || unitsStake < 1 || unitsStake > 10) {
      alert('Popunite tip igre, kvotu i units od 1 do 10.');
      return;
    }

    const tip: Tip = {
      id: `tip-${resultTipMatch.id}-${Date.now()}`,
      source: 'admin',
      publicationStatus: publishNow ? TipPublicationStatus.PUBLISHED : TipPublicationStatus.DRAFT,
      publishedAt: publishNow ? new Date().toISOString() : undefined,
      date: resultTipMatch.date,
      isVip: resultTipForm.isVip,
      status: resultTipForm.status,
      totalOdds: normalizeOdds(odds),
      unitsStake: Number(unitsStake.toFixed(2)),
      stake: unitsToRsd(unitsStake),
      analysis: resultTipForm.analysis,
      matches: [
        {
          id: `match-${resultTipMatch.id}`,
          externalMatchId: resultTipMatch.id,
          teams: `${resultTipMatch.homeTeam} - ${resultTipMatch.awayTeam}`,
          homeTeam: resultTipMatch.homeTeam,
          awayTeam: resultTipMatch.awayTeam,
          league: resultTipMatch.league,
          prediction: resultTipForm.prediction,
          odds: normalizeOdds(odds),
          time: 'FT',
          result: `${resultTipMatch.homeScore}:${resultTipMatch.awayScore}`,
          status: resultTipForm.status,
        },
      ],
    };

    await mockTipsService.addTip(tip);
    setResultTipMatch(null);
    await refreshData();
  };

  const handleAddMatchToTicket = (match: ImportedMatch) => {
    setTicketCart((current) => {
      if (current.some((item) => item.match.id === match.id)) {
        alert('Ova utakmica je vec dodata na trenutni tiket.');
        return current;
      }

      const prediction = '1';
      const next = [
        ...current,
        {
          match,
          prediction,
          odds: getDefaultOddsForPrediction(prediction, match).toFixed(2),
          analysis: '',
        },
      ];
      const currentDefaultUnits = getDefaultUnitsStake(ticketAccessType === 'VIP', current.length);
      const shouldUseNextDefault = current.length === 0 || Number(ticketUnits) === currentDefaultUnits;
      if (shouldUseNextDefault) {
        setTicketUnits(String(getDefaultUnitsStake(ticketAccessType === 'VIP', next.length)));
      }
      setTicketAccessType('VIP');
      setBuilderTicketType(getSuggestedBuilderTicketType(next.length));
      return next;
    });
  };

  const handleUpdateTicketItem = (matchId: string, patch: Partial<Omit<TicketBuilderItem, 'match'>>) => {
    setTicketCart((current) =>
      current.map((item) => item.match.id === matchId ? { ...item, ...patch } : item)
    );
  };

  const handleUpdateTicketPrediction = (matchId: string, prediction: string) => {
    setTicketCart((current) =>
      current.map((item) => {
        if (item.match.id !== matchId) return item;
        return {
          ...item,
          prediction,
          odds: getDefaultOddsForPrediction(prediction, item.match).toFixed(2),
        };
      })
    );
  };

  const handleRemoveTicketItem = (matchId: string) => {
    setTicketCart((current) => {
      const next = current.filter((item) => item.match.id !== matchId);
      const currentDefaultUnits = getDefaultUnitsStake(ticketAccessType === 'VIP', current.length);
      if (Number(ticketUnits) === currentDefaultUnits) {
        setTicketUnits(String(getDefaultUnitsStake(ticketAccessType === 'VIP', next.length)));
      }
      setBuilderTicketType(getSuggestedBuilderTicketType(next.length));
      return next;
    });
  };

  const handleClearTicketCart = () => {
    setTicketCart([]);
    setTicketAccessType('VIP');
    setBuilderTicketType('VIP Dubl');
    setTicketStatus(TicketStatus.PENDING);
    setTicketUnits(String(getDefaultUnitsStake(true, 0)));
    setTicketPublishedTime(formatLocalTime(new Date()));
  };

  const handlePublishTicket = async () => {
    if (ticketCart.length < 2) {
      alert('Za VIP Dubl/Combo dodajte najmanje 2 meča na tiket.');
      return;
    }

    const invalidItem = ticketCart.find((item) => !item.prediction);

    if (invalidItem) {
      alert('Svaki meč mora imati tip igre.');
      return;
    }

    const unitsStake = Number(ticketUnits);
    if (!Number.isFinite(unitsStake) || unitsStake < 1 || unitsStake > 10) {
      alert('Unesite units od 1 do 10 za tiket.');
      return;
    }

    const sortedDates = ticketCart.map((item) => item.match.date).sort();
    const createdAt = new Date().toISOString();
    const matches = ticketCart.map((item) => {
      const odds = normalizeOdds(item.odds);

      return {
        id: `ticket-match-${item.match.id}-${Date.now()}`,
        externalMatchId: item.match.id,
        teams: `${item.match.homeTeam} - ${item.match.awayTeam}`,
        homeTeam: item.match.homeTeam,
        awayTeam: item.match.awayTeam,
        league: item.match.league,
        prediction: item.prediction,
        odds: Number(odds.toFixed(2)),
        time: 'FT',
        result: `${item.match.homeScore}:${item.match.awayScore}`,
        status: ticketStatus,
        analysis: item.analysis.trim(),
      };
    });

    const ticket: Tip = {
      id: `ticket-${Date.now()}`,
      source: 'admin',
      publicationStatus: TipPublicationStatus.PUBLISHED,
      date: sortedDates[0] || createdAt.split('T')[0],
      publishedDate: sortedDates[0] || createdAt.split('T')[0],
      publishedTime: ticketPublishedTime,
      publishedAt: buildPublishedAt(sortedDates[0] || createdAt.split('T')[0], ticketPublishedTime),
      isVip: true,
      status: ticketStatus,
      totalOdds: ticketTotalOdds,
      ticketType: builderTicketType,
      unitsStake: Number(unitsStake.toFixed(2)),
      stake: unitsToRsd(unitsStake),
      analysis: ticketCart
        .map((item) => item.analysis.trim())
        .filter(Boolean)
        .join('\n'),
      matches,
    };

    await mockTipsService.addTip(ticket);
    handleClearTicketCart();
    await refreshData();
  };

  const pickHistoricalFavorite = (match: ImportedMatch): HistoricalPick | null => {
    const rawOptions: Array<{ prediction: '1' | 'X' | '2'; odds: number }> = [
      { prediction: '1', odds: Number(match.oddsHome) },
      { prediction: 'X', odds: Number(match.oddsDraw) },
      { prediction: '2', odds: Number(match.oddsAway) },
    ];
    const options = rawOptions.filter((option) => Number.isFinite(option.odds) && option.odds > 1);

    if (options.length === 0) return null;

    const sorted = [...options].sort((a, b) => a.odds - b.odds);
    const preferred = sorted.find((option) => option.prediction !== 'X' && option.odds <= 2.35) || sorted[0];

    return {
      match,
      prediction: preferred.prediction,
      odds: Number(preferred.odds.toFixed(2)),
      status: evaluateImportedMatchPrediction(preferred.prediction, match),
    };
  };

  const handlePrepareHistory = async () => {
    if (availableMatches.length === 0) {
      setHistoryPrepMessage('Admin baza utakmica je prazna. Prvo importujte Excel/CSV bazu.');
      return;
    }

    const fromDate = getSixMonthsAgo();
    const toDate = new Date();
    const fromIso = getIsoDate(fromDate);
    const toIso = getIsoDate(toDate);
    const existingIds = new Set(tips.map((tip) => tip.id));
    const grouped = new Map<string, HistoricalPick[]>();

    availableMatches
      .filter((match) => {
        return match.date >= fromIso
          && match.date <= toIso
          && Number.isFinite(match.homeScore)
          && Number.isFinite(match.awayScore);
      })
      .forEach((match) => {
        const pick = pickHistoricalFavorite(match);
        if (!pick) return;

        const current = grouped.get(match.date) || [];
        current.push(pick);
        grouped.set(match.date, current);
      });

    const generatedTips: Tip[] = [];

    Array.from(grouped.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .forEach(([date, picks]) => {
        const id = `history-6m-${date}`;
        if (existingIds.has(id)) return;

        const rankedPicks = picks
          .sort((a, b) => a.odds - b.odds)
          .slice(0, 5);

        if (rankedPicks.length < 3) return;

        const ticketMatches = rankedPicks.map((pick) => ({
          id: `history-match-${pick.match.id}`,
          externalMatchId: pick.match.id,
          teams: `${pick.match.homeTeam} - ${pick.match.awayTeam}`,
          homeTeam: pick.match.homeTeam,
          awayTeam: pick.match.awayTeam,
          league: pick.match.league,
          prediction: pick.prediction,
          odds: pick.odds,
          time: 'FT',
          result: `${pick.match.homeScore}:${pick.match.awayScore}`,
          status: pick.status,
          analysis: '',
        }));
        const totalOdds = calculateTotalOdds(ticketMatches);
        const status = rankedPicks.some((pick) => pick.status === TicketStatus.LOST) ? TicketStatus.LOST : TicketStatus.WON;

        generatedTips.push({
          id,
          source: 'admin',
          publicationStatus: TipPublicationStatus.DRAFT,
          date,
          isVip: true,
          status,
          totalOdds,
          unitsStake: getDefaultUnitsStake(true, ticketMatches.length),
          stake: unitsToRsd(getDefaultUnitsStake(true, ticketMatches.length)),
          analysis: '',
          matches: ticketMatches,
        });
      });

    if (generatedTips.length === 0) {
      setHistoryPrepMessage('Nema novih draft tiketa za poslednjih 6 meseci. Moguće je da su već pripremljeni ili nema dovoljno mečeva po danu.');
      return;
    }

    await mockTipsService.addTips(generatedTips);
    setActiveTab('tips');
    setHistoryPrepMessage(`Pripremljeno ${generatedTips.length} DRAFT tiketa za period ${fromIso} - ${toIso}. Nista nije objavljeno.`);
    await refreshData();
  };

  const handleImportMatches = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImportMessage('Uvoz u toku...');
      const result = await importedMatchesService.importFile(file);
      setImportMessage(`Uvezeno ${result.imported} utakmica. Preskoceno ${result.skipped}.`);
      await refreshData();
    } catch (error) {
      console.error('Import failed:', error);
      setImportMessage('Import nije uspeo. Proverite kolone i format fajla.');
    } finally {
      event.target.value = '';
    }
  };

  const handleDeleteImportedMatch = async (matchId: string) => {
    if (confirm('Da li želite da obrišete ovu utakmicu iz admin baze?')) {
      await importedMatchesService.deleteMatch(matchId);
      await refreshData();
    }
  };

  const resetDailyAnalysisForm = () => {
    setDailyAnalysisForm({
      id: '',
      source: 'manual',
      sport: 'football',
      status: 'ACTIVE',
      manualOverride: true,
      topPick: false,
      units: 3,
      date: new Date().toISOString().split('T')[0],
      time: '20:00',
      matchTime: '20:00',
      kickoffTime: '20:00',
      ...createDailyPublicationMeta(),
      league: '',
      homeTeam: '',
      awayTeam: '',
      homeLogo: '',
      awayLogo: '',
      homeFormPercent: null,
      awayFormPercent: null,
      formNote: '',
      prediction: 'Over 1.5',
      odds: 1.5,
      reasoning: '',
      freeAnalysis: '',
      vipAnalysis: '',
      confidence: 70,
      riskLevel: 'MEDIUM',
      averageTotal: '',
      h2hNote: '',
      badges: [],
      access: 'FREE',
      sortOrder: 0,
      enabled: true,
      hidden: false,
    });
  };

  const handleEditDailyAnalysis = (analysis: DailyAnalysisItem) => {
    setDailyAnalysisForm({ ...analysis });
  };

  const handleSaveDailyAnalysis = async () => {
    if (!dailyAnalysisForm.date || !dailyAnalysisForm.league || !dailyAnalysisForm.homeTeam || !dailyAnalysisForm.awayTeam) {
      alert('Popunite datum, ligu, domaćina i gosta.');
      return;
    }

    await dailyAnalysesService.saveManualAnalysis({
      ...dailyAnalysisForm,
      id: dailyAnalysisForm.id || `manual-daily-${Date.now()}`,
      odds: Number(dailyAnalysisForm.odds) || 1,
      units: Number(dailyAnalysisForm.units) || 3,
      confidence: Number(dailyAnalysisForm.confidence) || undefined,
      sortOrder: Number(dailyAnalysisForm.sortOrder) || 0,
      homeFormPercent: dailyAnalysisForm.homeFormPercent === null ? null : Number(dailyAnalysisForm.homeFormPercent),
      awayFormPercent: dailyAnalysisForm.awayFormPercent === null ? null : Number(dailyAnalysisForm.awayFormPercent),
      manualOverride: true,
    });
    resetDailyAnalysisForm();
    await refreshData();
  };

  const handleDeleteDailyAnalysis = async (id: string) => {
    if (!confirm('Da li želite da obrišete ovu dnevnu analizu?')) return;
    await dailyAnalysesService.deleteManualAnalysis(id);
    await refreshData();
  };

  const handlePullDailyAnalyses = async (date: string, label: string) => {
    const existingForDate = dailyAnalyses.filter((analysis) => analysis.date === date);
    const hasManualOverrides = existingForDate.some((analysis) => analysis.manualOverride);
    if (existingForDate.length > 0) {
      const message = hasManualOverrides
        ? 'Ovaj tiket je ručno izmenjen. Da li želiš osvežavanje iz API-ja? Ručno izmenjeni tipovi neće biti pregazeni.'
        : 'Za ovaj dan već postoje dnevni tipovi. Da li želiš osvežavanje iz API-ja?';

      if (!confirm(message)) {
        return;
      }
    }

    setDailyPullMessage('');
    setDailyPullLoadingDate(date);
    try {
      const result = await dailyAnalysesService.pullFromApiForDate(date);
      setDailyPullMessage(`${label}: povučeno ${result.fetched}, sačuvano ${result.saved}${result.skippedManualOverride ? `, preskočeno ručno izmenjenih ${result.skippedManualOverride}` : ''}${result.failed ? `, neuspešno ${result.failed}` : ''}. Analize se generišu samo ručnim klikom.`);
      await refreshData();
      console.debug('[daily-admin-debug] pull finished and refreshed', {
        requestedDate: date,
        label,
        fetched: result.fetched,
        saved: result.saved,
        skippedManualOverride: result.skippedManualOverride,
      });
    } catch (error) {
      console.error('Daily tips API pull failed:', error);
      const message = error instanceof Error ? error.message : 'Proverite API limit ili ključ.';
      setDailyPullMessage(`${label}: povlačenje nije uspelo. ${message}`);
    } finally {
      setDailyPullLoadingDate('');
    }
  };

  const handleGenerateDailyAiAnalysis = async (analysis: DailyAnalysisItem, analysisType: 'FREE' | 'VIP') => {
    setDailyAiLoadingId(`${analysis.id}:${analysisType}`);
    setDailyPullMessage('');
    try {
      const result = await dailyAnalysesService.generateAiAnalysis(analysis, analysisType);
      const generationDetails = [
        result.model ? `Analiza generisana modelom: ${result.model}.` : '',
        result.statsProvider ? `Sports provider: ${result.statsProvider}.` : 'Sports provider: osnovni podaci.',
        `Enriched stats: ${result.enrichedStatsFound ? 'da' : 'ne'}.`,
        result.enrichmentCacheHit ? 'Sports cache: korišćen.' : '',
        result.aiCacheHit ? 'AI cache: korišćen.' : '',
      ].filter(Boolean).join(' ');
      setDailyPullMessage(`${result.insufficientData
        ? `${analysisType}: Nema dovoljno relevantnih podataka za kvalitetnu AI analizu.`
        : result.source === 'gemini'
        ? `${analysisType} AI analiza je generisana za ${analysis.homeTeam} - ${analysis.awayTeam}.`
        : `Gemini trenutno nije odgovorio; sačuvana je ${analysisType} fallback analiza za ${analysis.homeTeam} - ${analysis.awayTeam}.`} ${result.enrichmentMessage || ''} ${generationDetails}`.trim());
      await refreshData();
    } catch (error) {
      console.error('AI daily analysis generation failed:', error);
      setDailyPullMessage(error instanceof Error ? error.message : 'Generisanje AI analize nije uspelo.');
    } finally {
      setDailyAiLoadingId('');
    }
  };

  const handleDailyQuickPatch = async (analysis: DailyAnalysisItem, patch: Partial<DailyAnalysisItem>) => {
    await dailyAnalysesService.updateManualAnalysis(analysis.id, patch);
    await refreshData();
  };

  const handleRefreshDailyResult = async (analysis: DailyAnalysisItem) => {
    setDailyResultLoadingId(analysis.id);
    setDailyPullMessage('');
    try {
      const outcome = await dailyAnalysesService.refreshResultFromApi(analysis);
      setDailyPullMessage(outcome.message);
      if (outcome.updated) await refreshData();
    } catch (error) {
      console.error('Daily result refresh failed:', error);
      setDailyPullMessage(error instanceof Error ? error.message : 'Povlačenje rezultata nije uspelo.');
    } finally {
      setDailyResultLoadingId('');
    }
  };

  const handleDailyResult = async (analysis: DailyAnalysisItem, status: 'WON' | 'LOST' | 'REFUND' | 'POSTPONED') => {
    await dailyAnalysesService.updateManualAnalysis(analysis.id, {
      status,
      enabled: status === 'WON',
      hidden: status !== 'WON',
      manualOverride: true,
    });

    await refreshData();
  };

  const handleClearImportedMatches = async () => {
    if (confirm('Da li želite da obrišete sve importovane utakmice?')) {
      await importedMatchesService.clearMatches();
      await refreshData();
    }
  };

  const handleOpenEditModal = (tip: Tip) => {
    setEditingTicket(tip);
  };

  const handleSaveTicketEdit = async (updatedTip: Tip) => {
    await mockTipsService.updateTip(updatedTip);
    await refreshData();
  };

  const handleDeleteTicketEdit = async (tipId: string) => {
    await mockTipsService.deleteTip(tipId);
    await refreshData();
  };

  const handleUpdateUserStatus = async (userId: string, status: MembershipStatus) => {
    const userToUpdate = userList.find(u => u.id === userId);
    if (!userToUpdate) return;

    if (status === MembershipStatus.APPROVED) {
      await authService.approveUser(userToUpdate, user?.email);
    } else if (status === MembershipStatus.BLOCKED) {
      await authService.blockUser(userToUpdate.id);
    }

    await refreshData();
  };

  const handleVerifyUser = async (userToVerify: User) => {
    await authService.verifyUser(userToVerify);
    await refreshData();
  };

  const handleSetFreeUser = async (userToUpdate: User) => {
    await authService.setFreeUser(userToUpdate);
    await refreshData();
  };

  const handleActivateUserPlan = async (userToActivate: User, planId: 'silver_7' | 'gold_30' | 'elite_90') => {
    await authService.activatePlan(userToActivate, planId, user?.email);
    await refreshData();
  };

  const handleExtendUser = async (userToExtend: User, days = userToExtend.planDurationDays || 7) => {
    await authService.extendUser(userToExtend, days);
    await refreshData();
  };

  const handleRemoveVip = async (userToUpdate: User) => {
    await authService.setFreeUser(userToUpdate);
    await refreshData();
  };

  const handleUnblockUser = async (userId: string) => {
    await authService.unblockUser(userId);
    await refreshData();
  };

  const handleUpdateAdminNote = async (userId: string, adminNote: string) => {
    await authService.updateAdminNote(userId, adminNote);
    await refreshData();
  };

  const handleMarkNotificationRead = async (notificationId: string) => {
    setNotifications((current) => current.map((notification) => (
      notification.id === notificationId
        ? { ...notification, read: true, isRead: true, readAt: new Date().toISOString(), readBy: user?.id || null }
        : notification
    )));
    try {
      await authService.markNotificationRead(notificationId);
    } catch (error) {
      console.error('Mark notification read failed:', error);
      await refreshData();
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (confirm('Da li ste sigurni da želite da obrišete korisnika?')) {
      const userToDelete = userList.find(u => u.id === userId);
      if (!userToDelete) return;
      await authService.deleteUser(userToDelete);
      await refreshData();
    }
  };

  const handleDeleteTip = async (tipId: string) => {
    if (confirm('Da li ste sigurni da želite da obrišete ovaj tip?')) {
      await mockTipsService.deleteTip(tipId);
      refreshData();
    }
  };

  const handleUpdateTipStatus = async (tip: Tip, status: TicketStatus) => {
    await mockTipsService.updateTip({ ...tip, status });
    await refreshData();
  };

  const handlePublishTip = async (tipId: string) => {
    await mockTipsService.publishTip(tipId);
    await refreshData();
  };

  const handleUnpublishTip = async (tipId: string) => {
    await mockTipsService.unpublishTip(tipId);
    await refreshData();
  };

  const handleResetData = async () => {
    if (confirm('Ovo će vratiti sve podatke na fabrička podešavanja. Nastaviti?')) {
      await mockTipsService.resetTips();
      await importedMatchesService.clearMatches();
      mockSettingsService.resetSettings();
      setSettings(mockSettingsService.getSettings());
      refreshData();
      alert('Podaci su resetovani.');
    }
  };

  const handleSaveSettings = () => {
    mockSettingsService.saveSettings(settings);
    setSettingsSaved(true);
    window.setTimeout(() => setSettingsSaved(false), 2000);
  };

  const openUsersTab = (filter: UserStatusFilter) => {
    setUserStatusFilter(filter);
    setActiveTab('users');
  };

  const openTipsTab = (filter: TipPublicationFilter) => {
    setTipPublicationFilter(filter);
    setActiveTab('tips');
  };

  const getUserAccountLabel = (currentUser: User) => {
    if (currentUser.accountStatus === 'blocked' || currentUser.membershipStatus === MembershipStatus.BLOCKED) return 'BLOKIRAN';
    if (!currentUser.emailVerified) return 'PENDING';
    if (currentUser.vipAccess && currentUser.membershipStatus === MembershipStatus.APPROVED) return 'VIP';
    if (currentUser.emailVerified) return 'FREE';
    return 'PENDING';
  };

  const getUserAccountClass = (currentUser: User) => {
    const label = getUserAccountLabel(currentUser);
    if (label === 'VIP') return 'border-gold-500/30 bg-gold-500/10 text-gold-400';
    if (label === 'FREE') return 'border-green-500/25 bg-green-500/10 text-green-400';
    if (label === 'BLOKIRAN') return 'border-red-500/30 bg-red-500/10 text-red-400';
    return 'border-blue-500/25 bg-blue-500/10 text-blue-300';
  };

  const getUserPackageLabel = (currentUser: User) => {
    if ((currentUser.vipAccess || currentUser.vipApproved) && currentUser.membershipStatus === MembershipStatus.APPROVED) {
      return currentUser.planName || currentUser.plan || 'VIP';
    }

    return 'Nema paket';
  };

  const autoGradeTip = async (tipId: string) => {
    setLoading(true);
    const tip = tips.find(t => t.id === tipId);
    if (!tip) {
      setLoading(false);
      return;
    }

    let allMatchesWon = true;
    let anyMatchLost = false;
    let anyMatchPending = false;

    const updatedMatches = await Promise.all(tip.matches.map(async (m) => {
      // If already has a result and status, we might want to skip or re-verify
      if (!m.externalMatchId) {
         anyMatchPending = true;
         return m;
      }

      const matchResult = availableMatches.find(am => am.id === m.externalMatchId);

      if (!matchResult) {
         anyMatchPending = true;
         return m;
      }

      const homeScore = matchResult.homeScore;
      const awayScore = matchResult.awayScore;
      const prediction = m.prediction.toUpperCase();
      const totalGoals = homeScore + awayScore;
      
      let status = evaluateImportedMatchPrediction(prediction, matchResult);
      if (prediction === 'GG3+') {
        status = homeScore > 0 && awayScore > 0 && totalGoals >= 3 ? TicketStatus.WON : TicketStatus.LOST;
      } else if (prediction === 'OVER 2.5') {
        status = totalGoals >= 3 ? TicketStatus.WON : TicketStatus.LOST;
      }

      if (status === TicketStatus.LOST) anyMatchLost = true;
      if (status !== TicketStatus.WON) allMatchesWon = false;

      return { 
        ...m, 
        status, 
        result: `${homeScore}:${awayScore}` 
      };
    }));

    const finalStatus = anyMatchLost ? TicketStatus.LOST : (allMatchesWon && !anyMatchPending ? TicketStatus.WON : TicketStatus.PENDING);
    
    const updatedTip: Tip = {
      ...tip,
      matches: updatedMatches,
      status: finalStatus,
    };

    await mockTipsService.updateTip(updatedTip);
    await refreshData();
    setLoading(false);
  };

  const linkMatch = async (tipId: string, matchIndex: number, externalId: string) => {
    const tip = tips.find(t => t.id === tipId);
    if (!tip) return;

    const updatedMatches = [...tip.matches];
    updatedMatches[matchIndex] = { ...updatedMatches[matchIndex], externalMatchId: externalId };

    const updatedTip = { ...tip, matches: updatedMatches };
    await mockTipsService.updateTip(updatedTip);
    await refreshData();
  };

  const renderTicketBuilderPanel = () => {
    if (ticketCart.length === 0) return null;

    return (
      <div className="glass p-6 rounded-[2rem] border-gold-500/30 mb-8 shadow-[0_0_35px_rgba(245,124,0,0.08)]">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-5 mb-6">
          <div>
            <div className="text-[10px] text-gold-500 font-black uppercase tracking-[0.24em] mb-2">
              Trenutni tiket
            </div>
            <h3 className="text-2xl font-display font-bold">
              {getTicketKind(ticketCart.length)} · {ticketCart.length} {ticketCart.length === 1 ? 'par' : 'parova'}
            </h3>
            <p className="text-xs text-neutral-500 mt-2">
              Podesite tip, kvotu i komentar za svaki meč, pa objavite tiket javno.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={() => {
                setTicketAccessType('FREE');
                applyDefaultTicketStake('FREE', ticketCart.length);
              }}
              className={`rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest border ${ticketAccessType === 'FREE' ? 'bg-white text-black border-white' : 'bg-black/40 border-white/10 text-neutral-500'}`}
            >
              FREE
            </button>
            <button
              onClick={() => {
                setTicketAccessType('VIP');
                applyDefaultTicketStake('VIP', ticketCart.length);
              }}
              className={`rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest border ${ticketAccessType === 'VIP' ? 'bg-gold-500 text-black border-gold-500' : 'bg-black/40 border-white/10 text-neutral-500'}`}
            >
              VIP
            </button>
            <select
              value={ticketStatus}
              onChange={(e) => setTicketStatus(e.target.value as TicketStatus)}
              className="col-span-2 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-300 outline-none focus:border-gold-500/50"
            >
              <option value={TicketStatus.PENDING}>AKTIVAN</option>
              <option value={TicketStatus.WON}>PROŠLO</option>
              <option value={TicketStatus.LOST}>PALO</option>
              <option value={TicketStatus.POSTPONED}>ODLOŽENO</option>
              <option value={TicketStatus.REFUND}>KVOTA 1 / POVRAT</option>
            </select>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          {ticketCart.map((item, index) => (
            <div key={item.match.id} className="bg-black/35 border border-white/10 rounded-2xl p-4">
              <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-1">
                    #{index + 1} · {item.match.date} · {item.match.league}
                  </div>
                  <div className="font-bold text-neutral-100">
                    {item.match.homeTeam} - {item.match.awayTeam}
                  </div>
                  <div className="mt-2 text-xs text-neutral-500">
                    Rezultat: <span className="text-gold-500 font-black">{item.match.homeScore} - {item.match.awayScore}</span>
                  </div>
                </div>

                <div className="grid sm:grid-cols-[120px_120px_1fr_auto] gap-3 flex-1">
                  <select
                    value={item.prediction}
                    onChange={(e) => handleUpdateTicketPrediction(item.match.id, e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-gold-500/50"
                  >
                    {tipOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    value={item.odds}
                    onChange={(e) => handleUpdateTicketItem(item.match.id, { odds: e.target.value })}
                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-gold-500/50"
                    placeholder="Kvota"
                  />
                  <input
                    value={item.analysis}
                    onChange={(e) => handleUpdateTicketItem(item.match.id, { analysis: e.target.value })}
                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-gold-500/50"
                    placeholder="Komentar / analiza"
                  />
                  <button
                    onClick={() => handleRemoveTicketItem(item.match.id)}
                    className="p-3 bg-white/5 rounded-xl hover:text-red-500 transition-colors"
                    aria-label="Ukloni meč iz tiketa"
                  >
                    <MinusCircle size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-t border-white/10 pt-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
              <div className="text-[9px] text-neutral-500 font-black uppercase tracking-widest">Broj parova</div>
              <div className="text-2xl font-display font-black">{ticketCart.length}</div>
            </div>
            <div className="bg-gold-500/10 border border-gold-500/20 rounded-2xl px-5 py-3">
              <div className="text-[9px] text-neutral-500 font-black uppercase tracking-widest">Ukupna kvota</div>
              <div className="text-2xl font-display font-black text-gold-500">{ticketTotalOdds.toFixed(2)}</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3 col-span-2 sm:col-span-1">
              <div className="text-[9px] text-neutral-500 font-black uppercase tracking-widest">Tip tiketa</div>
              <div className="text-2xl font-display font-black">{getTicketKind(ticketCart.length)}</div>
            </div>
            <label className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3 col-span-2 sm:col-span-1">
              <div className="text-[9px] text-neutral-500 font-black uppercase tracking-widest">Units</div>
              <input
                type="number"
                min="1"
                max="10"
                step="0.5"
                value={ticketUnits}
                onChange={(e) => setTicketUnits(e.target.value)}
                className="w-full bg-transparent text-2xl font-display font-black outline-none text-neutral-100"
              />
              <div className="text-[9px] text-neutral-500 font-black uppercase tracking-widest">
                {Number(ticketUnits) || 0}u = {unitsToRsd(Number(ticketUnits) || 0).toLocaleString('sr-RS')} RSD
              </div>
            </label>
            <label className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3 col-span-2 sm:col-span-1">
              <div className="text-[9px] text-neutral-500 font-black uppercase tracking-widest">Vreme objave tiketa</div>
              <input
                type="time"
                value={ticketPublishedTime}
                onChange={(event) => setTicketPublishedTime(event.target.value)}
                className="w-full bg-transparent text-xl font-display font-black outline-none text-neutral-100"
              />
            </label>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setTicketCart([])}
              className="px-5 py-3 bg-white/5 text-neutral-300 border border-white/10 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-white/10 transition-all"
            >
              Isprazni tiket
            </button>
            <button
              onClick={handlePublishTicket}
              className="px-7 py-3 bg-gold-500 text-black text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-gold-600 transition-all shadow-lg shadow-gold-500/20"
            >
              Objavi tiket
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderFloatingTicketBuilderPanel = () => {
    if (ticketCart.length === 0) return null;

    return (
      <aside className="fixed inset-x-4 bottom-4 z-[70] max-h-[82vh] overflow-y-auto rounded-[2rem] border border-gold-500/30 bg-neutral-950/95 p-5 shadow-2xl shadow-black/60 backdrop-blur-2xl md:inset-x-auto md:bottom-6 md:right-6 md:top-24 md:w-[430px]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-gold-500">
              Trenutni tiket
            </div>
            <h3 className="font-display text-xl font-bold">
              {builderTicketType} · {ticketCart.length} {ticketCart.length === 1 ? 'par' : 'parova'}
            </h3>
            <p className="mt-2 text-xs text-neutral-500">
              Podesite tip za svaki meč, kvote i units za ceo tiket.
            </p>
          </div>
          <button
            onClick={handleClearTicketCart}
            className="rounded-xl bg-white/5 p-2 text-neutral-400 transition-colors hover:text-red-400"
            aria-label="Ocisti tiket"
          >
            <X size={18} />
          </button>
        </div>

        <div className="my-4 space-y-3">
          {ticketCart.map((item, index) => (
            <div key={item.match.id} className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                    #{index + 1} · {item.match.date} / FT
                  </div>
                  <div className="truncate text-sm font-black text-neutral-100">
                    {item.match.homeTeam} - {item.match.awayTeam}
                  </div>
                  <div className="mt-1 text-[11px] font-bold text-neutral-500">
                    {item.match.league || 'Liga nije uneta'}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveTicketItem(item.match.id)}
                  className="rounded-xl bg-white/5 p-2 text-neutral-400 transition-colors hover:text-red-400"
                  aria-label="Ukloni meč iz tiketa"
                >
                  <MinusCircle size={17} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-neutral-500">Tip</span>
                  <select
                    value={item.prediction}
                    onChange={(e) => handleUpdateTicketPrediction(item.match.id, e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-gold-500/50"
                  >
                    {tipOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-neutral-500">Kvota</span>
                  <input
                    type="number"
                    step="0.01"
                    value={item.odds}
                    onChange={(e) => handleUpdateTicketItem(item.match.id, { odds: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-gold-500/50"
                    placeholder="Kvota"
                  />
                </label>
                <label className="col-span-2">
                  <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-neutral-500">Komentar</span>
                  <input
                    value={item.analysis}
                    onChange={(e) => handleUpdateTicketItem(item.match.id, { analysis: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-gold-500/50"
                    placeholder="Komentar / analiza"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t border-white/10 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-gold-500/20 bg-gold-500/10 px-4 py-3">
              <div className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Ukupna kvota</div>
              <div className="font-display text-2xl font-black text-gold-500">{ticketTotalOdds.toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Broj parova</div>
              <div className="font-display text-2xl font-black">{ticketCart.length}</div>
            </div>
          </div>

          <label className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Ulog u Units za ceo tiket</div>
            <input
              type="number"
              min="1"
              max="10"
              step="0.5"
              value={ticketUnits}
              onChange={(e) => setTicketUnits(e.target.value)}
              className="w-full bg-transparent font-display text-2xl font-black text-neutral-100 outline-none"
            />
            <div className="text-[9px] font-black uppercase tracking-widest text-neutral-500">
              {Number(ticketUnits) || 0}u = {unitsToRsd(Number(ticketUnits) || 0).toLocaleString('sr-RS')} RSD
            </div>
          </label>

          <label className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Vreme objave tiketa</div>
            <input
              type="time"
              value={ticketPublishedTime}
              onChange={(event) => setTicketPublishedTime(event.target.value)}
              className="w-full bg-transparent font-display text-xl font-black text-neutral-100 outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[9px] font-black uppercase tracking-widest text-neutral-500">Tip tiketa</span>
            <select
              value={builderTicketType}
              onChange={(e) => setBuilderTicketType(e.target.value as BuilderTicketType)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-black uppercase tracking-widest text-neutral-200 outline-none focus:border-gold-500/50"
            >
              <option value="VIP Dubl">VIP Dubl</option>
              <option value="VIP Combo">VIP Combo</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-[9px] font-black uppercase tracking-widest text-neutral-500">Status</span>
            <select
              value={ticketStatus}
              onChange={(e) => setTicketStatus(e.target.value as TicketStatus)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-black uppercase tracking-widest text-neutral-200 outline-none focus:border-gold-500/50"
            >
              <option value={TicketStatus.PENDING}>PENDING / AKTIVAN</option>
              <option value={TicketStatus.WON}>WON / PROŠLO</option>
              <option value={TicketStatus.LOST}>LOST / PALO</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={handlePublishTicket}
              className="rounded-2xl bg-gold-500 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-black shadow-lg shadow-gold-500/20 transition-all hover:bg-gold-600"
            >
              Sačuvaj tiket
            </button>
            <button
              onClick={handleClearTicketCart}
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-300 transition-all hover:bg-white/10"
            >
              Ocisti tiket
            </button>
          </div>
        </div>
      </aside>
    );
  };

  const menuItems = [
    { id: 'overview', label: 'Pregled', icon: <BarChart3 size={20} /> },
    { id: 'users', label: 'Korisnici', icon: <Users size={20} /> },
    { id: 'matches', label: 'Baza utakmica', icon: <Database size={20} /> },
    { id: 'tips', label: 'Tipovi', icon: <FileText size={20} /> },
    { id: 'analyses', label: 'Dnevni Tipovi', icon: <TrendingUp size={20} /> },
    { id: 'settings', label: 'Podešavanja', icon: <Settings size={20} /> },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.06),transparent_34%),#0a0a0a] flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className={`
        fixed md:relative z-50 w-64 h-screen bg-black/90 backdrop-blur-xl border-r border-white/10 transition-transform duration-300
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-8 pb-4">
          <Link to="/" className="text-2xl font-display font-black tracking-tighter flex items-center gap-2">
            <span className="gold-text">ELITE</span> ADMIN
          </Link>
        </div>

        <nav className="p-4 space-y-2 mt-8">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id as any);
                setIsMobileMenuOpen(false);
              }}
              className={`
                w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-sm font-bold transition-all
                ${activeTab === item.id 
                  ? 'bg-gold-500 text-black shadow-lg shadow-gold-500/15'
                  : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-200 hover:translate-x-0.5'}
              `}
            >
              {item.icon}
              {item.label}
              {activeTab === item.id && <ChevronRight size={16} className="ml-auto" />}
            </button>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 w-full p-4 border-t border-white/5">
           <button 
             onClick={logout}
             className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-bold text-red-500 hover:bg-red-500/10 transition-all"
           >
             <LogOut size={20} />
             Odjavi se
           </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto max-h-screen">
        {/* Top Header */}
        <header className="sticky top-0 z-40 bg-neutral-950/85 backdrop-blur-xl border-b border-white/10 px-5 py-4 md:px-8 flex items-center justify-between">
            <button 
              className="md:hidden p-2 text-neutral-400"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X /> : <Menu />}
            </button>
            <div className="flex items-center gap-4 ml-auto">
               <div className="relative">
                 <button
                   type="button"
                   onClick={() => setShowNotifications((value) => !value)}
                   className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-neutral-300 transition-all hover:border-gold-500/40 hover:text-gold-500"
                   aria-label="Admin obavestenja"
                 >
                   <Bell size={18} />
                   {unreadNotifications.length > 0 && (
                     <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-black text-black">
                       {unreadNotifications.length}
                     </span>
                   )}
                 </button>

                 {showNotifications && (
                   <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-3xl border border-white/10 bg-neutral-950 shadow-2xl">
                     <div className="border-b border-white/10 p-4">
                       <div className="text-sm font-black">Admin obavestenja</div>
                       <div className="text-[10px] uppercase tracking-widest text-neutral-500">{unreadNotifications.length} neprocitanih</div>
                     </div>
                     <div className="max-h-96 overflow-y-auto p-3">
                       {notifications.length === 0 ? (
                         <div className="p-4 text-sm text-neutral-500">Nema novih obavestenja.</div>
                       ) : notifications.slice(0, 8).map((notification) => (
                         <div
                           key={notification.id}
                           className={`mb-2 w-full rounded-2xl border p-3 text-left transition-all hover:border-gold-500/40 ${notification.read ? 'border-white/5 bg-white/[0.02]' : 'border-gold-500/30 bg-gold-500/10'}`}
                         >
                           <button
                             type="button"
                             onClick={() => {
                               setActiveTab('users');
                               setUserStatusFilter('pending');
                               setShowNotifications(false);
                             }}
                             className="block w-full text-left"
                           >
                             <div className="text-[10px] font-black uppercase tracking-widest text-gold-500">
                               {notification.type === 'vip_plan_request' ? 'VIP zahtev' : 'Nova registracija'}
                             </div>
                             <div className="mt-1 text-sm font-bold">{notification.username || notification.userEmail}</div>
                             <div className="text-xs text-neutral-500">{notification.userEmail}</div>
                           </button>
                           <div className="mt-2 flex items-center justify-between gap-3">
                             <span className="text-[10px] uppercase text-neutral-400">{notification.selectedPlan}</span>
                             {!notification.read && (
                               <button
                                 type="button"
                                 onClick={(event) => {
                                   event.stopPropagation();
                                   handleMarkNotificationRead(notification.id);
                                 }}
                                 className="text-[10px] font-black uppercase text-gold-500"
                               >
                                 Procitano
                               </button>
                             )}
                           </div>
                         </div>
                       ))}
                     </div>
                   </div>
                 )}
               </div>
               <div className="text-right hidden sm:block">
                  <div className="text-sm font-bold">{user?.displayName}</div>
                  <div className="text-xs text-neutral-500">Glavni Adminov</div>
               </div>
               <div className="w-10 h-10 rounded-full bg-gold-500 flex items-center justify-center text-black font-black">
                  {user?.displayName?.[0] || 'A'}
               </div>
            </div>
        </header>

        <div className={`p-8 transition-[padding] duration-300 ${ticketCart.length > 0 ? 'md:pr-[470px]' : ''}`}>
           <AnimatePresence mode="wait">
              {activeTab === 'overview' && (
                <AdminOverview
                  userCount={userList.length}
                  activeVipCount={userList.filter((member) => member.membershipStatus === MembershipStatus.APPROVED).length}
                  pendingCount={userList.filter((member) => member.membershipStatus === MembershipStatus.PENDING).length}
                  roi={stats?.roi ?? 0}
                  matchCount={availableMatches.length}
                  draftCount={draftTips.length}
                  publishedCount={tips.filter((tip) => tip.publicationStatus === TipPublicationStatus.PUBLISHED).length}
                  onOpenApprovedUsers={() => openUsersTab('approved')}
                  onOpenPendingUsers={() => openUsersTab('pending')}
                  onOpenMatches={() => setActiveTab('matches')}
                  onOpenDraftTips={() => openTipsTab('draft')}
                  onOpenPublishedTips={() => openTipsTab('published')}
                />
              )}

              {activeTab === 'users' && (
                 <motion.div key="users" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
                       <h2 className="text-3xl font-display font-bold">Upravljanje korisnicima</h2>
                       <div className="flex flex-wrap gap-2">
                         {[
                           { label: 'Svi', value: 'all' },
                           { label: 'Pending', value: 'pending' },
                           { label: 'Aktivni VIP', value: 'approved' },
                           { label: 'Expired', value: 'expired' },
                           { label: 'Blocked', value: 'blocked' },
                           { label: 'Free', value: 'free' },
                           { label: 'Silver', value: 'silver' },
                           { label: 'Gold', value: 'gold' },
                           { label: 'Elite', value: 'elite' },
                         ].map((filterOption) => (
                           <button
                             key={filterOption.value}
                             type="button"
                             onClick={() => setUserStatusFilter(filterOption.value as UserStatusFilter)}
                             className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                               userStatusFilter === filterOption.value
                                 ? 'bg-gold-500 text-black border-gold-500'
                                 : 'bg-white/5 text-neutral-400 border-white/10 hover:border-gold-500/40'
                             }`}
                           >
                             {filterOption.label}
                           </button>
                         ))}
                       </div>
                    </div>

                    <div className="glass mb-6 rounded-3xl border-white/5 p-4">
                      <input
                        value={userSearch}
                        onChange={(event) => setUserSearch(event.target.value)}
                        placeholder="Pretraga po emailu ili username..."
                        className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-neutral-200 outline-none transition-all placeholder:text-neutral-600 focus:border-gold-500/50"
                      />
                    </div>

                    <div className="glass rounded-[2rem] overflow-x-auto">
                       <table className="w-full text-left border-collapse">
                          <thead>
                             <tr className="bg-white/5 text-[10px] text-neutral-500 uppercase font-black tracking-widest">
                                <th className="px-6 py-4">Korisnik</th>
                                <th className="px-6 py-4">Email</th>
                                <th className="px-6 py-4">Verifikacija</th>
                                <th className="px-6 py-4">Status naloga</th>
                                <th className="px-6 py-4">Paket</th>
                                <th className="px-6 py-4">Registrovan</th>
                                <th className="px-6 py-4">VIP do</th>
                                <th className="px-6 py-4">Admin beleska</th>
                                <th className="px-6 py-4">Akcije</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                              {filteredUsers.map(u => (
                               <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                                  <td className="px-6 py-4">
                                     <div className="font-bold">{u.displayName || 'N/A'}</div>
                                     <div className="text-xs text-neutral-500">ID: {u.id.slice(0, 8)}</div>
                                  </td>
                                  <td className="px-6 py-4 text-xs font-bold text-neutral-300">
                                     {u.email}
                                  </td>
                                  <td className="px-6 py-4">
                                     <span className={`inline-flex rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest ${u.emailVerified ? 'border-green-500/25 bg-green-500/10 text-green-400' : 'border-neutral-500/20 bg-neutral-500/10 text-neutral-400'}`}>
                                       {u.emailVerified ? 'VERIFIKOVAN' : 'NIJE VERIFIKOVAN'}
                                     </span>
                                  </td>
                                  <td className="px-6 py-4">
                                     <span className={`inline-flex rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest ${getUserAccountClass(u)}`}>
                                       {getUserAccountLabel(u)}
                                     </span>
                                     <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                                       VIP: {u.vipAccess ? 'aktivan' : 'zakljucan'}
                                     </div>
                                  </td>
                                  <td className="px-6 py-4 text-xs font-bold text-neutral-300">
                                     <div>{getUserPackageLabel(u)}</div>
                                     {u.selectedPlan && u.selectedPlan !== 'free' && !u.vipAccess && (
                                       <div className="mt-1 text-[10px] text-blue-400">Zahtev: {u.selectedPlan}</div>
                                     )}
                                     {u.vipAccess && u.planDurationDays ? <div className="text-[10px] text-neutral-500">{u.planDurationDays} dana</div> : null}
                                  </td>
                                  <td className="px-6 py-4 text-xs text-neutral-400">{u.registeredAt || '-'}</td>
                                  <td className="px-6 py-4 text-xs text-neutral-400">{u.membershipExpDate || '-'}</td>
                                  <td className="px-6 py-4 min-w-[180px]">
                                    <textarea
                                      defaultValue={u.adminNote || ''}
                                      onBlur={(event) => {
                                        if (event.target.value !== (u.adminNote || '')) {
                                          handleUpdateAdminNote(u.id, event.target.value);
                                        }
                                      }}
                                      className="min-h-16 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-neutral-300 outline-none focus:border-gold-500/40"
                                      placeholder="Beleska..."
                                    />
                                  </td>
                                  <td className="px-6 py-4">
                                     <div className="grid min-w-[520px] grid-cols-2 gap-2 xl:grid-cols-3">
                                        <button disabled={u.emailVerified} onClick={() => handleVerifyUser(u)} className="rounded-xl bg-green-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-green-400 hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-35">Verifikuj nalog</button>
                                        <button onClick={() => handleSetFreeUser(u)} className="rounded-xl bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-300 hover:bg-white/10">Free</button>
                                        <button onClick={() => handleUpdateUserStatus(u.id, MembershipStatus.APPROVED)} className="rounded-xl bg-green-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-green-400 hover:bg-green-500/20">Odobri VIP</button>
                                        <button onClick={() => handleRemoveVip(u)} className="rounded-xl bg-orange-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-orange-300 hover:bg-orange-500/20">Ukini VIP</button>
                                        <button onClick={() => handleActivateUserPlan(u, 'silver_7')} className="rounded-xl bg-gold-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gold-400 hover:bg-gold-500/20">Silver 7</button>
                                        <button onClick={() => handleActivateUserPlan(u, 'gold_30')} className="rounded-xl bg-gold-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gold-400 hover:bg-gold-500/20">Gold 30</button>
                                        <button onClick={() => handleActivateUserPlan(u, 'elite_90')} className="rounded-xl bg-gold-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gold-400 hover:bg-gold-500/20">Elite 90</button>
                                        <button onClick={() => handleExtendUser(u, 7)} className="rounded-xl bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-300 hover:bg-white/10">+7 dana</button>
                                        <button onClick={() => handleExtendUser(u, 30)} className="rounded-xl bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-300 hover:bg-white/10">+30 dana</button>
                                        <button onClick={() => handleExtendUser(u, 90)} className="rounded-xl bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-300 hover:bg-white/10">+90 dana</button>
                                        {u.accountStatus === 'blocked' || u.membershipStatus === MembershipStatus.BLOCKED ? (
                                          <button onClick={() => handleUnblockUser(u.id)} className="rounded-xl bg-green-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-green-400 hover:bg-green-500/20">Odblokiraj</button>
                                        ) : (
                                          <button onClick={() => handleUpdateUserStatus(u.id, MembershipStatus.BLOCKED)} className="rounded-xl bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-400 hover:bg-red-500/20">Blokiraj</button>
                                        )}
                                        <button onClick={() => handleDeleteUser(u.id)} className="rounded-xl bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-red-400">
                                          Obriši
                                        </button>
                                     </div>
                                  </td>
                               </tr>
                              ))}
                              {filteredUsers.length === 0 && (
                                <tr>
                                  <td colSpan={9} className="px-6 py-10 text-center text-neutral-500 font-bold">
                                    Nema korisnika za izabrani filter.
                                  </td>
                                </tr>
                              )}
                           </tbody>
                       </table>
                    </div>
                 </motion.div>
              )}

              {activeTab === 'matches' && (
                 <motion.div key="matches" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
                       <div>
                          <h2 className="text-3xl font-display font-bold">Baza utakmica</h2>
                          <p className="text-sm text-neutral-500 mt-2">Importovane utakmice vidi samo admin. Public deo dobija samo objavljene tipove.</p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <button
                            onClick={handlePrepareHistory}
                            disabled={availableMatches.length === 0}
                            className="flex items-center justify-center gap-2 px-5 py-3 bg-gold-500 text-black border border-gold-500 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-gold-600 transition-all disabled:opacity-40"
                          >
                            <RefreshCw size={14} /> Pripremi istoriju
                          </button>
                          <button
                            onClick={handleClearImportedMatches}
                            disabled={availableMatches.length === 0}
                            className="flex items-center justify-center gap-2 px-5 py-3 bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-red-500/20 transition-all disabled:opacity-40"
                          >
                            <Trash2 size={14} /> Obriši bazu
                          </button>
                        </div>
                     </div>

                    {historyPrepMessage && (
                      <div className="glass p-4 rounded-2xl border-gold-500/20 mb-6 text-sm text-neutral-300">
                        {historyPrepMessage}
                      </div>
                    )}

                    <div className="glass p-6 rounded-[2rem] border-white/5 mb-8">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                        <div>
                          <h3 className="text-xl font-bold">Import CSV/Excel</h3>
                          <p className="text-xs text-neutral-500 mt-2">
                            Podrzane kolone: date, league, homeTeam, awayTeam, homeScore, awayScore, oddsHome, oddsDraw, oddsAway.
                          </p>
                        </div>
                        <label className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gold-500 text-black font-black uppercase tracking-widest rounded-2xl hover:bg-gold-600 transition-all cursor-pointer text-[10px]">
                          <Upload size={16} /> Upload fajl
                          <input
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={handleImportMatches}
                            className="hidden"
                          />
                        </label>
                      </div>
                      {importMessage && (
                        <div className="mt-4 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-neutral-300">
                          {importMessage}
                        </div>
                      )}
                    </div>

                     <div className="glass p-5 rounded-[2rem] border-white/5 mb-8">
                      <div className="grid md:grid-cols-4 gap-3">
                        <input
                          value={matchTeamFilter}
                          onChange={(e) => setMatchTeamFilter(e.target.value)}
                          className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                          placeholder="Pretraga po timu..."
                        />
                        <select
                          value={matchLeagueFilter}
                          onChange={(e) => setMatchLeagueFilter(e.target.value)}
                          className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                        >
                          <option value="all">Sve lige</option>
                          {availableLeagues.map((league) => (
                            <option key={league} value={league}>{league}</option>
                          ))}
                        </select>
                        <input
                          type="date"
                          value={matchDateFilter}
                          onChange={(e) => setMatchDateFilter(e.target.value)}
                          className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                        />
                        <button
                          onClick={() => {
                            setMatchTeamFilter('');
                            setMatchLeagueFilter('all');
                            setMatchDateFilter('');
                          }}
                          className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest hover:border-gold-500/40 transition-all"
                        >
                          Reset filtera
                        </button>
                      </div>
                      <div className="mt-4 text-[10px] text-neutral-500 font-black uppercase tracking-widest">
                        Prikazano {Math.min(filteredAvailableMatches.length, 300)} od {filteredAvailableMatches.length} filtriranih / ukupno {availableMatches.length}
                       </div>
                     </div>

                     {renderFloatingTicketBuilderPanel()}

                     {resultTipMatch && (
                      <div className="glass p-6 rounded-[2rem] border-gold-500/30 mb-8">
                        <div className="flex items-start justify-between gap-4 mb-5">
                          <div>
                            <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-1">{resultTipMatch.date} · {resultTipMatch.league}</div>
                            <h3 className="text-xl font-bold">{resultTipMatch.homeTeam} - {resultTipMatch.awayTeam}</h3>
                            <p className="text-gold-500 font-display font-black mt-1">
                              {resultTipMatch.homeScore} - {resultTipMatch.awayScore}
                            </p>
                          </div>
                          <button onClick={() => setResultTipMatch(null)} className="p-2 bg-white/5 rounded-xl hover:text-red-500 transition-colors">
                            <X size={18} />
                          </button>
                        </div>

                        <div className="grid md:grid-cols-6 gap-3 mb-4">
                          <select
                            value={resultTipForm.prediction}
                            onChange={(e) => {
                              const prediction = e.target.value;
                              setResultTipForm({
                                ...resultTipForm,
                                prediction,
                                odds: getDefaultOddsForPrediction(prediction, resultTipMatch).toFixed(2),
                              });
                            }}
                            className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                          >
                            {tipOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            step="0.01"
                            value={resultTipForm.odds}
                            onChange={(e) => setResultTipForm({ ...resultTipForm, odds: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                            placeholder="Kvota"
                          />
                          <input
                            type="number"
                            min="1"
                            max="10"
                            step="0.5"
                            value={resultTipForm.unitsStake}
                            onChange={(e) => setResultTipForm({ ...resultTipForm, unitsStake: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                            placeholder="Units"
                          />
                          <div className="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-[10px] text-neutral-500 font-black uppercase tracking-widest">
                            {Number(resultTipForm.unitsStake) || 0}u = {unitsToRsd(Number(resultTipForm.unitsStake) || 0).toLocaleString('sr-RS')} RSD
                          </div>
                          <select
                            value={resultTipForm.status}
                            onChange={(e) => setResultTipForm({ ...resultTipForm, status: e.target.value as TicketStatus })}
                            className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                          >
                            <option value={TicketStatus.WON}>PROŠLO</option>
                            <option value={TicketStatus.LOST}>PALO</option>
                            <option value={TicketStatus.POSTPONED}>ODLOŽENO</option>
                            <option value={TicketStatus.REFUND}>KVOTA 1 / POVRAT</option>
                          </select>
                          <button
                            onClick={() => setResultTipForm({ ...resultTipForm, isVip: false, unitsStake: String(getDefaultUnitsStake(false, 1)) })}
                            className={`rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest border ${!resultTipForm.isVip ? 'bg-white text-black border-white' : 'bg-black/40 border-white/10 text-neutral-500'}`}
                          >
                            FREE
                          </button>
                          <button
                            onClick={() => setResultTipForm({ ...resultTipForm, isVip: true, unitsStake: String(getDefaultUnitsStake(true, 1)) })}
                            className={`rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest border ${resultTipForm.isVip ? 'bg-gold-500 text-black border-gold-500' : 'bg-black/40 border-white/10 text-neutral-500'}`}
                          >
                            VIP
                          </button>
                        </div>
                        <textarea
                          value={resultTipForm.analysis}
                          onChange={(e) => setResultTipForm({ ...resultTipForm, analysis: e.target.value })}
                          rows={3}
                          className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-gold-500/50 mb-4"
                          placeholder="Komentar / analiza (opciono)"
                        />
                        <div className="grid sm:grid-cols-2 gap-3">
                          <button
                            onClick={() => handleCreateTipFromResult(false)}
                            className="w-full py-4 bg-white/5 text-neutral-200 font-black uppercase tracking-widest rounded-2xl hover:bg-white/10 transition-all"
                          >
                            Sačuvaj kao DRAFT
                          </button>
                          <button
                            onClick={() => handleCreateTipFromResult(true)}
                            className="w-full py-4 bg-gold-500 text-black font-black uppercase tracking-widest rounded-2xl hover:bg-gold-600 transition-all"
                          >
                            Objavi tip
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid gap-4">
                      {filteredAvailableMatches.slice(0, 300).map((match) => (
                        <div key={match.id} className="glass p-5 rounded-[2rem] border-white/5">
                          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
                            <div>
                              <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-1">{match.date} · {match.league}</div>
                              <div className="font-bold text-neutral-100 text-lg">{match.homeTeam} - {match.awayTeam}</div>
                              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-neutral-500">
                                <span>Rezultat: <strong className="text-gold-500">{match.homeScore} - {match.awayScore}</strong></span>
                                <span>1: {match.oddsHome.toFixed(2)}</span>
                                <span>X: {match.oddsDraw.toFixed(2)}</span>
                                <span>2: {match.oddsAway.toFixed(2)}</span>
                              </div>
                            </div>
                             <div className="flex items-center gap-2">
                               <button
                                 onClick={() => handleOpenResultTip(match)}
                                 className="px-5 py-3 bg-gold-500 text-black text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-gold-600 transition-all"
                               >
                                 Dodaj tip
                               </button>
                               <button
                                 onClick={() => handleAddMatchToTicket(match)}
                                 disabled={ticketCart.some((item) => item.match.id === match.id)}
                                 className={`inline-flex items-center gap-2 px-5 py-3 border text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
                                   ticketCart.some((item) => item.match.id === match.id)
                                     ? 'bg-gold-500/10 text-gold-500 border-gold-500/30 cursor-not-allowed'
                                     : 'bg-white/5 text-neutral-200 border-white/10 hover:border-gold-500/40 hover:text-gold-500'
                                 }`}
                               >
                                 <Plus size={14} /> {ticketCart.some((item) => item.match.id === match.id) ? 'Dodato' : 'Dodaj na tiket'}
                               </button>
                               <button
                                 onClick={() => handleDeleteImportedMatch(match.id)}
                                className="p-3 bg-white/5 rounded-xl hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}

                      {filteredAvailableMatches.length > 300 && (
                        <div className="glass p-6 rounded-[2rem] border-white/5 text-center">
                          <p className="text-neutral-500 font-bold">Prikazano je prvih 300 utakmica.</p>
                          <p className="text-xs text-neutral-600 mt-2">Koristite pretragu po timu, ligi ili datumu za precizniji izbor.</p>
                        </div>
                      )}

                      {availableMatches.length === 0 && (
                        <div className="glass p-10 rounded-[2rem] border-white/5 text-center">
                          <Database className="text-neutral-700 mx-auto mb-3" size={40} />
                          <p className="text-neutral-500 font-bold">Admin baza utakmica je prazna.</p>
                          <p className="text-xs text-neutral-600 mt-2">Uploadujte CSV ili Excel fajl da dodate istorijske rezultate.</p>
                        </div>
                      )}
                      {availableMatches.length > 0 && filteredAvailableMatches.length === 0 && (
                        <div className="glass p-10 rounded-[2rem] border-white/5 text-center">
                          <Database className="text-neutral-700 mx-auto mb-3" size={40} />
                          <p className="text-neutral-500 font-bold">Nema utakmica za izabrane filtere.</p>
                        </div>
                      )}
                    </div>
                 </motion.div>
              )}

              {activeTab === 'tips' && (
                 <motion.div key="tips" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
                       <div>
                         <h2 className="text-3xl font-display font-bold">Upravljanje tipovima</h2>
                         <p className="text-sm text-neutral-500 mt-2">
                           Draft tikete vidi samo admin. Public/statistika koriste samo objavljene tikete.
                         </p>
                       </div>
                       <div className="flex flex-col sm:flex-row gap-3">
                        <button
                         onClick={handlePrepareHistory}
                         disabled={availableMatches.length === 0}
                         className="px-6 py-3 bg-white/5 text-neutral-200 border border-white/10 font-bold rounded-2xl hover:border-gold-500/40 hover:text-gold-500 transition-all disabled:opacity-40"
                        >
                          Pripremi istoriju
                        </button>
                        <button 
                         onClick={() => setIsTipModalOpen(true)}
                         className="px-6 py-3 bg-gold-500 text-black font-bold rounded-2xl hover:bg-gold-600 transition-all shadow-lg shadow-gold-500/20"
                        >
                          Novi Tip
                        </button>
                       </div>
                    </div>

                    {historyPrepMessage && (
                      <div className="glass p-4 rounded-2xl border-gold-500/20 mb-6 text-sm text-neutral-300">
                        {historyPrepMessage}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                      <div className="glass p-5 rounded-2xl border-white/5">
                        <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-1">Draft tiketi</div>
                        <div className="text-2xl font-display font-bold">{draftTips.length}</div>
                      </div>
                      <div className="glass p-5 rounded-2xl border-white/5">
                        <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-1">Spremno za objavu</div>
                        <div className="text-2xl font-display font-bold text-gold-500">{draftTips.filter((tip) => tip.status !== TicketStatus.PENDING).length}</div>
                      </div>
                      <div className="glass p-5 rounded-2xl border-white/5">
                        <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-1">Objavljeno</div>
                        <div className="text-2xl font-display font-bold text-green-500">{tips.filter((tip) => tip.publicationStatus === TipPublicationStatus.PUBLISHED).length}</div>
                      </div>
                    </div>

                    <div className="glass p-4 rounded-2xl border-white/5 mb-8 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mr-2">Filter tiketa</span>
                      {[
                        { label: 'Svi', value: 'all' },
                        { label: 'DRAFT', value: 'draft' },
                        { label: 'PUBLISHED', value: 'published' },
                      ].map((filterOption) => (
                        <button
                          key={filterOption.value}
                          type="button"
                          onClick={() => setTipPublicationFilter(filterOption.value as TipPublicationFilter)}
                          className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                            tipPublicationFilter === filterOption.value
                              ? 'bg-gold-500 text-black border-gold-500'
                              : 'bg-white/5 text-neutral-400 border-white/10 hover:border-gold-500/40'
                          }`}
                        >
                          {filterOption.label}
                        </button>
                      ))}
                    </div>

                    {apiIssues.length > 0 && (
                      <div className="bg-red-500/10 border border-red-500/20 p-5 rounded-3xl mb-6">
                        <h3 className="font-bold text-red-500 mb-2">Import upozorenja</h3>
                        <div className="space-y-1">
                          {apiIssues.map((issue) => (
                            <p key={`${issue.competitionCode}-${issue.message}`} className="text-xs text-neutral-400">
                              {issue.competitionName}: {issue.message}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="glass p-6 rounded-[2rem] border-white/5 mb-8">
                      <div className="flex items-center justify-between gap-4 mb-5">
                        <div>
                          <h3 className="text-xl font-bold">Dodaj tip iz admin baze</h3>
                          <p className="text-xs text-neutral-500">Tip se prvo cuva kao DRAFT i nije javno vidljiv dok ga ne objavite.</p>
                        </div>
                        <span className="px-3 py-1 rounded-full bg-green-500/10 text-green-500 border border-green-500/20 text-[10px] font-black uppercase tracking-widest">
                          Import
                        </span>
                      </div>

                      {availableMatches.length > 0 ? (
                        <div className="max-h-[360px] overflow-y-auto space-y-3 pr-1">
                          {availableMatches.slice(0, 80).map((match) => (
                            <div key={match.id} className="bg-white/5 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                              <div>
                                <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-1">{match.date} · {match.league}</div>
                                <div className="font-bold text-neutral-200">{match.homeTeam} - {match.awayTeam}</div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="px-4 py-2 bg-black/40 rounded-xl text-gold-500 font-display font-black">
                                  {match.homeScore} - {match.awayScore}
                                </span>
                                <button
                                  onClick={() => handleOpenResultTip(match)}
                                  className="px-4 py-2 bg-gold-500 text-black text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-gold-600 transition-all"
                                >
                                  Dodaj tip
                                </button>
                                 <button
                                   onClick={() => handleAddMatchToTicket(match)}
                                   disabled={ticketCart.some((item) => item.match.id === match.id)}
                                   className={`inline-flex items-center gap-2 px-4 py-2 border text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
                                     ticketCart.some((item) => item.match.id === match.id)
                                       ? 'bg-gold-500/10 text-gold-500 border-gold-500/30 cursor-not-allowed'
                                       : 'bg-white/5 text-neutral-200 border-white/10 hover:border-gold-500/40 hover:text-gold-500'
                                   }`}
                                 >
                                   <Plus size={14} /> {ticketCart.some((item) => item.match.id === match.id) ? 'Dodato' : 'Dodaj na tiket'}
                                 </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <AlertTriangle className="text-neutral-700 mx-auto mb-3" size={36} />
                          <p className="text-neutral-500 font-bold">Nema utakmica u admin bazi.</p>
                        </div>
                      )}
                    </div>

                    {renderFloatingTicketBuilderPanel()}

                    {resultTipMatch && (
                      <div className="glass p-6 rounded-[2rem] border-gold-500/30 mb-8">
                        <div className="flex items-start justify-between gap-4 mb-5">
                          <div>
                            <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-1">{resultTipMatch.date} · {resultTipMatch.league}</div>
                            <h3 className="text-xl font-bold">{resultTipMatch.homeTeam} - {resultTipMatch.awayTeam}</h3>
                            <p className="text-gold-500 font-display font-black mt-1">
                              {resultTipMatch.homeScore} - {resultTipMatch.awayScore}
                            </p>
                          </div>
                          <button onClick={() => setResultTipMatch(null)} className="p-2 bg-white/5 rounded-xl hover:text-red-500 transition-colors">
                            <X size={18} />
                          </button>
                        </div>

                        <div className="grid md:grid-cols-5 gap-3 mb-4">
                          <select
                            value={resultTipForm.prediction}
                            onChange={(e) => setResultTipForm({ ...resultTipForm, prediction: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                          >
                            {tipOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            step="0.01"
                            value={resultTipForm.odds}
                            onChange={(e) => setResultTipForm({ ...resultTipForm, odds: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                            placeholder="Kvota"
                          />
                          <input
                            type="number"
                            min="1"
                            max="10"
                            step="0.5"
                            value={resultTipForm.unitsStake}
                            onChange={(e) => setResultTipForm({ ...resultTipForm, unitsStake: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                            placeholder="Units"
                          />
                          <div className="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-[10px] text-neutral-500 font-black uppercase tracking-widest">
                            {Number(resultTipForm.unitsStake) || 0}u = {unitsToRsd(Number(resultTipForm.unitsStake) || 0).toLocaleString('sr-RS')} RSD
                          </div>
                          <button
                            onClick={() => setResultTipForm({ ...resultTipForm, isVip: false, unitsStake: String(getDefaultUnitsStake(false, 1)) })}
                            className={`rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest border ${!resultTipForm.isVip ? 'bg-white text-black border-white' : 'bg-black/40 border-white/10 text-neutral-500'}`}
                          >
                            FREE
                          </button>
                          <button
                            onClick={() => setResultTipForm({ ...resultTipForm, isVip: true, unitsStake: String(getDefaultUnitsStake(true, 1)) })}
                            className={`rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest border ${resultTipForm.isVip ? 'bg-gold-500 text-black border-gold-500' : 'bg-black/40 border-white/10 text-neutral-500'}`}
                          >
                            VIP
                          </button>
                        </div>
                        <textarea
                          value={resultTipForm.analysis}
                          onChange={(e) => setResultTipForm({ ...resultTipForm, analysis: e.target.value })}
                          rows={3}
                          className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-gold-500/50 mb-4"
                          placeholder="Komentar / analiza"
                        />
                        <button
                          onClick={() => handleCreateTipFromResult(false)}
                          className="w-full py-4 bg-gold-500 text-black font-black uppercase tracking-widest rounded-2xl hover:bg-gold-600 transition-all"
                        >
                          Sačuvaj kao DRAFT
                        </button>
                      </div>
                    )}

                    <div className="grid gap-6">
                       {visibleTips.map(tip => (
                         <div
                           key={tip.id}
                           onClick={() => handleOpenEditModal(tip)}
                           role="button"
                           tabIndex={0}
                           onKeyDown={(event) => {
                             if (event.key === 'Enter' || event.key === ' ') handleOpenEditModal(tip);
                           }}
                           className="glass p-8 rounded-[2rem] border-white/5 cursor-pointer transition-all hover:border-gold-500/30 hover:shadow-[0_0_28px_rgba(245,124,0,0.10)]"
                         >
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                               <div>
                                  <div className="flex items-center gap-2 mb-2">
                                     <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${tip.isVip ? 'bg-gold-500 text-black' : 'bg-neutral-800'}`}>
                                       {tip.isVip ? 'VIP' : 'FREE'}
                                     </span>
                                     <span className="text-xs text-neutral-500 font-bold uppercase tracking-widest">{tip.date}</span>
                                     <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase flex items-center gap-1 ${
                                       tip.status === TicketStatus.WON ? 'bg-green-500/10 text-green-500' : 
                                       tip.status === TicketStatus.LOST ? 'bg-red-500/10 text-red-500' :
                                       tip.status === TicketStatus.POSTPONED ? 'bg-blue-500/10 text-blue-300' :
                                       tip.status === TicketStatus.REFUND ? 'bg-cyan-500/10 text-cyan-300' : 'bg-white/5 text-neutral-400'
                                     }`}>
                                       {tip.status === TicketStatus.WON && <CheckCircle2 size={10} />}
                                       {tip.status === TicketStatus.LOST && <XCircle size={10} />}
                                       {tip.status === TicketStatus.PENDING && <Clock size={10} />}
                                       {getStatusLabel(tip.status)}
                                     </span>
                                     <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                                       tip.publicationStatus === TipPublicationStatus.PUBLISHED
                                         ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                         : 'bg-white/5 text-neutral-500 border border-white/10'
                                     }`}>
                                       {tip.publicationStatus === TipPublicationStatus.PUBLISHED ? 'PUBLISHED' : 'DRAFT'}
                                     </span>
                                  </div>
                                  <h3 className="text-xl font-bold">{tip.matches?.[0]?.teams} {tip.matches.length > 1 && `+${tip.matches.length - 1}`}</h3>
                                  <div className="flex flex-wrap items-center gap-2 mt-3">
                                    <span className="px-3 py-1 rounded-full bg-black/30 border border-gold-500/20 text-gold-500 text-[9px] font-black uppercase tracking-widest">
                                      {getTicketKind(tip.matches.length)}
                                    </span>
                                    <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-neutral-300 text-[9px] font-black uppercase tracking-widest">
                                      {tip.matches.length} {tip.matches.length === 1 ? 'par' : 'parova'}
                                    </span>
                                    <span className="px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-500 text-[9px] font-black uppercase tracking-widest">
                                      Ukupna kvota {tip.totalOdds.toFixed(2)}
                                    </span>
                                  </div>
                               </div>
                               
                               <div className="flex flex-wrap items-center gap-3">
                                  <select
                                    value={tip.status}
                                    onChange={(e) => handleUpdateTipStatus(tip, e.target.value as TicketStatus)}
                                    onClick={(event) => event.stopPropagation()}
                                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-300 outline-none focus:border-gold-500/50 transition-all"
                                  >
                                    <option value={TicketStatus.PENDING}>Aktivan</option>
                            <option value={TicketStatus.WON}>PROŠLO</option>
                            <option value={TicketStatus.LOST}>PALO</option>
                            <option value={TicketStatus.POSTPONED}>ODLOŽENO</option>
                            <option value={TicketStatus.REFUND}>KVOTA 1 / POVRAT</option>
                          </select>
                                  {tip.publicationStatus === TipPublicationStatus.PUBLISHED ? (
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleUnpublishTip(tip.id);
                                      }}
                                      className="px-4 py-2 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
                                    >
                                      Vrati u draft
                                    </button>
                                  ) : (
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handlePublishTip(tip.id);
                                      }}
                                      className="px-4 py-2 bg-gold-500 text-black hover:bg-gold-600 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
                                    >
                                      Objavi
                                    </button>
                                  )}
                                  <button 
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      autoGradeTip(tip.id);
                                    }}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-gold-500/10 hover:text-gold-500 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50"
                                  >
                                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                                    Auto Grade
                                  </button>
                                  <button 
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleOpenEditModal(tip);
                                    }}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl hover:text-gold-500 transition-colors text-[10px] font-black uppercase tracking-widest"
                                  >
                                     <Settings size={14} /> Izmeni
                                  </button>
                                  <button 
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleDeleteTip(tip.id);
                                    }}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl hover:text-red-500 transition-colors text-[10px] font-black uppercase tracking-widest"
                                  >
                                     <X size={14} /> Obriši
                                  </button>
                               </div>
                            </div>

                            <div className="space-y-4">
                               {tip.matches.map((m, idx) => (
                                 <div key={idx} className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                       <div>
                                          <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-1">{m.league}</div>
                                          <div className="font-bold text-neutral-200">{m.homeTeam} - {m.awayTeam}</div>
                                          <div className="mt-2 flex items-center gap-4">
                                             <div className="text-xs"><span className="text-neutral-500 uppercase tracking-tighter">Tip:</span> <span className="text-gold-500 font-black">{m.prediction}</span></div>
                                             <div className="text-xs"><span className="text-neutral-500 uppercase tracking-tighter">Kvota:</span> <span className="text-neutral-200 font-black">{m.odds.toFixed(2)}</span></div>
                                             {m.result && <div className="text-xs"><span className="text-neutral-500 uppercase tracking-tighter">Rezultat:</span> <span className="text-neutral-200 font-black">{m.result}</span></div>}
                                          </div>
                                       </div>

                                       <div className="flex items-center gap-2">
                                          <LinkIcon size={14} className="text-neutral-500" />
                                          <select 
                                            value={m.externalMatchId || ''}
                                            onChange={(e) => linkMatch(tip.id, idx, e.target.value)}
                                            onClick={(event) => event.stopPropagation()}
                                            className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] font-bold text-neutral-400 outline-none focus:border-gold-500/50 transition-all max-w-[150px]"
                                          >
                                            <option value="">Poveži meč...</option>
                                            {availableMatches.filter(am => am.date === tip.date).map(am => (
                                              <option key={am.id} value={am.id}>{am.homeTeam} - {am.awayTeam}</option>
                                            ))}
                                          </select>
                                       </div>
                                    </div>
                         </div>
                        ))}
                       {visibleTips.length === 0 && (
                         <div className="glass p-8 rounded-[2rem] border-white/5 text-center">
                           <p className="text-neutral-500 font-bold">Nema tiketa za izabrani filter.</p>
                         </div>
                       )}
                     </div>
                         </div>
                       ))}
                       {hasMoreTips && (
                         <button
                           type="button"
                           onClick={() => setTipPageSize((prev) => prev + 8)}
                           className="mt-4 inline-flex items-center justify-center rounded-2xl border border-gold-500/25 bg-gold-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gold-300 transition hover:bg-gold-500/20"
                         >
                           Prikaži još tiketa
                         </button>
                       )}
                    </div>
                 </motion.div>
              )}
              {activeTab === 'analyses' && (
                <motion.div key="analyses" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                  <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <h2 className="text-3xl font-display font-bold">Dnevni Tipovi</h2>
                      <p className="mt-2 text-sm text-neutral-500">Poluautomatski sistem: API puni Firestore bazu, admin potvrđuje, menja i objavljuje finalnu verziju.</p>
                      {dailyPullMessage && <p className="mt-3 rounded-xl border border-gold-500/20 bg-gold-500/10 px-4 py-3 text-xs font-bold text-gold-300">{dailyPullMessage}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {dailyPullDates.map((tab) => (
                        <button
                          key={tab.key}
                          disabled={dailyPullLoadingDate === tab.date}
                          onClick={() => handlePullDailyAnalyses(tab.date, tab.label)}
                          className="rounded-2xl border border-gold-500/30 bg-gold-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gold-300 hover:bg-gold-500 hover:text-black disabled:opacity-50"
                        >
                          {dailyPullLoadingDate === tab.date ? 'Povlačim...' : tab.key === 'today' ? 'Povuci današnje tipove' : tab.key === 'tomorrow' ? 'Povuci sutrašnje tipove' : 'Povuci prekosutra'}
                        </button>
                      ))}
                      <Link to="/daily-tips" className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-300 hover:text-gold-400">
                        Public strana
                      </Link>
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
                    <div className="glass rounded-[2rem] border-white/5 p-6">
                      <h3 className="mb-5 text-xl font-bold">{dailyAnalysisForm.id ? 'Izmeni analizu' : 'Dodaj ručnu analizu'}</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Datum utakmice</span>
                          <input type="date" value={dailyAnalysisForm.date} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, date: event.target.value })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50" />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Vreme početka utakmice</span>
                          <input type="time" value={getKickoffTime(dailyAnalysisForm)} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, time: event.target.value, matchTime: event.target.value, kickoffTime: event.target.value })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50" />
                        </label>
                        <label className="col-span-2 block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Vreme objave tiketa</span>
                          <input type="datetime-local" value={getDailyPublicationInputValue(dailyAnalysisForm)} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, ...dailyPublicationMetaFromInput(event.target.value) })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50" />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Sport</span>
                          <select value={dailyAnalysisForm.sport || 'football'} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, sport: event.target.value as 'football' | 'basketball' })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50">
                            <option value="football">Fudbal</option>
                            <option value="basketball">Košarka</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Status</span>
                          <select value={dailyAnalysisForm.status || 'ACTIVE'} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, status: event.target.value as DailyAnalysisStatus })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50">
                            <option value="ACTIVE">Aktivan</option>
                            <option value="WON">Prošao</option>
                            <option value="LOST">Pao</option>
                            <option value="REFUND">VOID / PUSH</option>
                            <option value="POSTPONED">Odloženo</option>
                            <option value="HIDDEN">Sakriven</option>
                          </select>
                        </label>
                        <label className="col-span-2 block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Liga</span>
                          <input value={dailyAnalysisForm.league} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, league: event.target.value })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50" placeholder="Premier League" />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Domaćin</span>
                          <input value={dailyAnalysisForm.homeTeam} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, homeTeam: event.target.value })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50" />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Gost</span>
                          <input value={dailyAnalysisForm.awayTeam} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, awayTeam: event.target.value })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50" />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Logo domaćina</span>
                          <input value={dailyAnalysisForm.homeLogo || ''} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, homeLogo: event.target.value })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50" />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Logo gosta</span>
                          <input value={dailyAnalysisForm.awayLogo || ''} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, awayLogo: event.target.value })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50" />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Forma domaćin %</span>
                          <input type="number" min="0" max="100" value={dailyAnalysisForm.homeFormPercent ?? ''} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, homeFormPercent: event.target.value === '' ? null : Number(event.target.value) })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50" placeholder="Nedovoljno" />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Forma gost %</span>
                          <input type="number" min="0" max="100" value={dailyAnalysisForm.awayFormPercent ?? ''} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, awayFormPercent: event.target.value === '' ? null : Number(event.target.value) })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50" placeholder="Nedovoljno" />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Tip</span>
                          <input
                            list="daily-prediction-options"
                            value={dailyAnalysisForm.prediction}
                            onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, prediction: event.target.value })}
                            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                            placeholder="Izaberi ili upiši tip, npr. DNB, 1&GG..."
                          />
                          <datalist id="daily-prediction-options">
                            {dailyPredictionOptions.map((option) => <option key={option} value={option} />)}
                          </datalist>
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Kvota</span>
                          <input type="number" min="1" step="0.01" value={dailyAnalysisForm.odds} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, odds: Number(event.target.value) })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50" />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">FREE / VIP</span>
                          <select value={dailyAnalysisForm.access} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, access: event.target.value as 'FREE' | 'VIP' })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50">
                            <option value="FREE">FREE</option>
                            <option value="VIP">VIP</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Redosled</span>
                          <input type="number" value={dailyAnalysisForm.sortOrder} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, sortOrder: Number(event.target.value) })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50" />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Units</span>
                          <input type="number" min="1" max="10" value={dailyAnalysisForm.units || 3} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, units: Number(event.target.value) })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50" />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Confidence %</span>
                          <input type="number" min="0" max="100" value={dailyAnalysisForm.confidence || ''} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, confidence: event.target.value === '' ? undefined : Number(event.target.value) })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50" />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Rizik</span>
                          <select value={dailyAnalysisForm.riskLevel || 'MEDIUM'} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, riskLevel: event.target.value as DailyAnalysisRiskLevel })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50">
                            <option value="LOW">Nizak</option>
                            <option value="MEDIUM">Srednji</option>
                            <option value="HIGH">Visok</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Badge</span>
                          <input value={(dailyAnalysisForm.badges || []).join(', ')} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, badges: event.target.value.split(',').map((badge) => badge.trim()).filter(Boolean) })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50" placeholder="HIGH VALUE, VIP PICK" />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Prosek golova/poena</span>
                          <input value={dailyAnalysisForm.averageTotal || ''} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, averageTotal: event.target.value })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50" />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">H2H</span>
                          <input value={dailyAnalysisForm.h2hNote || ''} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, h2hNote: event.target.value })} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50" />
                        </label>
                        <label className="col-span-2 block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">FREE analiza</span>
                          <textarea value={dailyAnalysisForm.freeAnalysis || ''} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, freeAnalysis: event.target.value })} rows={7} className="min-h-40 w-full resize-y rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 outline-none focus:border-gold-500/50" />
                        </label>
                        <label className="col-span-2 block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">VIP analiza</span>
                          <textarea value={dailyAnalysisForm.vipAnalysis || ''} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, vipAnalysis: event.target.value })} rows={12} className="min-h-64 w-full resize-y rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 outline-none focus:border-gold-500/50" />
                        </label>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-neutral-300">
                          <input type="checkbox" checked={dailyAnalysisForm.enabled} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, enabled: event.target.checked })} />
                          Uključeno
                        </label>
                        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-neutral-300">
                          <input type="checkbox" checked={dailyAnalysisForm.hidden === true} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, hidden: event.target.checked })} />
                          Sakriveno
                        </label>
                        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-neutral-300">
                          <input type="checkbox" checked={dailyAnalysisForm.topPick === true} onChange={(event) => setDailyAnalysisForm({ ...dailyAnalysisForm, topPick: event.target.checked })} />
                          Top tip
                        </label>
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <button onClick={handleSaveDailyAnalysis} className="rounded-2xl bg-gold-500 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-black hover:bg-gold-600">Sačuvaj</button>
                        <button onClick={resetDailyAnalysisForm} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-300 hover:bg-white/10">Novo</button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setDailyLifecycleFilter('active')}
                          className={`rounded-xl border px-4 py-2 text-[10px] font-black uppercase tracking-widest transition ${
                            dailyLifecycleFilter === 'active'
                              ? 'border-gold-500 bg-gold-500 text-black'
                              : 'border-white/10 bg-white/5 text-neutral-400 hover:border-gold-500/30'
                          }`}
                        >
                          Aktivni
                        </button>
                        <button
                          type="button"
                          onClick={() => setDailyLifecycleFilter('finished')}
                          className={`rounded-xl border px-4 py-2 text-[10px] font-black uppercase tracking-widest transition ${
                            dailyLifecycleFilter === 'finished'
                              ? 'border-gold-500 bg-gold-500 text-black'
                              : 'border-white/10 bg-white/5 text-neutral-400 hover:border-gold-500/30'
                          }`}
                        >
                          Završeni
                        </button>
                      </div>
                      {filteredDailyAnalyses.map((analysis) => (
                        <div key={analysis.id} className="glass rounded-[2rem] border-white/5 p-5">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="mb-2 flex flex-wrap gap-2">
                                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-neutral-300">{analysis.sport === 'basketball' ? 'Košarka' : 'Fudbal'}</span>
                                <span className="rounded-full border border-gold-500/25 bg-gold-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-gold-300">{analysis.access}</span>
                                <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-blue-300">{analysis.status || 'ACTIVE'}</span>
                                <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest ${analysis.enabled && !analysis.hidden ? 'border-green-500/25 bg-green-500/10 text-green-300' : 'border-red-500/25 bg-red-500/10 text-red-300'}`}>
                                  {analysis.enabled && !analysis.hidden ? 'Aktivno' : 'Sakriveno'}
                                </span>
                                {analysis.manualOverride && <span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-orange-300">Manual override</span>}
                              </div>
                              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                                Meč: {analysis.date} · {getKickoffTime(analysis)} · {analysis.league}
                              </div>
                              <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-gold-400">
                                Objavljeno: {formatDailyPublishedAt(analysis)}
                              </div>
                              <div className="mt-2 font-display text-xl font-black text-white">{analysis.homeTeam} - {analysis.awayTeam}</div>
                              <div className="mt-2 text-sm text-neutral-400">Tip: <span className="font-black text-gold-400">{analysis.prediction}</span> · Kvota {Number(analysis.odds) > 1 ? analysis.odds.toFixed(2) : 'uskoro'} · Confidence {analysis.confidence || '-'}%</div>
                              {analysis.freeAnalysis && <p className="mt-3 max-w-3xl whitespace-pre-wrap break-words text-xs leading-6 text-neutral-400"><span className="font-black text-green-300">FREE:</span> {analysis.freeAnalysis}</p>}
                              {analysis.vipAnalysis && <p className="mt-3 max-w-3xl whitespace-pre-wrap break-words text-xs leading-6 text-neutral-400"><span className="font-black text-gold-300">VIP:</span> {analysis.vipAnalysis}</p>}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                disabled={dailyAiLoadingId === `${analysis.id}:FREE`}
                                onClick={() => handleGenerateDailyAiAnalysis(analysis, 'FREE')}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-green-500/25 bg-green-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-green-300 hover:bg-green-500/20 disabled:opacity-50"
                              >
                                <Sparkles size={13} />
                                {dailyAiLoadingId === `${analysis.id}:FREE` ? 'Generišem...' : analysis.freeAnalysis ? 'Regeneriši FREE analizu' : 'Generiši FREE analizu'}
                              </button>
                              <button
                                disabled={dailyAiLoadingId === `${analysis.id}:VIP`}
                                onClick={() => handleGenerateDailyAiAnalysis(analysis, 'VIP')}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-gold-500/25 bg-gold-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gold-300 hover:bg-gold-500/20 disabled:opacity-50"
                              >
                                <Sparkles size={13} />
                                {dailyAiLoadingId === `${analysis.id}:VIP` ? 'Generišem...' : analysis.vipAnalysis ? 'Regeneriši VIP analizu' : 'Generiši VIP analizu'}
                              </button>
                              <button onClick={() => handleEditDailyAnalysis(analysis)} className="rounded-xl bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-300 hover:text-gold-400">Izmeni</button>
                              <button onClick={() => handleDailyQuickPatch(analysis, { hidden: !analysis.hidden, status: !analysis.hidden ? 'HIDDEN' : 'ACTIVE' })} className="rounded-xl bg-orange-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-orange-300 hover:bg-orange-500/20">
                                {analysis.hidden ? 'Prikaži' : 'Sakrij'}
                              </button>
                              <button onClick={() => handleDailyQuickPatch(analysis, { access: 'FREE' })} className="rounded-xl bg-green-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-green-300 hover:bg-green-500/20">FREE</button>
                              <button onClick={() => handleDailyQuickPatch(analysis, { access: 'VIP' })} className="rounded-xl bg-gold-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gold-300 hover:bg-gold-500/20">VIP</button>
                              <button
                                disabled={dailyResultLoadingId === analysis.id || analysis.resultManualOverride}
                                onClick={() => handleRefreshDailyResult(analysis)}
                                className="rounded-xl bg-blue-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-blue-300 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                                title={analysis.resultManualOverride ? 'Ručno postavljen rezultat je zaštićen od API osvežavanja.' : undefined}
                              >
                                {dailyResultLoadingId === analysis.id ? 'Povlačim...' : analysis.resultManualOverride ? 'Ručni rezultat' : 'Povuci rezultat'}
                              </button>
                              <button onClick={() => handleDailyResult(analysis, 'WON')} className="rounded-xl bg-green-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-green-300 hover:bg-green-500/20">PROŠAO</button>
                              <button onClick={() => handleDailyResult(analysis, 'LOST')} className="rounded-xl bg-red-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-300 hover:bg-red-500/20">PAO</button>
                              <button onClick={() => handleDailyResult(analysis, 'REFUND')} className="rounded-xl bg-cyan-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-300 hover:bg-cyan-500/20">VOID / PUSH</button>
                              <button onClick={() => handleDeleteDailyAnalysis(analysis.id)} className="rounded-xl bg-red-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-300 hover:bg-red-500/20">Obriši</button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {filteredDailyAnalyses.length === 0 && (
                        <div className="glass rounded-[2rem] border-white/5 p-10 text-center text-neutral-500 font-bold">
                          {dailyLifecycleFilter === 'active' ? 'Nema aktivnih dnevnih tipova.' : 'Nema završenih dnevnih tipova.'}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
              {activeTab === 'settings' && (
                 <motion.div key="settings" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <h2 className="text-3xl font-display font-bold mb-8">Podešavanja sistema</h2>
                    
                     <div className="max-w-xl space-y-6">
                       <div className="glass p-8 rounded-[2rem] border-white/5">
                          <h3 className="text-xl font-bold mb-4">Kontakt linkovi</h3>
                          <div className="space-y-4">
                            {[
                              ['telegramLink', 'Telegram'],
                              ['whatsappLink', 'WhatsApp'],
                              ['instagramLink', 'Instagram'],
                              ['viberLink', 'Viber'],
                              ['contactEmail', 'Email'],
                            ].map(([key, label]) => (
                              <label key={key} className="block">
                                <span className="block text-[10px] font-black uppercase text-neutral-500 tracking-widest mb-2">{label}</span>
                                <input
                                  value={settings[key as keyof AppSettings]}
                                  onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50 transition-all"
                                />
                              </label>
                            ))}
                            <button
                              onClick={handleSaveSettings}
                              className="w-full py-3 bg-gold-500 text-black font-black uppercase tracking-widest rounded-2xl hover:bg-gold-600 transition-all"
                            >
                              {settingsSaved ? 'Sačuvano' : 'Sačuvaj podešavanja'}
                            </button>
                          </div>
                       </div>

                       <div className="glass p-8 rounded-[2rem] border-red-500/20">
                          <h3 className="text-xl font-bold mb-4 text-red-500">Opasna zona</h3>
                          <p className="text-neutral-400 text-sm mb-6">
                             Resetovanjem podataka ćete izgubiti sve nove korisnike i tipove koje ste dodali u lokalni storage.
                          </p>
                          <button 
                            onClick={handleResetData}
                            className="px-6 py-3 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 transition-colors"
                          >
                             Resetuj sve podatke
                          </button>
                       </div>

                       <div className="glass p-8 rounded-[2rem] border-white/5">
                          <h3 className="text-xl font-bold mb-4">Informacije o sistemu</h3>
                          <div className="space-y-4 text-sm">
                             <div className="flex justify-between py-2 border-b border-white/5">
                                <span className="text-neutral-500">Verzija</span>
                                <span className="font-bold">v2.5.0-manual-import</span>
                             </div>
                             <div className="flex justify-between py-2 border-b border-white/5">
                                <span className="text-neutral-500">Storage Režim</span>
                                <span className="font-bold text-gold-500">Local Browser</span>
                             </div>
                             <div className="flex justify-between py-2">
                                <span className="text-neutral-500">API Status</span>
                                <span className="font-bold text-green-500">CSV/Excel import</span>
                             </div>
                          </div>
                       </div>
                    </div>
                 </motion.div>
              )}
           </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {isTipModalOpen && (
          <TipModal 
            onClose={() => {
              setIsTipModalOpen(false);
              setEditingTip(undefined);
            }}
            onSave={handleCreateTip}
            initialData={editingTip}
          />
        )}
        {editingTicket && (
          <TicketEditModal
            tip={editingTicket}
            onClose={() => setEditingTicket(null)}
            onSave={handleSaveTicketEdit}
            onDelete={handleDeleteTicketEdit}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
