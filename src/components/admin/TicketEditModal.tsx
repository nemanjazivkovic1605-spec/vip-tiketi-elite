import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, X } from 'lucide-react';
import { Match, TicketStatus, Tip, TipPublicationStatus, type TicketProductType } from '../../types';
import {
  buildPublishedAt,
  calculateTotalOdds,
  generateTicketCode,
  getDefaultUnitsStake,
  getMatchEventDate,
  getMatchEventTime,
  getTicketKind,
  getTicketPublicationMeta,
  getTicketUnitsStake,
  isPublishedBeforeFirstMatch,
  normalizeOdds,
  normalizePublishedDate,
  normalizePublishedTime,
  unitsToRsd,
} from '../../utils/tickets';
import { formatLeagueName } from '../../utils/leagueMapper';
import { getTicketProductType } from '../../utils/ticketProduct';

type TicketKind = 'SINGL' | 'DUBL' | 'COMBO';

type TicketEditModalProps = {
  tip: Tip;
  onClose: () => void;
  onSave: (tip: Tip) => Promise<void>;
  onDelete: (tipId: string) => Promise<void>;
};

const emptyMatch = (): Match => ({
  id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  teams: '',
  homeTeam: '',
  awayTeam: '',
  league: '',
  prediction: '1',
  odds: 1,
  time: '20:00',
  eventDate: new Date().toISOString().slice(0, 10),
  eventTime: '20:00',
  result: '',
  analysis: '',
});

const kindFromCount = (count: number): TicketKind => {
  if (count === 1) return 'SINGL';
  if (count === 2) return 'DUBL';
  return 'COMBO';
};

const ensureKindMatchCount = (matches: Match[], kind: TicketKind) => {
  if (kind === 'SINGL') return matches.slice(0, 1);
  if (kind === 'DUBL') {
    const next = matches.slice(0, 2);
    while (next.length < 2) next.push(emptyMatch());
    return next;
  }

  const next = [...matches];
  while (next.length < 3) next.push(emptyMatch());
  return next;
};

