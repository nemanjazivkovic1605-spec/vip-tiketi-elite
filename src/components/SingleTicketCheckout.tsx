import React, { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import GuestTicketCheckout from './GuestTicketCheckout';
import { useAuth } from '../hooks/useAuth';
import { mockTipsService } from '../services/mockTips';
import { ticketPurchasesService } from '../services/ticketPurchasesService';
import { buildIpsQrPayload, formatRsdAmount, PAYMENT_ACCOUNT, PAYMENT_PRODUCTS, PAYMENT_RECIPIENT, PAYMENT_SUPPORT_EMAIL } from '../lib/paymentProducts';
import { SINGLE_TICKET_PRODUCTS, type SingleTicketProductId, type TicketPurchase } from '../utils/ticketPurchases';
import { getTicketProductType } from '../utils/ticketProduct';
import { getDailyAnalysisDates } from '../utils/dailyDates';
import type { Tip } from '../types';

export default function SingleTicketCheckout({ productId }: { productId: SingleTicketProductId }) {
  const { user, loading: authLoading, canAccessFree, canAccessVip } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const requestedId = params.get('ticketId') || '';
  const [offers, setOffers] = useState<Tip[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [purchases, setPurchases] = useState<TicketPurchase[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const product = SINGLE_TICKET_PRODUCTS[productId];
  const activePath = `/tickets?active=1&category=${product.category}`;
  const purchase = ownerId === user?.id && canAccessFree ? purchases.find(row => row.ticketId === selectedId) : undefined;
  const selected = offers.find(tip => tip.id === selectedId);

  const refreshPurchase = async () => {
    if (!user || !canAccessFree || !selectedId) return;
    const uid = user.id;
    const result = await ticketPurchasesService.read([selectedId]);
    setPurchases(rows => [...rows.filter(row => row.ticketId !== selectedId), ...result.purchases]);
    setOwnerId(uid);
  };

  useEffect(() => {
    let current = true;
    setLoading(true); setError(''); setPurchases([]); setOwnerId('');
    void (async () => {
      const today = getDailyAnalysisDates()[0].date;
      const available = (await mockTipsService.getActiveTickets({ canAccessFree: false, canAccessVip: false }))
        .filter(tip => getTicketProductType(tip) === product.category && tip.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (!current) return;
      setOffers(available);
      setSelectedId(available.some(tip => tip.id === requestedId) ? requestedId : available[0]?.id || '');
      if (canAccessFree && !canAccessVip && available.length) {
        const result = await ticketPurchasesService.read(available.map(tip => tip.id));
        if (current) { setPurchases(result.purchases); setOwnerId(user?.id || ''); }
      }
    })().catch(failure => { if (current) setError(failure instanceof Error ? failure.message : 'Tiketi trenutno nisu dostupni.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [productId, requestedId, user?.id, canAccessFree, canAccessVip]);

  useEffect(() => {
    if (purchase?.status !== 'pending') return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshPurchase().catch(failure => setError(failure instanceof Error ? failure.message : 'Provera uplate nije dostupna.'));
    }, 60000);
    return () => window.clearInterval(timer);
  }, [purchase?.id, purchase?.status, selectedId, user?.id, canAccessFree]);

  useEffect(() => {
    let current = true;
    setQr('');
    if (purchase?.status === 'pending' && purchase.paymentAvailable) {
      const payload = buildIpsQrPayload({ ...PAYMENT_PRODUCTS[productId], purpose: `ELITE TIPS - ${purchase.reference}` }, purchase.priceRsd);
      void import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(payload, { width: 280, margin: 1 }))
        .then(image => { if (current) setQr(image); }).catch(() => { /* Manual payment details remain visible. */ });
    }
    return () => { current = false; };
  }, [purchase?.id, purchase?.status, purchase?.paymentAvailable, purchase?.priceRsd, productId]);

  const prepare = async () => {
    if (!selectedId || !user || !canAccessFree) return;
    const uid = user.id;
    setBusy(true); setError('');
    try {
      const result = await ticketPurchasesService.create(selectedId);
      setPurchases(rows => [...rows.filter(row => row.ticketId !== result.purchase.ticketId), result.purchase]);
      setOwnerId(uid);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Priprema uplate nije uspela.'); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    if (!purchase) return;
    const text = `Primalac: ${PAYMENT_RECIPIENT}\nRačun: ${PAYMENT_ACCOUNT}\nIznos: ${formatRsdAmount(purchase.priceRsd)} RSD\nSvrha: ELITE TIPS - ${purchase.reference}\nTiket: ${purchase.ticketCode}\nEmail: ${purchase.userEmail}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); }
    catch { setError('Kopiranje nije uspelo. Podatke možete označiti i kopirati ručno.'); }
  };

  if (!authLoading && (!user || new URLSearchParams(location.hash.slice(1)).has('purchase'))) {
    return <GuestTicketCheckout key={productId} productId={productId} offers={offers} requestedId={requestedId} loading={loading} loadError={error} />;
  }

  return <section aria-label="Kupovina pojedinačnog tiketa" className="mx-auto max-w-4xl px-5 py-12">
    <h1 className="font-display text-3xl font-black text-white">{product.name}</h1>
    <p className="mt-3 text-neutral-400">Kupovina jednog tiketa. Pristup se aktivira nakon provere uplate.</p>
    <p className="mt-3 text-3xl font-black text-gold-300">{product.priceEur}€</p>
    {error ? <p role="alert" className="mt-5 rounded-xl border border-red-400/30 p-4 text-red-200">{error}</p> : null}
    {loading || authLoading ? <p className="mt-8 text-neutral-400">Učitavanje tiketa...</p>
      : canAccessVip ? <div className="mt-8 rounded-2xl border border-green-400/25 p-6"><p>Već imate VIP pristup.</p><Link to={activePath} className="mt-4 inline-block text-gold-300">Otvori tikete</Link></div>
      : !canAccessFree ? <div className="mt-8 space-y-4 text-neutral-300"><p>Potvrdite email adresu i proverite da je vaš nalog aktivan pre kupovine.</p><Link className="inline-block text-gold-300" to="/dashboard">Otvori nalog i potvrdi email</Link></div>
      : !offers.length ? <p className="mt-8 text-neutral-300">Trenutno nema objavljenog tiketa za kupovinu. Proverite ponovo kasnije.</p>
      : <section className="mt-8 space-y-6 rounded-2xl border border-gold-500/20 bg-black/40 p-6">
        <label className="block text-sm font-bold">Izaberite tiket
          <select aria-label="Tiket za kupovinu" value={selectedId} disabled={busy} onChange={event => { setSelectedId(event.target.value); setCopied(false); setError(''); }} className="mt-3 block w-full rounded-xl border border-white/15 bg-black p-3 text-white">
            {offers.map(tip => <option key={tip.id} value={tip.id}>{tip.date} · {tip.ticketCode || tip.id}</option>)}
          </select>
        </label>
        <p className="text-sm text-neutral-400">Pristup važi za ovaj {product.name.toLowerCase()} za datum {selected?.date}.</p>
        {purchase?.status === 'approved' ? <div className="rounded-xl border border-green-400/25 p-5"><p className="font-bold text-green-300">Tiket je otključan.</p><Link className="mt-3 inline-block text-gold-300" to={activePath}>Otvori kupljeni tiket</Link></div>
          : purchase?.status === 'revoked' ? <p>Pristup je ukinut. Obratite se podršci.</p>
          : purchase?.status === 'pending' && !purchase.paymentAvailable ? <p className="text-neutral-300">Rok za novu uplatu je istekao ili je tiket povučen. Ako ste već uplatili, pošaljite dokaz podršci uz oznaku {purchase.reference}.</p>
          : purchase?.status === 'pending' ? <>
            <p className="text-sm text-neutral-300">Uplata još nije potvrđena. Posle uplate pošaljite dokaz uz oznaku <strong className="text-gold-300">{purchase.reference}</strong>.</p>
            <div className="grid gap-6 sm:grid-cols-2">
              <dl className="space-y-4 break-words text-sm"><div><dt className="text-neutral-500">Primalac</dt><dd>{PAYMENT_RECIPIENT}</dd></div><div><dt className="text-neutral-500">Račun</dt><dd className="font-bold text-gold-200">{PAYMENT_ACCOUNT}</dd></div><div><dt className="text-neutral-500">Iznos</dt><dd className="text-xl font-bold">{formatRsdAmount(purchase.priceRsd)} RSD</dd></div><div><dt className="text-neutral-500">Svrha uplate</dt><dd>ELITE TIPS - {purchase.reference}</dd></div><div><dt className="text-neutral-500">Tiket</dt><dd>{purchase.ticketCode}</dd></div><div><dt className="text-neutral-500">Email naloga</dt><dd>{purchase.userEmail}</dd></div></dl>
              {qr ? <img src={qr} alt="QR kod za uplatu izabranog tiketa" className="w-full max-w-[280px] rounded-xl bg-white p-3" /> : <p className="text-sm text-neutral-400">Za uplatu koristite prikazane podatke.</p>}
            </div>
            <div className="flex flex-wrap gap-3"><button type="button" onClick={() => void copy()} className="rounded-xl bg-gold-500 px-5 py-3 text-sm font-black text-black">{copied ? 'Podaci kopirani' : 'Kopiraj podatke za uplatu'}</button><button type="button" onClick={() => void refreshPurchase().catch(failure => setError(failure instanceof Error ? failure.message : 'Provera nije uspela.'))} className="rounded-xl border border-gold-500/30 px-5 py-3 text-sm text-gold-300">Proveri status uplate</button></div>
            <p className="text-sm leading-6 text-neutral-400">Proverite iznos i oznaku u aplikaciji banke. Pošaljite dokaz kroz <Link to="/contact" className="text-gold-300">kontakt formu</Link> ili na <a className="text-gold-300" href={`mailto:${PAYMENT_SUPPORT_EMAIL}?subject=${encodeURIComponent(`Uplata ${purchase.reference}`)}`}>{PAYMENT_SUPPORT_EMAIL}</a>. Administrator proverava uplatu i otključava ovaj tiket.</p>
          </> : <button type="button" disabled={busy} onClick={() => void prepare()} className="rounded-xl bg-gold-500 px-5 py-3 font-black text-black disabled:opacity-50">{busy ? 'Priprema...' : 'Pripremi uplatu za ovaj tiket'}</button>}
      </section>}
  </section>;
}
