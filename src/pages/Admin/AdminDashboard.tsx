import React, { useMemo, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { 
  BarChart3, Users, FileText, Settings, LogOut, ChevronRight, 
  Menu, X, ShieldCheck, TrendingUp, AlertTriangle, Clock, Link as LinkIcon, RefreshCw, CheckCircle2, XCircle, Upload, Database, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { mockAuthService } from '../../services/mockAuth';
import { mockTipsService } from '../../services/mockTips';
import { mockSettingsService } from '../../services/mockSettings';
import { importedMatchesService } from '../../services/importedMatchesService';
import { DEMO_USERS } from '../../lib/demoData';
import { Tip, TicketStatus, ImportedMatch, MembershipStatus, GlobalStats, AppSettings, TipPublicationStatus } from '../../types';
import TipModal from '../../components/TipModal';

const tipOptions = ['GG', '3+', '1', 'X', '2', '1X', 'X2'];

const evaluatePrediction = (prediction: string, match: ImportedMatch): TicketStatus => {
  const home = match.homeScore;
  const away = match.awayScore;
  const totalGoals = home + away;
  const normalized = prediction.toUpperCase();

  if (normalized === 'GG') return home > 0 && away > 0 ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '3+') return totalGoals >= 3 ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '1') return home > away ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === 'X') return home === away ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '2') return away > home ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === '1X') return home >= away ? TicketStatus.WON : TicketStatus.LOST;
  if (normalized === 'X2') return away >= home ? TicketStatus.WON : TicketStatus.LOST;

  return TicketStatus.PENDING;
};

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'matches' | 'tips' | 'settings'>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isTipModalOpen, setIsTipModalOpen] = useState(false);
  const [editingTip, setEditingTip] = useState<Tip | undefined>(undefined);
  
  // Fake state for lists
  const [userList, setUserList] = useState(DEMO_USERS);
  const [tips, setTips] = useState<Tip[]>([]);
  const [availableMatches, setAvailableMatches] = useState<ImportedMatch[]>([]);
  const [matchTeamFilter, setMatchTeamFilter] = useState('');
  const [matchLeagueFilter, setMatchLeagueFilter] = useState('all');
  const [matchDateFilter, setMatchDateFilter] = useState('');
  const apiIssues: Array<{ competitionCode: string; competitionName: string; message: string }> = [];
  const [resultTipMatch, setResultTipMatch] = useState<ImportedMatch | null>(null);
  const [importMessage, setImportMessage] = useState('');
  const [resultTipForm, setResultTipForm] = useState({
    prediction: 'GG',
    odds: '1.80',
    stake: '100',
    status: TicketStatus.WON,
    analysis: '',
    isVip: true,
  });
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => mockSettingsService.getSettings());
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    refreshData();
    const unsubscribeTips = mockTipsService.subscribe(refreshData);
    const unsubscribeMatches = importedMatchesService.subscribe(refreshData);
    return () => {
      unsubscribeTips();
      unsubscribeMatches();
    };
  }, []);

  const refreshData = async () => {
    const [fetchedTips, fetchedMatches, fetchedStats] = await Promise.all([
      mockTipsService.getAllTips(),
      importedMatchesService.getMatches(),
      mockTipsService.getStats()
    ]);
    const fetchedUsers = mockAuthService.getUsers();
    setTips(fetchedTips);
    setAvailableMatches(fetchedMatches);
    setStats(fetchedStats);
    setUserList(fetchedUsers);
  };

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

  const handleOpenResultTip = (match: ImportedMatch) => {
    const prediction = 'GG';
    setResultTipMatch(match);
    setResultTipForm({
      prediction,
      odds: getDefaultOddsForPrediction(prediction, match).toFixed(2),
      stake: '100',
      status: TicketStatus.WON,
      analysis: `${match.homeTeam} - ${match.awayTeam}`,
      isVip: true,
    });
  };

  const handleCreateTipFromResult = async (publishNow = false) => {
    if (!resultTipMatch) return;

    const odds = Number(resultTipForm.odds);
    const stake = Number(resultTipForm.stake);
    if (!Number.isFinite(odds) || odds <= 1 || !Number.isFinite(stake) || stake <= 0) {
      alert('Popunite tip igre, kvotu i ulog.');
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
      totalOdds: Number(odds.toFixed(2)),
      stake: Number(stake.toFixed(2)),
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
          odds,
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
    if (confirm('Da li zelite da obrisete ovu utakmicu iz admin baze?')) {
      await importedMatchesService.deleteMatch(matchId);
      await refreshData();
    }
  };

  const handleClearImportedMatches = async () => {
    if (confirm('Da li zelite da obrisete sve importovane utakmice?')) {
      await importedMatchesService.clearMatches();
      await refreshData();
    }
  };

  const handleOpenEditModal = (tip: Tip) => {
    setEditingTip(tip);
    setIsTipModalOpen(true);
  };

  const handleUpdateUserStatus = (userId: string, status: MembershipStatus) => {
    const userToUpdate = userList.find(u => u.id === userId);
    if (userToUpdate) {
      mockAuthService.updateUser({ ...userToUpdate, membershipStatus: status });
      refreshData();
    }
  };

  const handleDeleteUser = (userId: string) => {
    if (confirm('Da li ste sigurni da želite da obrišete korisnika?')) {
      mockAuthService.deleteUser(userId);
      refreshData();
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
      mockAuthService.resetUsers();
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
      
      let status = evaluatePrediction(prediction, matchResult);
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

  const menuItems = [
    { id: 'overview', label: 'Pregled', icon: <BarChart3 size={20} /> },
    { id: 'users', label: 'Korisnici', icon: <Users size={20} /> },
    { id: 'matches', label: 'Baza utakmica', icon: <Database size={20} /> },
    { id: 'tips', label: 'Tipovi', icon: <FileText size={20} /> },
    { id: 'settings', label: 'Podešavanja', icon: <Settings size={20} /> },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className={`
        fixed md:relative z-50 w-64 h-screen bg-black border-r border-white/5 transition-transform duration-300
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
                w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-bold transition-all
                ${activeTab === item.id 
                  ? 'bg-gold-500 text-black shadow-lg shadow-gold-500/20' 
                  : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-200'}
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
        <header className="sticky top-0 z-40 bg-neutral-950/80 backdrop-blur-md border-b border-white/5 px-8 py-4 flex items-center justify-between">
            <button 
              className="md:hidden p-2 text-neutral-400"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X /> : <Menu />}
            </button>
            <div className="flex items-center gap-4 ml-auto">
               <div className="text-right hidden sm:block">
                  <div className="text-sm font-bold">{user?.displayName}</div>
                  <div className="text-xs text-neutral-500">Glavni Adminov</div>
               </div>
               <div className="w-10 h-10 rounded-full bg-gold-500 flex items-center justify-center text-black font-black">
                  {user?.displayName?.[0] || 'A'}
               </div>
            </div>
        </header>

        <div className="p-8">
           <AnimatePresence mode="wait">
              {activeTab === 'overview' && (
                <motion.div key="overview" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                   <h2 className="text-3xl font-display font-bold mb-8">Pregled sistema</h2>
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                      {[
                        { label: 'Ukupno Korisnika', value: userList.length, icon: <Users className="text-gold-500" /> },
                        { label: 'Aktivni VIP', value: userList.filter(u => u.membershipStatus === 'approved').length, icon: <ShieldCheck className="text-gold-500" /> },
                        { label: 'Novi Zahtevi', value: userList.filter(u => u.membershipStatus === 'pending').length, icon: <Clock className="text-gold-500" />, highlight: true },
                        { label: 'Mesečni ROI', value: `${(stats?.roi ?? 0) >= 0 ? '+' : ''}${stats?.roi ?? 0}%`, icon: <TrendingUp className="text-gold-500" /> },
                      ].map((s, i) => (
                        <div key={i} className={`glass p-6 rounded-3xl ${s.highlight ? 'border-gold-500/50' : 'border-white/5'}`}>
                           <div className="flex items-center justify-between mb-4">
                              <div className="p-2 bg-white/5 rounded-xl">{s.icon}</div>
                           </div>
                           <div className="text-3xl font-display font-bold">{s.value}</div>
                           <div className="text-xs text-neutral-500 font-bold uppercase tracking-widest mt-1">{s.label}</div>
                        </div>
                        ))}
                     </div>
                   
                   <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                      <div className="glass p-5 rounded-2xl border-white/5">
                         <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-1">Admin baza</div>
                         <div className="text-2xl font-display font-bold">{tips.length}</div>
                      </div>
                      <div className="glass p-5 rounded-2xl border-white/5">
                         <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-1">DRAFT</div>
                         <div className="text-2xl font-display font-bold">{tips.filter(t => t.publicationStatus !== TipPublicationStatus.PUBLISHED).length}</div>
                      </div>
                      <div className="glass p-5 rounded-2xl border-white/5">
                         <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-1">PUBLISHED</div>
                         <div className="text-2xl font-display font-bold text-gold-500">{tips.filter(t => t.publicationStatus === TipPublicationStatus.PUBLISHED).length}</div>
                      </div>
                   </div>

                   {/* More details could go here */}
                   <div className="bg-green-500/10 border-green-500/20 border p-6 rounded-3xl flex items-center gap-4">
                      <AlertTriangle className="text-green-500 shrink-0" size={32} />
                      <div>
                         <h4 className="font-bold text-green-500">Rucni import rezim</h4>
                         <p className="text-sm text-neutral-400">
                           Utakmice se uvoze iz CSV/Excel fajla i ostaju vidljive samo adminu. Public deo vidi samo objavljene tipove.
                         </p>
                      </div>
                   </div>
                </motion.div>
              )}

              {activeTab === 'users' && (
                 <motion.div key="users" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <div className="flex items-center justify-between mb-8">
                       <h2 className="text-3xl font-display font-bold">Upravljanje korisnicima</h2>
                    </div>

                    <div className="glass rounded-[2rem] overflow-hidden">
                       <table className="w-full text-left border-collapse">
                          <thead>
                             <tr className="bg-white/5 text-[10px] text-neutral-500 uppercase font-black tracking-widest">
                                <th className="px-6 py-4">Korisnik</th>
                                <th className="px-6 py-4">Status Emaila</th>
                                <th className="px-6 py-4">Članstvo</th>
                                <th className="px-6 py-4">Akcije</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                             {userList.map(u => (
                               <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                                  <td className="px-6 py-4">
                                     <div className="font-bold">{u.displayName || 'N/A'}</div>
                                     <div className="text-xs text-neutral-500">{u.email}</div>
                                  </td>
                                  <td className="px-6 py-4">
                                     <span className={`px-2 py-1 rounded text-[10px] font-bold ${u.emailVerified ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                        {u.emailVerified ? 'VERIFIKOVAN' : 'NEPOTVRĐEN'}
                                     </span>
                                  </td>
                                  <td className="px-6 py-4 uppercase text-xs font-black">
                                     <span className={
                                        u.membershipStatus === 'approved' ? 'text-gold-500' : 
                                        u.membershipStatus === 'pending' ? 'text-blue-500' : 'text-neutral-500'
                                     }>{u.membershipStatus}</span>
                                  </td>
                                  <td className="px-6 py-4">
                                     <div className="flex items-center gap-2">
                                        {u.membershipStatus !== MembershipStatus.APPROVED && (
                                          <button 
                                            onClick={() => handleUpdateUserStatus(u.id, MembershipStatus.APPROVED)}
                                            className="text-green-500 text-xs font-bold hover:underline"
                                          >
                                            Odobri
                                          </button>
                                        )}
                                        {u.membershipStatus !== MembershipStatus.BLOCKED && (
                                          <button 
                                            onClick={() => handleUpdateUserStatus(u.id, MembershipStatus.BLOCKED)}
                                            className="text-red-500 text-xs font-bold hover:underline"
                                          >
                                            Blokiraj
                                          </button>
                                        )}
                                        <button 
                                          onClick={() => handleDeleteUser(u.id)}
                                          className="text-neutral-500 text-xs font-bold hover:underline ml-2"
                                        >
                                          Obriši
                                        </button>
                                     </div>
                                  </td>
                               </tr>
                             ))}
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
                       <button
                         onClick={handleClearImportedMatches}
                         disabled={availableMatches.length === 0}
                         className="flex items-center gap-2 px-5 py-3 bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-red-500/20 transition-all disabled:opacity-40"
                       >
                         <Trash2 size={14} /> Obrisi bazu
                       </button>
                    </div>

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
                            step="1"
                            value={resultTipForm.stake}
                            onChange={(e) => setResultTipForm({ ...resultTipForm, stake: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                            placeholder="Ulog"
                          />
                          <select
                            value={resultTipForm.status}
                            onChange={(e) => setResultTipForm({ ...resultTipForm, status: e.target.value as TicketStatus })}
                            className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                          >
                            <option value={TicketStatus.WON}>PROSLO</option>
                            <option value={TicketStatus.LOST}>PALO</option>
                          </select>
                          <button
                            onClick={() => setResultTipForm({ ...resultTipForm, isVip: false })}
                            className={`rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest border ${!resultTipForm.isVip ? 'bg-white text-black border-white' : 'bg-black/40 border-white/10 text-neutral-500'}`}
                          >
                            FREE
                          </button>
                          <button
                            onClick={() => setResultTipForm({ ...resultTipForm, isVip: true })}
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
                            Sacuvaj kao DRAFT
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
                    <div className="flex items-center justify-between mb-8">
                       <h2 className="text-3xl font-display font-bold">Upravljanje tipovima</h2>
                       <button 
                        onClick={() => setIsTipModalOpen(true)}
                        className="px-6 py-3 bg-gold-500 text-black font-bold rounded-2xl hover:bg-gold-600 transition-all shadow-lg shadow-gold-500/20"
                       >
                         Novi Tip
                       </button>
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
                            step="1"
                            value={resultTipForm.stake}
                            onChange={(e) => setResultTipForm({ ...resultTipForm, stake: e.target.value })}
                            className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                            placeholder="Ulog"
                          />
                          <button
                            onClick={() => setResultTipForm({ ...resultTipForm, isVip: false })}
                            className={`rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest border ${!resultTipForm.isVip ? 'bg-white text-black border-white' : 'bg-black/40 border-white/10 text-neutral-500'}`}
                          >
                            FREE
                          </button>
                          <button
                            onClick={() => setResultTipForm({ ...resultTipForm, isVip: true })}
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
                          Sacuvaj kao DRAFT
                        </button>
                      </div>
                    )}

                    <div className="grid gap-6">
                       {tips.map(tip => (
                         <div key={tip.id} className="glass p-8 rounded-[2rem] border-white/5">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                               <div>
                                  <div className="flex items-center gap-2 mb-2">
                                     <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${tip.isVip ? 'bg-gold-500 text-black' : 'bg-neutral-800'}`}>
                                       {tip.isVip ? 'VIP' : 'FREE'}
                                     </span>
                                     <span className="text-xs text-neutral-500 font-bold uppercase tracking-widest">{tip.date}</span>
                                     <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase flex items-center gap-1 ${
                                       tip.status === TicketStatus.WON ? 'bg-green-500/10 text-green-500' : 
                                       tip.status === TicketStatus.LOST ? 'bg-red-500/10 text-red-500' : 'bg-white/5 text-neutral-400'
                                     }`}>
                                       {tip.status === TicketStatus.WON && <CheckCircle2 size={10} />}
                                       {tip.status === TicketStatus.LOST && <XCircle size={10} />}
                                       {tip.status === TicketStatus.WON ? 'PROSLO' : tip.status === TicketStatus.LOST ? 'PALO' : 'AKTIVAN'}
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
                               </div>
                               
                               <div className="flex items-center gap-3">
                                  <select
                                    value={tip.status}
                                    onChange={(e) => handleUpdateTipStatus(tip, e.target.value as TicketStatus)}
                                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-300 outline-none focus:border-gold-500/50 transition-all"
                                  >
                                    <option value={TicketStatus.PENDING}>Aktivan</option>
                                    <option value={TicketStatus.WON}>PROSLO</option>
                                    <option value={TicketStatus.LOST}>PALO</option>
                                  </select>
                                  {tip.publicationStatus === TipPublicationStatus.PUBLISHED ? (
                                    <button
                                      onClick={() => handleUnpublishTip(tip.id)}
                                      className="px-4 py-2 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
                                    >
                                      Vrati u draft
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handlePublishTip(tip.id)}
                                      className="px-4 py-2 bg-gold-500 text-black hover:bg-gold-600 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
                                    >
                                      Objavi
                                    </button>
                                  )}
                                  <button 
                                    onClick={() => autoGradeTip(tip.id)}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-gold-500/10 hover:text-gold-500 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50"
                                  >
                                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                                    Auto Grade
                                  </button>
                                  <button 
                                    onClick={() => handleOpenEditModal(tip)}
                                    className="p-2 bg-white/5 rounded-xl hover:text-gold-500 transition-colors"
                                  >
                                     <Settings size={18} />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteTip(tip.id)}
                                    className="p-2 bg-white/5 rounded-xl hover:text-red-500 transition-colors"
                                  >
                                     <X size={18} />
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
                                             {m.result && <div className="text-xs"><span className="text-neutral-500 uppercase tracking-tighter">Rezultat:</span> <span className="text-neutral-200 font-black">{m.result}</span></div>}
                                          </div>
                                       </div>

                                       <div className="flex items-center gap-2">
                                          <LinkIcon size={14} className="text-neutral-500" />
                                          <select 
                                            value={m.externalMatchId || ''}
                                            onChange={(e) => linkMatch(tip.id, idx, e.target.value)}
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
                       {tips.length === 0 && (
                         <div className="glass p-8 rounded-[2rem] border-white/5 text-center">
                           <p className="text-neutral-500 font-bold">Nema dostupnih realnih podataka.</p>
                         </div>
                       )}
                     </div>
                         </div>
                       ))}
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
                              {settingsSaved ? 'Sacuvano' : 'Sacuvaj podesavanja'}
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
      </AnimatePresence>
    </div>
  );
}