export default function TicketEditModal({ tip, onClose, onSave, onDelete }: TicketEditModalProps) {
  const [draft, setDraft] = useState<Tip>(() => {
    const meta = getTicketPublicationMeta(tip);
    return {
      ...tip,
      type: getTicketProductType(tip),
      ...meta,
      ticketCode: tip.ticketCode || meta.ticketCode,
      unitsStake: getTicketUnitsStake(tip),
      stake: unitsToRsd(getTicketUnitsStake(tip)),
      matches: tip.matches.length > 0
        ? tip.matches.map((match) => ({
          ...match,
          eventDate: getMatchEventDate(match, tip.date),
          eventTime: getMatchEventTime(match),
          time: getMatchEventTime(match),
        }))
        : [emptyMatch()],
    };
  });
  const [selectedKind, setSelectedKind] = useState<TicketKind>(() => kindFromCount(tip.matches.length));
  const [totalOddsInput, setTotalOddsInput] = useState(String(tip.totalOdds || '1.00'));
  const [saving, setSaving] = useState(false);

  const autoTotalOdds = useMemo(() => calculateTotalOdds(draft.matches), [draft.matches]);
  const displayedTotalOdds = draft.totalOddsOverride ? Number(totalOddsInput) || 1 : autoTotalOdds;

  const updateDraft = (patch: Partial<Tip>, regenerateCode = false) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      if (!regenerateCode) return next;

      const publishedDate = normalizePublishedDate(next.publishedDate || next.date);
      const publishedTime = normalizePublishedTime(next.publishedTime);
      return {
        ...next,
        publishedTime,
        publishedAt: buildPublishedAt(publishedDate, publishedTime),
        ticketCode: generateTicketCode(Boolean(next.isVip), publishedDate, publishedTime),
      };
    });
  };

  const updateMatch = (index: number, patch: Partial<Match>) => {
    setDraft((current) => {
      const matches = current.matches.map((match, matchIndex) => {
        if (matchIndex !== index) return match;
        const updated = { ...match, ...patch };
        if (patch.homeTeam !== undefined || patch.awayTeam !== undefined) {
          updated.teams = `${updated.homeTeam} - ${updated.awayTeam}`.trim();
        }
        return updated;
      });

      return { ...current, matches };
    });
  };

  const addMatch = () => {
    setDraft((current) => ({ ...current, matches: [...current.matches, emptyMatch()] }));
    setSelectedKind('COMBO');
  };

  const removeMatch = (index: number) => {
    setDraft((current) => {
      const matches = current.matches.filter((_, matchIndex) => matchIndex !== index);
      return { ...current, matches: matches.length > 0 ? matches : [emptyMatch()] };
    });
  };

  const changeKind = (kind: TicketKind) => {
    setSelectedKind(kind);
    setDraft((current) => {
      const matches = ensureKindMatchCount(current.matches, kind);
      const currentDefaultUnits = getDefaultUnitsStake(current.isVip, current.matches.length);
      const nextUnits = Number(current.unitsStake) === currentDefaultUnits
        ? getDefaultUnitsStake(current.isVip, matches.length)
        : current.unitsStake;

      return { ...current, matches, unitsStake: nextUnits, stake: unitsToRsd(Number(nextUnits) || 0) };
    });
  };

  const changeVisibility = (isVip: boolean) => {
    setDraft((current) => {
      const currentDefaultUnits = getDefaultUnitsStake(current.isVip, current.matches.length);
      const nextUnits = Number(current.unitsStake) === currentDefaultUnits
        ? getDefaultUnitsStake(isVip, current.matches.length)
        : current.unitsStake;

      const next = { ...current, isVip, unitsStake: nextUnits, stake: unitsToRsd(Number(nextUnits) || 0) };
      const meta = getTicketPublicationMeta(next);
      return { ...next, ...meta };
    });
  };

  const changeProductType = (type: TicketProductType) => {
    updateDraft({
      type,
      ticketType: type === 'safe_pick' ? 'SAFE PICK' : getTicketKind(draft.matches.length),
    });
  };

  const buildNormalizedTip = (publicationStatus = draft.publicationStatus): Tip | null => {
    const matches = ensureKindMatchCount(draft.matches, selectedKind).map((match) => ({
      ...match,
      id: match.id || `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      teams: match.teams || `${match.homeTeam} - ${match.awayTeam}`,
      homeTeam: match.homeTeam.trim(),
      awayTeam: match.awayTeam.trim(),
      league: formatLeagueName(match.league),
      prediction: match.prediction.trim(),
      odds: normalizeOdds(match.odds),
      eventDate: getMatchEventDate(match, normalizePublishedDate(draft.date)),
      eventTime: getMatchEventTime(match),
      time: getMatchEventTime(match),
      result: match.result?.trim(),
      analysis: match.analysis?.trim(),
      status: match.status || draft.status,
    }));

    const invalidMatch = matches.find((match) => !match.homeTeam || !match.awayTeam || !match.prediction);
    const unitsStake = Number(draft.unitsStake);
    const manualTotalOdds = Number(totalOddsInput);
    const date = normalizePublishedDate(draft.date);
    const publishedDate = normalizePublishedDate(draft.publishedDate || date);
    const publishedTime = normalizePublishedTime(draft.publishedTime);
    const publishedAt = buildPublishedAt(publishedDate, publishedTime);

    if (invalidMatch || !Number.isFinite(unitsStake) || unitsStake < 1 || unitsStake > 10) {
      alert('Popunite domacina, gosta, tip igre i units od 1 do 10.');
      return null;
    }

    if (draft.totalOddsOverride && (!Number.isFinite(manualTotalOdds) || manualTotalOdds <= 0)) {
      alert('Unesite validnu ukupnu kvotu ili vratite auto obračun.');
      return null;
    }

    const candidate = {
      ...draft,
      date,
      publishedDate,
      publishedTime,
      publishedAt,
      matches,
    } as Tip;

    if (!isPublishedBeforeFirstMatch(candidate)) {
      alert('Tiket ne može biti objavljen nakon početka prvog meča.');
      return null;
    }

    return {
      ...draft,
      source: 'admin',
      type: draft.type || 'elite_ticket',
      date,
      publicationStatus,
      publishedDate,
      publishedTime,
      publishedAt,
      ticketCode: draft.ticketCode || generateTicketCode(Boolean(draft.isVip), publishedDate, publishedTime),
      matches,
      unitsStake: Number(unitsStake.toFixed(2)),
      stake: unitsToRsd(unitsStake),
      totalOdds: draft.totalOddsOverride ? Number(manualTotalOdds.toFixed(2)) : calculateTotalOdds(matches),
      analysis: draft.analysis?.trim() || '',
      totalOddsOverride: Boolean(draft.totalOddsOverride),
    };
  };

  const saveTicket = async (publicationStatus = draft.publicationStatus) => {
    const normalized = buildNormalizedTip(publicationStatus);
    if (!normalized) return;

    setSaving(true);
    try {
      await onSave(normalized);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const deleteTicket = async () => {
    if (!confirm('Da li ste sigurni da želite da obrišete ovaj tiket?')) return;

    setSaving(true);
    try {
      await onDelete(tip.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        className="glass w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-[2.5rem] border-gold-500/20 p-6 md:p-8 relative"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-white/5 rounded-xl text-neutral-500 hover:text-white transition-colors">
          <X size={20} />
        </button>

        <div className="mb-8 pr-12">
          <div className="text-[10px] text-gold-500 font-black uppercase tracking-[0.24em] mb-2">Admin tiket</div>
          <h2 className="text-3xl font-display font-bold">Izmeni tiket</h2>
        </div>

        <div className="grid lg:grid-cols-[1fr_340px] gap-6">
          <div className="space-y-4">
            {draft.matches.map((match, index) => (
              <div key={match.id || index} className="bg-black/30 border border-white/10 rounded-[2rem] p-5">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div className="text-[10px] text-neutral-500 font-black uppercase tracking-widest">Par #{index + 1}</div>
                  <button
                    onClick={() => removeMatch(index)}
                    className="p-2 bg-white/5 rounded-xl text-neutral-500 hover:text-red-400 transition-colors"
                    aria-label="Obriši par iz tiketa"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mb-3">
                  <input value={match.league} onChange={(event) => updateMatch(index, { league: event.target.value })} className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50" placeholder="Liga" />
                  <input value={match.homeTeam} onChange={(event) => updateMatch(index, { homeTeam: event.target.value })} className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50" placeholder="Domacin" />
                  <input value={match.awayTeam} onChange={(event) => updateMatch(index, { awayTeam: event.target.value })} className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50" placeholder="Gost" />
                  <input value={match.result || ''} onChange={(event) => updateMatch(index, { result: event.target.value })} className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50" placeholder="Rezultat npr. 2:1" />
                </div>

                <div className="grid md:grid-cols-2 gap-3 mb-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-neutral-500">Datum početka meča</span>
                    <input
                      type="date"
                      value={match.eventDate || draft.date}
                      onChange={(event) => updateMatch(index, { eventDate: event.target.value })}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-neutral-500">Vreme početka meča</span>
                    <input
                      type="time"
                      value={match.eventTime || match.time || '20:00'}
                      onChange={(event) => updateMatch(index, { eventTime: event.target.value, time: event.target.value })}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                    />
                  </label>
                </div>

                <div className="grid md:grid-cols-[1fr_120px_150px] gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-neutral-500">Igra / tip</span>
                    <input
                      list={`ticket-edit-predictions-${index}`}
                      value={match.prediction}
                      onChange={(event) => updateMatch(index, { prediction: event.target.value })}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                      placeholder="npr. 7+, 1. poluvreme GG, X2..."
                    />
                    <datalist id={`ticket-edit-predictions-${index}`}>
                      {['1', 'X', '2', '1X', 'X2', 'GG', '3+', '7+', 'Over 2.5', 'Under 2.5', '1. poluvreme GG', '2. poluvreme GG', '1+ prvo', '2+ drugo', 'tim daje gol'].map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </label>
                  <input type="number" step="0.01" value={match.odds || ''} onChange={(event) => updateMatch(index, { odds: Number(event.target.value) })} className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50" placeholder="Kvota" />
                  <select
                    value={match.status || draft.status}
                    onChange={(event) => updateMatch(index, { status: event.target.value as TicketStatus })}
                    className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                  >
                    <option value={TicketStatus.PENDING}>PENDING</option>
                    <option value={TicketStatus.WON}>WIN</option>
                    <option value={TicketStatus.LOST}>LOSE</option>
                    <option value={TicketStatus.REFUND}>VOID</option>
                    <option value={TicketStatus.POSTPONED}>ODLOŽENO</option>
                  </select>
                </div>
                <input value={match.analysis || ''} onChange={(event) => updateMatch(index, { analysis: event.target.value })} className="mt-3 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50" placeholder="Komentar / analiza para" />
              </div>
            ))}

            <button
              onClick={addMatch}
              className="w-full py-4 border border-dashed border-gold-500/30 rounded-2xl text-gold-500 font-black uppercase tracking-widest text-xs hover:bg-gold-500/10 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={16} /> Dodaj novi par
            </button>
          </div>

          <aside className="space-y-4">
            <div className="bg-black/30 border border-white/10 rounded-[2rem] p-5">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button onClick={() => changeVisibility(false)} className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border ${!draft.isVip ? 'bg-white text-black border-white' : 'bg-white/5 text-neutral-500 border-white/10'}`}>
                  FREE
                </button>
                <button onClick={() => changeVisibility(true)} className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border ${draft.isVip ? 'bg-gold-500 text-black border-gold-500' : 'bg-white/5 text-neutral-500 border-white/10'}`}>
                  VIP
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <button onClick={() => changeProductType('elite_ticket')} className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border ${(draft.type || 'elite_ticket') === 'elite_ticket' ? 'bg-gold-500 text-black border-gold-500' : 'bg-white/5 text-neutral-500 border-white/10'}`}>
                  ELITE TIKET
                </button>
                <button onClick={() => changeProductType('safe_pick')} className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border ${draft.type === 'safe_pick' ? 'bg-blue-400 text-black border-blue-400' : 'bg-white/5 text-neutral-500 border-white/10'}`}>
                  SAFE PICK
                </button>
              </div>

              <label className="block mb-4">
                <span className="block text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-2">Datum tiketa</span>
                <input type="date" value={draft.date} onChange={(event) => updateDraft({ date: event.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50" />
              </label>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <label className="block">
                  <span className="block text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-2">Datum objave</span>
                  <input
                    type="date"
                    value={draft.publishedDate || ''}
                    onChange={(event) => updateDraft({ publishedDate: event.target.value }, true)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-2">Vreme objave</span>
                  <input
                    type="time"
                    value={draft.publishedTime || '12:00'}
                    onChange={(event) => updateDraft({ publishedTime: event.target.value }, true)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                  />
                </label>
              </div>

              <label className="block mb-4">
                <span className="block text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-2">Ticket code</span>
                <input
                  value={draft.ticketCode || ''}
                  onChange={(event) => updateDraft({ ticketCode: event.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-black tracking-widest text-gold-300 outline-none focus:border-gold-500/50"
                  placeholder="F2205202612XX"
                />
              </label>

              <label className="block mb-4">
                <span className="block text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-2">Status tiketa</span>
                <select value={draft.status} onChange={(event) => updateDraft({ status: event.target.value as TicketStatus })} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50">
                  <option value={TicketStatus.PENDING}>AKTIVAN</option>
                  <option value={TicketStatus.WON}>PROŠLO</option>
                  <option value={TicketStatus.LOST}>PALO</option>
                  <option value={TicketStatus.POSTPONED}>ODLOŽENO</option>
                  <option value={TicketStatus.REFUND}>KVOTA 1 / POVRAT</option>
                </select>
              </label>

              <label className="block mb-4">
                <span className="block text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-2">Tip tiketa</span>
                <select value={selectedKind} onChange={(event) => changeKind(event.target.value as TicketKind)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50">
                  <option value="SINGL">SINGL</option>
                  <option value="DUBL">DUBL</option>
                  <option value="COMBO">COMBO</option>
                </select>
                <span className="mt-2 block text-[10px] text-neutral-600 font-bold uppercase tracking-widest">
                  Trenutno: {getTicketKind(draft.matches.length)}
                </span>
              </label>

              <label className="block mb-4">
                <span className="block text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-2">Units</span>
                <input type="number" min="1" max="10" step="0.5" value={draft.unitsStake || 1} onChange={(event) => updateDraft({ unitsStake: Number(event.target.value), stake: unitsToRsd(Number(event.target.value) || 0) })} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50" />
                <span className="mt-2 block text-[10px] text-neutral-600 font-bold uppercase tracking-widest">{Number(draft.unitsStake) || 0}u = {unitsToRsd(Number(draft.unitsStake) || 0).toLocaleString('sr-RS')} RSD</span>
              </label>

              <div className="mb-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest">Ukupna kvota</span>
                  <button
                    onClick={() => {
                      updateDraft({ totalOddsOverride: false });
                      setTotalOddsInput(String(autoTotalOdds));
                    }}
                    className="text-[9px] text-gold-500 font-black uppercase tracking-widest hover:text-gold-300"
                  >
                    Auto {autoTotalOdds.toFixed(2)}
                  </button>
                </div>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={draft.totalOddsOverride ? totalOddsInput : autoTotalOdds.toFixed(2)}
                  onChange={(event) => {
                    updateDraft({ totalOddsOverride: true });
                    setTotalOddsInput(event.target.value);
                  }}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50"
                />
                <span className="mt-2 block text-[10px] text-neutral-600 font-bold uppercase tracking-widest">
                  {draft.totalOddsOverride ? 'Ručni override uključen' : 'Automatski obračun iz parova'}
                </span>
              </div>

              <label className="block">
                <span className="block text-[10px] text-neutral-500 font-black uppercase tracking-widest mb-2">Analiza tiketa</span>
                <textarea value={draft.analysis || ''} onChange={(event) => updateDraft({ analysis: event.target.value })} rows={4} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-gold-500/50" placeholder="Komentar / analiza tiketa" />
              </label>
            </div>

            <div className="bg-black/30 border border-white/10 rounded-[2rem] p-5">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button disabled={saving} onClick={() => saveTicket(draft.publicationStatus)} className="py-3 bg-white/10 text-neutral-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/15 transition-all disabled:opacity-50">
                  Sačuvaj izmene
                </button>
                <button disabled={saving} onClick={() => saveTicket(TipPublicationStatus.PUBLISHED)} className="py-3 bg-gold-500 text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gold-600 transition-all disabled:opacity-50">
                  Objavi
                </button>
                <button disabled={saving} onClick={() => saveTicket(TipPublicationStatus.DRAFT)} className="py-3 bg-blue-500/10 text-blue-300 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500/20 transition-all disabled:opacity-50">
                  Sakrij
                </button>
                <button disabled={saving} onClick={deleteTicket} className="py-3 bg-red-500/10 text-red-300 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all disabled:opacity-50">
                  Obriši tiket
                </button>
              </div>
              <div className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest">
                {draft.publicationStatus === TipPublicationStatus.PUBLISHED ? 'Trenutno objavljen' : 'Trenutno draft'} · Kvota {displayedTotalOdds.toFixed(2)}
              </div>
            </div>
          </aside>
        </div>
      </motion.div>
    </div>
  );
}
