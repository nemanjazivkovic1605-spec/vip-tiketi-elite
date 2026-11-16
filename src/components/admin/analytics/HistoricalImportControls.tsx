import React, { useEffect, useRef, useState } from 'react';
import { Check, Download, FileUp, Search, Square } from 'lucide-react';
import type { HistoricalFilters, HistoricalImportOptions, HistoricalPlanSummary } from '../../../types/historicalAnalytics';
import { analyticsRequest } from '../../../services/admin/footballAnalyticsService';

const input = 'w-full min-w-0 rounded-md border border-white/15 bg-[#171717] px-3 py-2 text-sm';
const button = 'inline-flex items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-2 text-xs font-semibold transition hover:border-gold-500/50 disabled:cursor-not-allowed disabled:opacity-40';
export default function HistoricalImportControls({ filters, onSaved, local }: { filters: HistoricalFilters; onSaved: () => void; local: boolean }) {
  const [provider, setProvider] = useState<HistoricalImportOptions['provider']>('auto');
  const [incremental, setIncremental] = useState(false);
  const [manual, setManual] = useState<{ content: string; format: 'csv' | 'json'; name: string } | null>(null);
  const [sourceName, setSourceName] = useState(''), [rightsConfirmed, setRightsConfirmed] = useState(false), [allowLarge, setAllowLarge] = useState(false);
  const [plan, setPlan] = useState<HistoricalPlanSummary | null>(null), [busy, setBusy] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  const options: HistoricalImportOptions = { ...filters, provider, incremental, ...(provider === 'manual' && manual ? { content: manual.content, format: manual.format, sourceName, rightsConfirmed } : {}) };
  const signature = JSON.stringify(options);
  useEffect(() => { setPlan(null); setAllowLarge(false); }, [signature]);
  useEffect(() => () => controller.current?.abort(), []);
  const act = async (write: boolean) => {
    if (busy || write && !plan) return;
    const abort = new AbortController(); controller.current = abort;
    setBusy(write ? 'write' : 'plan'); setError(''); setMessage('');
    try {
      const data = await analyticsRequest<any>(write ? 'historical-write' : 'historical-plan', {}, 'POST', abort.signal, { options, ...(write ? { fingerprint: plan!.fingerprint, allowLarge } : {}) });
      if (write) { setPlan(null); setMessage(`Uvoz završen: ${data.created} novih, ${data.updated} izmenjenih, ${data.unchanged} nepromenjenih, ${data.unresolved} za proveru.`); onSaved(); }
      else setPlan(data);
    } catch (value) { if (!abort.signal.aborted) setError(value instanceof Error ? value.message : 'Provera nije uspela.'); }
    finally { setBusy(''); controller.current = null; }
  };
  const chooseFile = async (file?: File) => {
    if (!file) return;
    setError(''); setPlan(null);
    if (file.size > 2_000_000 || !/\.(csv|json)$/i.test(file.name)) { setError('Izaberite CSV ili JSON fajl do 2 MB.'); return; }
    setManual({ name: file.name, content: await file.text(), format: /\.json$/i.test(file.name) ? 'json' : 'csv' });
  };
  const records = plan ? plan.create + plan.update + plan.unchanged + plan.unresolved : 0;
  return <section className="space-y-3 border-t border-white/10 pt-5" aria-label="Kontrolisani istorijski uvoz">
    <h2 className="text-base font-bold">Historical Backfill / Incremental Sync</h2>
    <div className="flex flex-wrap items-center gap-3">
      <select className={`${input} max-w-xs`} value={provider} aria-label="Izvor istorijskih podataka" onChange={event => setProvider(event.target.value as HistoricalImportOptions['provider'])} disabled={!!busy}>
        <option value="auto">Dostupni dozvoljeni izvori</option><option value="openfootball">OpenFootball · CC0</option><option value="pitchapi">PitchAPI · samo live podaci</option><option value="football-data.org">football-data.org</option><option value="manual">Ručni CSV / JSON</option>
      </select>
      <label className="flex items-center gap-2 text-xs text-neutral-400"><input type="checkbox" checked={incremental} onChange={event => setIncremental(event.target.checked)} disabled={!!busy || provider === 'manual'} />Samo tekuća sezona · 2026/27</label>
    </div>
    {provider === 'manual' && <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs text-neutral-400">CSV / JSON fajl<input className={`${input} mt-1`} type="file" accept=".csv,.json" disabled={!!busy} onChange={event => void chooseFile(event.target.files?.[0])} /></label>
      <label className="text-xs text-neutral-400">Naziv / vlasnik izvora<input className={`${input} mt-1`} value={sourceName} onChange={event => setSourceName(event.target.value)} disabled={!!busy} maxLength={100} /></label>
      <label className="flex items-start gap-2 text-xs text-neutral-400 sm:col-span-2"><input type="checkbox" checked={rightsConfirmed} onChange={event => setRightsConfirmed(event.target.checked)} disabled={!!busy} />Potvrđujem da imam pravo da koristim ovaj fajl za analitičku bazu.</label>
      {manual && <p className="text-xs text-neutral-500 sm:col-span-2"><FileUp className="mr-1 inline" size={14} />{manual.name}</p>}
      <p className="break-words text-xs leading-5 text-neutral-500 sm:col-span-2">CSV: id,date,time,homeTeam,awayTeam,htHome,htAway,ftHome,ftAway,status. Liga i sezona biraju se iz filtera. kickoffAt je opcioni ISO datum sa Z/offsetom. Prazna vrednost ostaje null.</p>
    </div>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={!!busy} onClick={() => void act(false)}><Search size={15} />{busy === 'plan' ? 'Provera izvora…' : 'Dry-run · proveri plan'}</button>
      {busy && <button type="button" className={button} onClick={() => controller.current?.abort()}><Square size={14} />Prekini zahtev</button>}
      <a className={button} href="/templates/historical-matches.csv" download><Download size={15} />CSV zaglavlje</a>
    </div>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
    {plan && <div className="space-y-3 border-t border-white/10 pt-3">
      <h3 className="text-sm font-semibold">Plan bez upisa</h3>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[['Novi mečevi', plan.create], ['Izmene', plan.update], ['Bez promena', plan.unchanged], ['Za proveru', plan.unresolved], ['Odbačeni', plan.rejected], ['Duplikati u fajlu', plan.duplicateRows], ['SQL upisi · najviše', plan.sqlWritesUpperBound], ['Firestore upisi', plan.firestoreWrites]].map(([name, count]) => <div key={name} className="border-b border-white/10 pb-2"><span className="text-xs text-neutral-500">{name}</span><strong className="mt-1 block tabular-nums">{count}</strong></div>)}</div>
      <details><summary className="cursor-pointer text-xs text-neutral-400">Izvori, obim i upozorenja · {plan.datasets.length} skupova</summary><div className="mt-2 max-h-72 space-y-3 overflow-y-auto">{plan.datasets.map(row => <div key={`${row.provider}:${row.league}:${row.season}`} className="border-b border-white/10 pb-2 text-xs leading-5 text-neutral-400"><strong className="text-neutral-100">{row.league} · {row.season} · {row.provider}</strong><p>{row.validRows}/{row.sourceRows} validnih · HT+FT {row.withHtFt} · FT {row.withFt} · {row.state}</p>{row.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>)}</div></details>
      {records > 500 && <label className="flex items-start gap-2 text-xs text-amber-300"><input type="checkbox" checked={allowLarge} onChange={event => setAllowLarge(event.target.checked)} />Potvrđujem veći uvoz od {records} mečeva u odvojenu SQL bazu. Firestore se ne koristi.</label>}
      {!local && !plan.productionWriteAllowed && <p className="text-xs text-amber-300">Produkcijski upis nije omogućen. Potrebni su proveren plan i HISTORICAL_ANALYTICS_WRITE_ENABLED.</p>}
      <button type="button" className={`${button} border-gold-500/40 text-gold-300`} disabled={!!busy || records > 500 && !allowLarge || records > 5000 || !local && !plan.productionWriteAllowed} onClick={() => void act(true)}><Check size={15} />{busy === 'write' ? 'Čuvanje u bazu…' : 'Potvrdi plan i uvezi'}</button>
    </div>}
  </section>;
}
