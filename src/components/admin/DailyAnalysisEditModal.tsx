import { useState } from 'react';
import { motion } from 'motion/react';
import { EyeOff, Save, Trash2, X } from 'lucide-react';
import { DailyAnalysisItem, DailyAnalysisRiskLevel, DailyAnalysisStatus } from '../../types';
import { evaluateDailyAnalysisStatus } from '../../services/dailyAnalysesService';
import { dailyPublicationMetaFromInput, getDailyPublicationInputValue } from '../../utils/dailyPublication';
import { formatLeagueName } from '../../utils/leagueMapper';

type DailyAnalysisEditModalProps = {
  analysis: DailyAnalysisItem;
  onClose: () => void;
  onSave: (analysis: DailyAnalysisItem) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

const fieldClass = 'w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-gold-500/50';
const getWriteErrorMessage = (action: string, writeError: unknown) => {
  const details = writeError instanceof Error ? writeError.message : String(writeError);
  return `${action} nije uspelo. ${details}`;
};

export default function DailyAnalysisEditModal({ analysis, onClose, onSave, onDelete }: DailyAnalysisEditModalProps) {
  const [draft, setDraft] = useState<DailyAnalysisItem>({ ...analysis });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateDraft = (patch: Partial<DailyAnalysisItem>) => {
    setDraft((current) => ({ ...current, ...patch, manualOverride: true }));
  };

  const autoStatus = evaluateDailyAnalysisStatus(draft.prediction, draft.homeScore, draft.awayScore);

  const save = async (next = draft) => {
    setError('');
    if (!next.date || !next.league.trim() || !next.homeTeam.trim() || !next.awayTeam.trim() || !next.prediction.trim()) {
      setError('Popunite datum, ligu, timove i tip.');
      return;
    }

    setSaving(true);
    try {
      const homeScore = next.homeScore === undefined ? undefined : Number(next.homeScore);
      const awayScore = next.awayScore === undefined ? undefined : Number(next.awayScore);
      const result = homeScore !== undefined && awayScore !== undefined ? `${homeScore}:${awayScore}` : next.result;
      const autoStatus = evaluateDailyAnalysisStatus(next.prediction, homeScore, awayScore);
      const status = next.status && next.status !== 'ACTIVE' ? next.status : autoStatus || next.status || 'ACTIVE';
      const resultChanged = homeScore !== analysis.homeScore
        || awayScore !== analysis.awayScore
        || (status !== analysis.status && status !== 'ACTIVE' && status !== 'HIDDEN');

      await onSave({
        ...next,
        league: formatLeagueName(next.league),
        manualOverride: true,
        resultManualOverride: next.resultManualOverride === true || resultChanged,
        odds: Number(next.odds) || 1,
        confidence: next.confidence === undefined ? undefined : Number(next.confidence),
        badges: (next.badges || []).filter(Boolean),
        homeScore,
        awayScore,
        result,
        status,
      });
      onClose();
    } catch (saveError) {
      console.error('Daily analysis save failed:', saveError);
      setError(getWriteErrorMessage('Čuvanje', saveError));
    } finally {
      setSaving(false);
    }
  };

  const hide = async () => {
    await save({ ...draft, status: 'HIDDEN', hidden: true, enabled: false });
  };

  const remove = async () => {
    if (!confirm('Da li želite da obrišete ovu dnevnu analizu?')) return;
    setError('');
    setSaving(true);
    try {
      await onDelete(draft.id);
      onClose();
    } catch (deleteError) {
      console.error('Daily analysis delete failed:', deleteError);
      setError(getWriteErrorMessage('Brisanje', deleteError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="glass relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-gold-500/20 p-5 md:p-7"
      >
        <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-xl bg-white/5 p-2 text-neutral-500 hover:text-white" aria-label="Zatvori">
          <X size={19} />
        </button>
        <div className="mb-6 pr-12">
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-gold-500">Admin analiza</div>
          <h2 className="font-display text-2xl font-bold">Izmeni dnevni tip</h2>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Datum utakmice</span>
            <input type="date" className={fieldClass} value={draft.date} onChange={(event) => updateDraft({ date: event.target.value })} />
          </label>
          <label>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Vreme početka utakmice</span>
            <input type="time" className={fieldClass} value={draft.kickoffTime || draft.matchTime || draft.time} onChange={(event) => updateDraft({ time: event.target.value, matchTime: event.target.value, kickoffTime: event.target.value })} />
          </label>
          <label className="md:col-span-2">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Vreme objave tiketa</span>
            <input
              type="datetime-local"
              className={fieldClass}
              value={getDailyPublicationInputValue(draft)}
              onChange={(event) => updateDraft(dailyPublicationMetaFromInput(event.target.value))}
            />
          </label>
          <label>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Sport</span>
            <select className={fieldClass} value={draft.sport || 'football'} onChange={(event) => updateDraft({ sport: event.target.value as 'football' | 'basketball' })}>
              <option value="football">Fudbal</option>
              <option value="basketball">Košarka</option>
            </select>
          </label>
          <label>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">FREE / VIP</span>
            <select className={fieldClass} value={draft.access} onChange={(event) => updateDraft({ access: event.target.value as 'FREE' | 'VIP' })}>
              <option value="FREE">FREE</option>
              <option value="VIP">VIP</option>
            </select>
          </label>
          <label className="md:col-span-2">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Liga</span>
            <input className={fieldClass} value={draft.league} onChange={(event) => updateDraft({ league: event.target.value })} />
          </label>
          <label>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Domaćin</span>
            <input className={fieldClass} value={draft.homeTeam} onChange={(event) => updateDraft({ homeTeam: event.target.value })} />
          </label>
          <label>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Gost</span>
            <input className={fieldClass} value={draft.awayTeam} onChange={(event) => updateDraft({ awayTeam: event.target.value })} />
          </label>
          <label>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Rezultat domaćin</span>
            <input
              type="number"
              min="0"
              className={fieldClass}
              value={draft.homeScore ?? ''}
              onChange={(event) => updateDraft({ homeScore: event.target.value === '' ? undefined : Number(event.target.value) })}
            />
          </label>
          <label>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Rezultat gost</span>
            <input
              type="number"
              min="0"
              className={fieldClass}
              value={draft.awayScore ?? ''}
              onChange={(event) => updateDraft({ awayScore: event.target.value === '' ? undefined : Number(event.target.value) })}
            />
          </label>
          <label className="md:col-span-2">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Konačan rezultat</span>
            <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-neutral-300">
              {draft.homeScore !== undefined && draft.awayScore !== undefined
                ? `${draft.homeScore}:${draft.awayScore}`
                : 'Nije postavljeno'}
            </div>
            {draft.homeScore !== undefined && draft.awayScore !== undefined && (
              <p className="mt-2 text-[10px] uppercase tracking-widest text-neutral-500">
                {autoStatus ? `Automatski status: ${autoStatus}` : 'Status se ne može izračunati za ovaj tip.'}
              </p>
            )}
          </label>
          <label>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Tip</span>
            <input className={fieldClass} value={draft.prediction} onChange={(event) => updateDraft({ prediction: event.target.value })} />
          </label>
          <label>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Kvota</span>
            <input type="number" min="1" step="0.01" className={fieldClass} value={draft.odds} onChange={(event) => updateDraft({ odds: Number(event.target.value) })} />
          </label>
          <label>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Confidence %</span>
            <input type="number" min="0" max="100" className={fieldClass} value={draft.confidence ?? ''} onChange={(event) => updateDraft({ confidence: event.target.value === '' ? undefined : Number(event.target.value) })} />
          </label>
          <label>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Rizik</span>
            <select className={fieldClass} value={draft.riskLevel || 'MEDIUM'} onChange={(event) => updateDraft({ riskLevel: event.target.value as DailyAnalysisRiskLevel })}>
              <option value="LOW">Nizak</option>
              <option value="MEDIUM">Srednji</option>
              <option value="HIGH">Visok</option>
            </select>
          </label>
          <label>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Status</span>
            <select className={fieldClass} value={draft.status || 'ACTIVE'} onChange={(event) => updateDraft({ status: event.target.value as DailyAnalysisStatus })}>
              <option value="ACTIVE">Aktivan</option>
              <option value="WON">Prošao</option>
              <option value="LOST">Pao</option>
              <option value="POSTPONED">Odloženo</option>
              <option value="REFUND">VOID / PUSH (Povrat)</option>
              <option value="HIDDEN">Sakriven</option>
            </select>
          </label>
          <label>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Tags / badges</span>
            <input className={fieldClass} value={(draft.badges || []).join(', ')} onChange={(event) => updateDraft({ badges: event.target.value.split(',').map((badge) => badge.trim()).filter(Boolean) })} placeholder="HIGH VALUE, VIP PICK" />
          </label>
          <label className="md:col-span-2">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">FREE analiza</span>
            <textarea
              rows={7}
              className={`${fieldClass} min-h-40 resize-y leading-6`}
              value={draft.freeAnalysis || ''}
              onChange={(event) => updateDraft({ freeAnalysis: event.target.value })}
              placeholder="Kratka analiza za FREE prikaz."
            />
          </label>
          <label className="md:col-span-2">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">VIP analiza</span>
            <textarea
              rows={12}
              className={`${fieldClass} min-h-64 resize-y leading-6`}
              value={draft.vipAnalysis || ''}
              onChange={(event) => updateDraft({ vipAnalysis: event.target.value })}
              placeholder="Detaljna premium analiza za VIP prikaz."
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-neutral-300">
            <input type="checkbox" checked={draft.enabled} onChange={(event) => updateDraft({ enabled: event.target.checked })} />
            Uključeno
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-neutral-300">
            <input type="checkbox" checked={draft.hidden === true} onChange={(event) => updateDraft({ hidden: event.target.checked })} />
            Sakriveno
          </label>
        </div>

        {error && (
          <p className="mt-5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" disabled={saving} onClick={() => save()} className="inline-flex items-center gap-2 rounded-xl bg-gold-500 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-black hover:bg-gold-600 disabled:opacity-50">
            <Save size={15} /> Sačuvaj
          </button>
          <button type="button" disabled={saving} onClick={hide} className="inline-flex items-center gap-2 rounded-xl border border-orange-500/20 bg-orange-500/10 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-orange-300 hover:bg-orange-500/20 disabled:opacity-50">
            <EyeOff size={15} /> Sakrij
          </button>
          <button type="button" disabled={saving} onClick={remove} className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-red-300 hover:bg-red-500/20 disabled:opacity-50">
            <Trash2 size={15} /> Obriši
          </button>
        </div>
      </motion.div>
    </div>
  );
}
