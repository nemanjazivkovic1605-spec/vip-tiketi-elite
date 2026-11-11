import { useEffect, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import type { DailyProposal } from '../../types';
import { dailyProposalsService } from '../../services/admin/dailyProposalsService';
import { formatLeagueName } from '../../utils/leagueMapper';

export default function DailyProposalList({ onChoose }: { onChoose: (proposal: DailyProposal) => void }) {
  const [proposals, setProposals] = useState<DailyProposal[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => dailyProposalsService.subscribe(setProposals, () => setError('Predlozi trenutno nisu dostupni. Pokusajte ponovo.')), []);

  const dismiss = async (id: string) => {
    setBusy(id);
    setError('');
    try { await dailyProposalsService.dismiss(id); }
    catch { setError('Predlog nije uklonjen. Pokusajte ponovo.'); }
    finally { setBusy(''); }
  };

  if (!proposals.length && !error) return null;
  return (
    <section className="mb-6 min-w-0 border-b border-white/10 pb-6" aria-label="Predlozi za pregled">
      <h3 className="text-lg font-bold text-white">Predlozi za pregled <span className="text-sm text-neutral-500">({proposals.length})</span></h3>
      <p className="mt-1 text-xs leading-5 text-neutral-400">Nisu javno objavljeni. Izaberite predlog, proverite podatke i objavite ga kroz formu.</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      <div className="mt-3 space-y-3">
        {proposals.map((proposal) => (
          <article key={proposal.id} className="min-w-0 break-words rounded-lg border border-white/10 bg-neutral-900 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-neutral-500">{proposal.date} · {proposal.analysis.time} · {formatLeagueName(proposal.analysis.league)}</p>
                <h4 className="mt-1 break-words font-semibold text-white">{proposal.analysis.homeTeam} - {proposal.analysis.awayTeam}</h4>
              </div>
              <button type="button" title="Ukloni predlog" aria-label={`Ukloni predlog ${proposal.analysis.homeTeam} - ${proposal.analysis.awayTeam}`} disabled={busy === proposal.id} onClick={() => dismiss(proposal.id)} className="shrink-0 rounded-md p-2 text-neutral-500 hover:bg-white/5 hover:text-white disabled:opacity-50"><X size={16} /></button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-neutral-300">{proposal.analysis.prediction ? `Predlog: ${proposal.analysis.prediction}` : 'Tip za rucnu procenu'} · {proposal.analysis.odds > 1 ? `Kvota: ${proposal.analysis.odds.toFixed(2)}` : 'Kvota nije dostupna'}</div>
              <button type="button" onClick={() => onChoose(proposal)} className="inline-flex items-center gap-2 rounded-md border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-xs font-bold text-gold-400 hover:bg-gold-500/20"><Pencil size={14} />Uredi predlog</button>
            </div>
            <p className="mt-2 text-xs leading-5 text-neutral-500">{proposal.reviewNote}</p>
            {proposal.bookmaker && <p className="mt-1 text-[11px] text-neutral-500">Izvor kvote: {proposal.bookmaker}{proposal.oddsUpdatedAt ? ` · ${new Date(proposal.oddsUpdatedAt).toLocaleString('sr-Latn-RS')}` : ''}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
