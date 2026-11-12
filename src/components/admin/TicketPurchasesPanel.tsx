import React, { useCallback, useEffect, useState } from 'react';
import { ticketPurchasesService } from '../../services/ticketPurchasesService';
import { formatRsdAmount } from '../../lib/paymentProducts';
import type { TicketPurchase } from '../../utils/ticketPurchases';

export default function TicketPurchasesPanel() {
  const [rows, setRows] = useState<TicketPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows((await ticketPurchasesService.adminList()).purchases); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Zahtevi nisu dostupni.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const change = async (row: TicketPurchase, approve: boolean) => {
    if (approve && !verified[row.id]) return;
    if (!approve && !window.confirm(`Ukinuti pristup tiketu ${row.ticketCode} za ${row.userEmail}?`)) return;
    setBusyId(row.id); setError('');
    try {
      const result = approve ? await ticketPurchasesService.approve(row.id) : await ticketPurchasesService.revoke(row.id);
      setRows(current => current.map(item => item.id === row.id ? result.purchase : item));
      setVerified(current => ({ ...current, [row.id]: false }));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Izmena pristupa nije uspela.'); }
    finally { setBusyId(''); }
  };
  return <section>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-display text-3xl font-bold">Kupovine tiketa</h2><p className="mt-2 text-sm text-neutral-400">Proverite uplatu prema oznaci i iznosu, pa otključajte konkretan tiket.</p></div><button type="button" onClick={() => void refresh()} disabled={loading || Boolean(busyId)} className="rounded-xl border border-gold-500/30 px-4 py-3 text-sm text-gold-300 disabled:opacity-50">Osveži zahteve</button></div>
    {error ? <p role="alert" className="mb-5 rounded-xl border border-red-400/25 p-4 text-red-200">{error}</p> : null}
    {loading ? <p>Učitavanje zahteva...</p> : !rows.length ? <p className="text-neutral-400">Još nema zahteva za pojedinačnu kupovinu.</p> : <div className="space-y-4">{rows.map(row => <article key={row.id} className="rounded-2xl border border-white/10 bg-black/30 p-5">
      <div className="flex flex-wrap justify-between gap-4"><div><h3 className="font-bold text-gold-300">{row.productName} · {row.ticketDate}</h3><p className="mt-2 break-all text-sm">{row.userEmail}</p><p className="mt-2 break-all text-xs text-neutral-400">Tiket: {row.ticketCode}</p></div><div><p className="text-xl font-black">{formatRsdAmount(row.priceRsd)} RSD</p><p className="text-sm text-neutral-400">{row.priceEur} EUR</p><p className="mt-2 font-bold">{row.reference}</p><p className="mt-2 text-xs text-neutral-400">{row.status === 'approved' ? 'PRISTUP ODOBREN' : row.status === 'revoked' ? 'PRISTUP UKINUT' : 'ČEKA PROVERU UPLATE'}</p></div></div>
      {row.status !== 'approved' ? <div className="mt-5 space-y-3"><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={Boolean(verified[row.id])} onChange={event => setVerified(current => ({ ...current, [row.id]: event.target.checked }))} className="mt-1" />Proverio sam uplatu od {formatRsdAmount(row.priceRsd)} RSD sa oznakom {row.reference}.</label><button type="button" disabled={!verified[row.id] || Boolean(busyId)} onClick={() => void change(row, true)} className="rounded-xl bg-gold-500 px-4 py-3 text-sm font-black text-black disabled:opacity-40">Potvrdi uplatu i otključaj tiket</button></div> : <button type="button" disabled={Boolean(busyId)} onClick={() => void change(row, false)} className="mt-5 rounded-xl border border-red-400/30 px-4 py-3 text-sm text-red-200 disabled:opacity-40">Ukini pristup ovom tiketu</button>}
    </article>)}</div>}
  </section>;
}
