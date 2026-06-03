import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Tip, Match, TicketStatus, TipPublicationStatus, type TicketProductType } from '../types';
import { motion } from 'motion/react';
import { buildPublishedAt, calculateTotalOdds, formatLocalTime, getDefaultUnitsStake, normalizeOdds, unitsToRsd } from '../utils/tickets';
import { getTicketProductType } from '../utils/ticketProduct';

interface TipModalProps {
  onClose: () => void;
  onSave: (tip: Tip) => void;
  initialData?: Tip;
}

export default function TipModal({ onClose, onSave, initialData }: TipModalProps) {
  const [isVip, setIsVip] = useState(initialData?.isVip ?? true);
  const [productType, setProductType] = useState<TicketProductType>(initialData ? getTicketProductType(initialData) : 'elite_ticket');
  const [date, setDate] = useState(initialData?.date ?? new Date().toISOString().split('T')[0]);
  const [publishedTime, setPublishedTime] = useState(initialData?.publishedTime ?? formatLocalTime(new Date()));
  const [status, setStatus] = useState<TicketStatus>(initialData?.status ?? TicketStatus.PENDING);
  const [unitsStake, setUnitsStake] = useState(String(initialData?.unitsStake ?? getDefaultUnitsStake(initialData?.isVip ?? true, initialData?.matches?.length ?? 1)));
  const [analysis, setAnalysis] = useState(initialData?.analysis ?? '');
  const [matches, setMatches] = useState<Match[]>(initialData?.matches ?? [
    { teams: '', homeTeam: '', awayTeam: '', league: '', prediction: '', odds: 1.5, time: '20:00' }
  ]);

  const addMatch = () => {
    setMatches([...matches, { teams: '', homeTeam: '', awayTeam: '', league: '', prediction: '', odds: 1.5, time: '20:00' }]);
  };

  const removeMatch = (index: number) => {
    setMatches(matches.filter((_, i) => i !== index));
  };

  const updateMatch = (index: number, field: keyof Match, value: any) => {
    const updated = [...matches];
    updated[index] = { ...updated[index], [field]: value };
    
    // Automatically updated "teams" string if home/away change
    if (field === 'homeTeam' || field === 'awayTeam') {
       updated[index].teams = `${updated[index].homeTeam} - ${updated[index].awayTeam}`;
    }
    
    setMatches(updated);
  };

  const handleSave = () => {
    if (!date || matches.some(m => !m.homeTeam || !m.awayTeam || !m.prediction || !Number.isFinite(Number(m.odds)))) {
      alert('Molimo popunite sva polja.');
      return;
    }

    const normalizedMatches = matches.map((match) => ({
      ...match,
      id: match.id || Math.random().toString(36).slice(2, 11),
      teams: match.teams || `${match.homeTeam} - ${match.awayTeam}`,
      odds: normalizeOdds(match.odds),
    }));

    const normalizedUnitsStake = Number(unitsStake);
    if (!Number.isFinite(normalizedUnitsStake) || normalizedUnitsStake < 1 || normalizedUnitsStake > 10) {
      alert('Unesite units stake od 1 do 10.');
      return;
    }

    const totalOdds = calculateTotalOdds(normalizedMatches);
    
    const newTip: Tip = {
      ...initialData,
      id: initialData?.id || Math.random().toString(36).substr(2, 9),
      source: 'admin',
      type: productType,
      publicationStatus: initialData?.publicationStatus ?? TipPublicationStatus.DRAFT,
      date,
      publishedDate: initialData?.publishedDate || date,
      publishedTime,
      publishedAt: buildPublishedAt(initialData?.publishedDate || date, publishedTime),
      isVip,
      status,
      totalOdds,
      unitsStake: Number(normalizedUnitsStake.toFixed(2)),
      stake: unitsToRsd(normalizedUnitsStake),
      analysis,
      matches: normalizedMatches
    };

    onSave(newTip);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[3rem] p-8 md:p-12 relative"
      >
        <button onClick={onClose} className="absolute top-8 right-8 text-neutral-500 hover:text-white">
          <X size={24} />
        </button>

        <h2 className="text-3xl font-display font-bold mb-8">{initialData ? 'Izmeni Tip' : 'Novi Tip'}</h2>

        <div className="space-y-8">
           {/* Basic Info */}
           <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => {
                  setIsVip(true);
                  setUnitsStake(String(getDefaultUnitsStake(true, matches.length)));
                }}
                className={`py-3 rounded-2xl font-bold uppercase text-xs tracking-widest border transition-all ${isVip ? 'bg-gold-500 text-black border-gold-500' : 'bg-white/5 border-white/10 text-neutral-500'}`}
              >
                VIP Tip
              </button>
              <button 
                onClick={() => {
                  setIsVip(false);
                  setUnitsStake(String(getDefaultUnitsStake(false, matches.length)));
                }}
                className={`py-3 rounded-2xl font-bold uppercase text-xs tracking-widest border transition-all ${!isVip ? 'bg-neutral-200 text-black border-neutral-200' : 'bg-white/5 border-white/10 text-neutral-500'}`}
              >
                Free Tip
              </button>
           </div>

           <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setProductType('elite_ticket')}
                className={`py-3 rounded-2xl font-bold uppercase text-xs tracking-widest border transition-all ${productType === 'elite_ticket' ? 'bg-gold-500 text-black border-gold-500' : 'bg-white/5 border-white/10 text-neutral-500'}`}
              >
                ELITE TIKET
              </button>
              <button
                onClick={() => setProductType('safe_pick')}
                className={`py-3 rounded-2xl font-bold uppercase text-xs tracking-widest border transition-all ${productType === 'safe_pick' ? 'bg-blue-400 text-black border-blue-400' : 'bg-white/5 border-white/10 text-neutral-500'}`}
              >
                SAFE PICK
              </button>
           </div>

           <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-neutral-500 tracking-widest mb-2">Datum</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-gold-500/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-neutral-500 tracking-widest mb-2">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TicketStatus)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-gold-500/50 transition-all"
                >
                  <option value={TicketStatus.PENDING}>Aktivan</option>
                  <option value={TicketStatus.WON}>PROSLO</option>
                  <option value={TicketStatus.LOST}>PALO</option>
                  <option value={TicketStatus.POSTPONED}>ODLOZENO</option>
                  <option value={TicketStatus.REFUND}>KVOTA 1 / POVRAT</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-neutral-500 tracking-widest mb-2">Vreme objave tiketa</label>
                <input
                  type="time"
                  value={publishedTime}
                  onChange={(event) => setPublishedTime(event.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-gold-500/50 transition-all"
                />
              </div>
           </div>

           <div>
              <label className="block text-[10px] font-black uppercase text-neutral-500 tracking-widest mb-2">Units</label>
              <input
                type="number"
                min="1"
                max="10"
                step="0.5"
                value={unitsStake}
                onChange={(e) => setUnitsStake(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-gold-500/50 transition-all"
              />
              <p className="mt-2 text-[10px] text-neutral-500 font-bold uppercase tracking-widest">
                {Number(unitsStake) || 0}u = {unitsToRsd(Number(unitsStake) || 0).toLocaleString('sr-RS')} RSD
              </p>
           </div>

           <div>
              <label className="block text-[10px] font-black uppercase text-neutral-500 tracking-widest mb-2">Analiza</label>
              <textarea 
                value={analysis}
                onChange={(e) => setAnalysis(e.target.value)}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-gold-500/50 transition-all"
                placeholder="Unesite obrazloženje za ovaj tip..."
              />
           </div>

           {/* Matches */}
           <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-neutral-500 tracking-widest">Utakmice</label>
                <button onClick={addMatch} className="flex items-center gap-1 text-gold-500 text-xs font-bold uppercase">
                  <Plus size={14} /> Dodaj par
                </button>
              </div>

              {matches.map((m, i) => (
                <div key={i} className="bg-white/5 p-6 rounded-[2rem] border border-white/5 relative group">
                   {matches.length > 1 && (
                     <button 
                      onClick={() => removeMatch(i)}
                      className="absolute top-4 right-4 text-neutral-600 hover:text-red-500 group-hover:opacity-100 opacity-0 transition-opacity"
                     >
                       <Trash2 size={16} />
                     </button>
                   )}
                   
                   <div className="grid sm:grid-cols-2 gap-4 mb-4">
                      <input 
                        placeholder="Domaćin"
                        value={m.homeTeam}
                        onChange={(e) => updateMatch(i, 'homeTeam', e.target.value)}
                        className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:border-gold-500/50"
                      />
                      <input 
                        placeholder="Gost"
                        value={m.awayTeam}
                        onChange={(e) => updateMatch(i, 'awayTeam', e.target.value)}
                        className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:border-gold-500/50"
                      />
                   </div>

                   <div className="grid grid-cols-3 gap-4">
                      <input 
                        placeholder="Liga"
                        value={m.league}
                        onChange={(e) => updateMatch(i, 'league', e.target.value)}
                        className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs outline-none focus:border-gold-500/50"
                      />
                      <select
                        value={m.prediction}
                        onChange={(e) => updateMatch(i, 'prediction', e.target.value)}
                        className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs outline-none focus:border-gold-500/50"
                      >
                        <option value="">Tip igre</option>
                        {['GG', '3+', '1', 'X', '2', '1X', 'X2'].map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      <input 
                        type="number"
                        step="0.01"
                        placeholder="Kvota"
                        value={m.odds}
                        onChange={(e) => updateMatch(i, 'odds', normalizeOdds(e.target.value))}
                        className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs outline-none focus:border-gold-500/50"
                      />
                   </div>
                </div>
              ))}
           </div>

           <button 
            onClick={handleSave}
            className="w-full py-4 bg-gold-500 text-black font-black uppercase tracking-widest rounded-2xl hover:bg-gold-600 transition-all shadow-lg shadow-gold-500/20"
           >
             SAČUVAJ TIP
           </button>
        </div>
      </motion.div>
    </div>
  );
}
