import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { Tip } from '../types';
import { guestTicketPurchasesService, type GuestTicketPurchaseResult } from '../services/ticketPurchasesService';
import { buildIpsQrPayload, formatRsdAmount, PAYMENT_ACCOUNT, PAYMENT_PRODUCTS, PAYMENT_RECIPIENT, PAYMENT_SUPPORT_EMAIL } from '../lib/paymentProducts';
import { isPurchaseEmail, normalizePurchaseEmail, SINGLE_TICKET_PRODUCTS, type SingleTicketProductId } from '../utils/ticketPurchases';
import { guestCheckoutLink, guestCheckoutStorage, newGuestToken, savedGuestToken, saveGuestToken } from '../utils/guestCheckout';
import { formatFirstMatchStartAt } from '../utils/tickets';

export default function GuestTicketCheckout({ productId, offers, requestedId, loading: offersLoading, loadError }: {
  key?: string; productId: SingleTicketProductId; offers: Tip[]; requestedId: string; loading: boolean; loadError: string;
}) {
  const location = useLocation();
  const [selectedId, setSelectedId] = useState(requestedId);
  const [email, setEmail] = useState('');
  const [credential, setCredential] = useState({ ticketId: '', token: '' });
  const [grant, setGrant] = useState<GuestTicketPurchaseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState('');
  const version = useRef(0);
  const product = SINGLE_TICKET_PRODUCTS[productId];
  const purchase = grant?.purchase.ticketId === selectedId ? grant.purchase : undefined;
  const ticket = purchase?.status === 'approved' ? grant?.ticket : undefined;
  const privateLink = credential.ticketId === selectedId && credential.token
    ? guestCheckoutLink(window.location.origin, productId, selectedId, credential.token) : '';
  const selected = offers.find(tip => tip.id === selectedId);

  useEffect(() => {
    if (offersLoading) return;
    const token = selectedId ? savedGuestToken(selectedId, selectedId === requestedId ? location.hash : '', guestCheckoutStorage()) : '';
    if ((!selectedId || !offers.some(tip => tip.id === selectedId)) && !token) setSelectedId(offers[0]?.id || '');
  }, [offers, offersLoading, requestedId, selectedId, location.hash]);

  useEffect(() => {
    const request = ++version.current;
    const token = selectedId ? savedGuestToken(selectedId, selectedId === requestedId ? location.hash : '', guestCheckoutStorage()) : '';
    setCredential({ ticketId: selectedId, token }); setGrant(null); setError(''); setCopied(''); setQr('');
    if (token) {
      saveGuestToken(selectedId, token, guestCheckoutStorage());
      setBusy(true);
      void guestTicketPurchasesService.read(selectedId, token).then(result => {
        if (request === version.current) { setGrant(result); setEmail(result.purchase.userEmail); }
      }).catch(failure => { if (request === version.current) setError(failure instanceof Error ? failure.message : 'Provera zahteva nije dostupna.'); })
        .finally(() => { if (request === version.current) setBusy(false); });
    } else setBusy(false);
    return () => { version.current++; };
  }, [selectedId, requestedId, location.hash]);

  const refresh = async () => {
    if (credential.ticketId !== selectedId || !credential.token) return;
    const request = ++version.current;
    setError('');
    try {
      const result = await guestTicketPurchasesService.read(selectedId, credential.token);
      if (request === version.current) { setGrant(result); setEmail(result.purchase.userEmail); }
    } catch (failure) {
      if (request === version.current) { setGrant(null); setError(failure instanceof Error ? failure.message : 'Provera zahteva nije dostupna.'); }
    }
  };
  useEffect(() => {
    if (!purchase || purchase.status === 'revoked') return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60000);
    return () => window.clearInterval(timer);
  }, [purchase?.id, purchase?.status, selectedId, credential.token]);

  useEffect(() => {
    let current = true; setQr('');
    if (purchase?.status === 'pending' && purchase.paymentAvailable) {
      const payload = buildIpsQrPayload({ ...PAYMENT_PRODUCTS[productId], purpose: `ELITE TIPS - ${purchase.reference}` }, purchase.priceRsd);
      void import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(payload, { width: 280, margin: 1 }))
        .then(data => { if (current) setQr(data); }).catch(() => { /* Manual details remain available. */ });
    }
    return () => { current = false; };
  }, [purchase?.id, purchase?.status, purchase?.paymentAvailable, purchase?.priceRsd, productId]);

  const prepare = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = normalizePurchaseEmail(email);
    if (!selected || !isPurchaseEmail(normalizedEmail)) { setError('Unesite ispravnu email adresu i izaberite tiket.'); return; }
    const token = credential.ticketId === selectedId && credential.token ? credential.token : newGuestToken();
    // Save before the request so a lost response can be retried with the same order.
    saveGuestToken(selectedId, token, guestCheckoutStorage());
    setCredential({ ticketId: selectedId, token });
    const request = ++version.current;
    setBusy(true); setError('');
    try {
      let result = await guestTicketPurchasesService.create(selectedId, normalizedEmail, token);
      if (result.purchase.status === 'approved') result = await guestTicketPurchasesService.read(selectedId, token);
      if (request === version.current) { setGrant(result); setEmail(result.purchase.userEmail); }
    } catch (failure) { if (request === version.current) setError(failure instanceof Error ? failure.message : 'Priprema uplate nije uspela.'); }
    finally { if (request === version.current) setBusy(false); }
  };
  const copy = async (text: string, kind: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(kind); }
    catch { setError('Kopiranje nije uspelo. Link ili podatke možete označiti i kopirati ručno.'); }
  };

  return <section aria-label="Kupovina bez prijave" className="mx-auto max-w-4xl px-5 py-12">
    <h1 className="font-display text-3xl font-black text-white">{product.name}</h1>
    <p className="mt-3 text-neutral-400">Kupite tiket bez prijave i registracije. Pristup se otključava nakon provere uplate.</p>
    <p className="mt-3 text-3xl font-black text-gold-300">{product.priceEur}€</p>
    {error || loadError ? <p role="alert" className="mt-5 rounded-xl border border-red-400/30 p-4 text-red-200">{error || loadError}</p> : null}
    {offersLoading && !purchase ? <p className="mt-8 text-neutral-400">Učitavanje tiketa...</p> : !offers.length && !purchase && !credential.token ? <p className="mt-8 text-neutral-300">Trenutno nema objavljenog tiketa za kupovinu. Proverite ponovo kasnije.</p> : <div className="mt-8 space-y-6 rounded-2xl border border-gold-500/20 bg-black/40 p-6">
      {offers.length ? <label className="block text-sm font-bold">Izaberite tiket<select aria-label="Tiket za kupovinu" value={selectedId} disabled={busy} onChange={event => setSelectedId(event.target.value)} className="mt-3 block w-full rounded-xl border border-white/15 bg-black p-3 text-white">{!selected && purchase ? <option value={selectedId}>{purchase.ticketDate} · {purchase.ticketCode}</option> : null}{offers.map(tip => <option key={tip.id} value={tip.id}>{tip.date} · {tip.ticketCode || tip.id}</option>)}</select></label> : null}
      {!purchase ? <form onSubmit={event => void prepare(event)} className="space-y-4">
        <label className="block text-sm font-bold">Email za kupovinu<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} placeholder="vas@email.com" className="mt-3 block w-full rounded-xl border border-white/15 bg-black p-3 text-white" /></label>
        <p className="text-sm text-neutral-400">Email služi za povezivanje uplate i kontakt sa podrškom. Nalog nije potreban.</p>
        <button type="submit" disabled={busy || !selected} className="rounded-xl bg-gold-500 px-5 py-3 font-black text-black disabled:opacity-50">{busy ? 'Priprema...' : 'Pripremi uplatu bez prijave'}</button>
      </form> : null}
      {purchase && privateLink ? <div className="space-y-3 rounded-xl border border-gold-500/25 p-4"><p className="text-sm text-neutral-300">Sačuvajte privatan link za ovaj tiket. Nakon potvrde uplate otvorite isti link. Link omogućava pristup tiketu, zato ga ne delite.</p><a href={privateLink} className="block break-all text-xs text-gold-300">Privatan link za moj tiket</a><button type="button" onClick={() => void copy(privateLink, 'link')} className="rounded-xl border border-gold-500/30 px-4 py-3 text-sm text-gold-300">{copied === 'link' ? 'Link kopiran' : 'Kopiraj privatan link'}</button></div> : null}
      {purchase?.status === 'pending' && purchase.paymentAvailable ? <>
        <p className="text-sm text-neutral-300">Pošaljite dokaz o uplati uz oznaku <strong className="text-gold-300">{purchase.reference}</strong> i email <strong>{purchase.userEmail}</strong>.</p>
        <div className="grid gap-6 sm:grid-cols-2"><dl className="space-y-4 break-words text-sm"><div><dt className="text-neutral-500">Primalac</dt><dd>{PAYMENT_RECIPIENT}</dd></div><div><dt className="text-neutral-500">Račun</dt><dd className="font-bold text-gold-200">{PAYMENT_ACCOUNT}</dd></div><div><dt className="text-neutral-500">Iznos</dt><dd className="text-xl font-bold">{formatRsdAmount(purchase.priceRsd)} RSD</dd></div><div><dt className="text-neutral-500">Svrha uplate</dt><dd>ELITE TIPS - {purchase.reference}</dd></div><div><dt className="text-neutral-500">Tiket</dt><dd>{purchase.ticketCode}</dd></div></dl>{qr ? <img src={qr} alt="QR kod za uplatu izabranog tiketa" className="w-full max-w-[280px] rounded-xl bg-white p-3" /> : null}</div>
        <button type="button" onClick={() => void copy(`Primalac: ${PAYMENT_RECIPIENT}\nRačun: ${PAYMENT_ACCOUNT}\nIznos: ${formatRsdAmount(purchase.priceRsd)} RSD\nSvrha: ELITE TIPS - ${purchase.reference}\nEmail: ${purchase.userEmail}\nTiket: ${purchase.ticketCode}`, 'payment')} className="rounded-xl bg-gold-500 px-5 py-3 text-sm font-black text-black">{copied === 'payment' ? 'Podaci kopirani' : 'Kopiraj podatke za uplatu'}</button>
      </> : null}
      {purchase?.status === 'pending' && !purchase.paymentAvailable ? <p>Rok za novu uplatu je istekao ili je tiket povučen. Ako ste već uplatili, pošaljite dokaz podršci uz oznaku {purchase.reference}.</p> : null}
      {purchase?.status === 'revoked' ? <p>Pristup je ukinut. Obratite se podršci uz oznaku {purchase.reference}.</p> : null}
      {purchase?.status === 'approved' ? ticket ? <article className="space-y-5 rounded-xl border border-green-400/25 p-5"><h2 className="text-xl font-bold text-green-300">Vaš kupljeni tiket</h2><p className="text-sm text-neutral-300">{ticket.ticketCode} · {ticket.date} · {formatFirstMatchStartAt(ticket)}</p>{ticket.matches.map(match => <div key={match.id} className="space-y-2 border-t border-white/10 pt-4"><p className="font-bold">{match.homeTeam && match.awayTeam ? `${match.homeTeam} - ${match.awayTeam}` : match.teams}</p><p className="text-xs text-neutral-400">{match.league}</p><p className="font-black text-gold-300">{match.prediction} · {Number(match.odds).toFixed(2)}</p>{match.analysis ? <p className="whitespace-pre-line text-sm text-neutral-300">{match.analysis}</p> : null}{match.result ? <p className="text-sm">Rezultat: {match.result}</p> : null}</div>)}<p className="font-black">Ukupna kvota: {Number(ticket.totalOdds).toFixed(2)}</p>{ticket.analysis ? <p className="whitespace-pre-line text-sm text-neutral-300">{ticket.analysis}</p> : null}</article> : <p>Uplata je potvrđena, ali tiket trenutno nije dostupan. Obratite se podršci uz oznaku {purchase.reference}.</p> : null}
      {credential.token ? <button type="button" onClick={() => void refresh()} disabled={busy} className="rounded-xl border border-gold-500/30 px-5 py-3 text-sm text-gold-300 disabled:opacity-50">Proveri status uplate</button> : null}
      {purchase ? <p className="text-sm leading-6 text-neutral-400">Za dokaz uplate ili pomoć koristite <Link to="/contact" className="text-gold-300">kontakt formu</Link> ili <a className="text-gold-300" href={`mailto:${PAYMENT_SUPPORT_EMAIL}?subject=${encodeURIComponent(`Uplata ${purchase.reference}`)}`}>{PAYMENT_SUPPORT_EMAIL}</a>. Administrator proverava uplatu prema oznaci i iznosu.</p> : null}
    </div>}
  </section>;
}
