import React, { useEffect, useMemo, useState } from 'react';
import { Check, ClipboardCopy, Landmark, LockKeyhole, Mail, QrCode, ReceiptText, ShieldCheck, UserPlus } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  buildIpsQrPayload,
  buildPaymentSummary,
  calculateRsdPrice,
  EUR_RSD_RATE,
  formatRsdAmount,
  getCheckoutPath,
  PAYMENT_ACCOUNT,
  PAYMENT_PRODUCTS,
  PAYMENT_SUPPORT_EMAIL,
  type PaymentProductId,
} from '../lib/paymentProducts';

const isPaymentProductId = (value: string | null): value is PaymentProductId =>
  Boolean(value && Object.prototype.hasOwnProperty.call(PAYMENT_PRODUCTS, value));

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await Promise.race([
        navigator.clipboard.writeText(value),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Clipboard timeout.')), 700)),
      ]);
      return;
    } catch {
      // Some embedded browsers block the Clipboard API even after a user click.
    }
  }

  const textArea = document.createElement('textarea');
  textArea.value = value;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  const copied = document.execCommand('copy');
  textArea.remove();
  if (!copied) throw new Error('Copy command was rejected by the browser.');
};

export default function Checkout() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [qrImage, setQrImage] = useState('');
  const [qrError, setQrError] = useState('');
  const [copied, setCopied] = useState<'account' | 'details' | null>(null);
  const [copyError, setCopyError] = useState('');

  const productId = searchParams.get('product');
  const product = isPaymentProductId(productId) ? PAYMENT_PRODUCTS[productId] : null;
  const paymentNote = user?.email || 'UNESITE EMAIL U NAPOMENU UPLATE';
  const rsdPrice = product ? calculateRsdPrice(product.priceEur) : 0;

  const ipsPayload = useMemo(
    () => product ? buildIpsQrPayload(product) : '',
    [product],
  );
  const paymentSummary = useMemo(
    () => product ? buildPaymentSummary(product, paymentNote) : '',
    [paymentNote, product],
  );

  useEffect(() => {
    let active = true;
    setQrImage('');
    setQrError('');

    if (!ipsPayload) return () => {
      active = false;
    };

    void import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(ipsPayload, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 300,
        color: {
          dark: '#090909',
          light: '#ffffff',
        },
      }))
      .then((dataUrl) => {
        if (active) setQrImage(dataUrl);
      })
      .catch((error) => {
        console.error('Payment QR generation failed:', error);
        if (active) setQrError('QR kod trenutno nije dostupan. Podatke za uplatu možete kopirati ručno.');
      });

    return () => {
      active = false;
    };
  }, [ipsPayload]);

  const copy = async (type: 'account' | 'details', value: string) => {
    setCopyError('');
    try {
      await copyText(value);
      setCopied(type);
      window.setTimeout(() => setCopied(null), 2200);
    } catch (error) {
      console.error('Payment details copy failed:', error);
      setCopyError('Kopiranje nije uspelo. Označite podatke i kopirajte ih ručno.');
    }
  };

  if (!product) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 md:px-6">
        <div className="rounded-2xl border border-gold-500/20 bg-black/55 p-8 text-center">
          <ReceiptText className="mx-auto text-gold-400" size={34} />
          <h1 className="mt-4 font-display text-3xl font-black">Izaberite proizvod</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-400">Otvorite pakete i izaberite tiket ili VIP članstvo koje želite da uplatite.</p>
          <Link to="/#pricing" className="mt-6 inline-flex rounded-lg bg-gold-500 px-5 py-3 text-xs font-black uppercase tracking-wide text-black transition-colors hover:bg-gold-400">
            Pogledaj pakete
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#050505] px-5 pb-20 pt-10 md:px-6">
      <section className="mx-auto max-w-6xl">
        <div className="mb-8 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gold-300">
            <ShieldCheck size={14} /> Sigurna ručna uplata
          </div>
          <h1 className="mt-4 font-display text-4xl font-black text-white md:text-5xl">Podaci za uplatu</h1>
          <p className="mt-3 text-sm leading-7 text-neutral-400">
            Uplatite iznos na tekući račun i pošaljite dokaz o uplati. Pristup se aktivira nakon ručne provere.
          </p>
        </div>

        {!user && (
          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-blue-400/20 bg-blue-500/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <UserPlus className="mt-0.5 shrink-0 text-blue-300" size={20} />
              <div>
                <p className="text-sm font-bold text-blue-100">Preporučujemo registraciju pre uplate.</p>
                <p className="mt-1 text-xs leading-5 text-blue-200/65">Tako ćemo lakše povezati uplatu sa vašim nalogom i brže aktivirati pristup.</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link to="/login" className="rounded-lg border border-blue-300/25 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-blue-100 hover:bg-blue-400/10">Prijavi se</Link>
              <Link to="/register" className="rounded-lg bg-blue-400 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-black hover:bg-blue-300">Kreiraj nalog</Link>
            </div>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[1fr_0.72fr]">
          <div className="rounded-2xl border border-white/10 bg-black/60 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.32)] md:p-7">
            <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gold-400">Izabrani proizvod</p>
                <h2 className="mt-2 font-display text-2xl font-black uppercase text-white">{product.name}</h2>
                <p className="mt-1 text-sm leading-6 text-neutral-500">{product.description}</p>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <div className="font-display text-4xl font-black text-gold-300">{product.priceEur}€</div>
                <div className="mt-1 text-sm font-bold text-neutral-300">≈ {formatRsdAmount(rsdPrice)} RSD</div>
              </div>
            </div>

            <dl className="mt-5 grid gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                <dt className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Broj tekućeg računa</dt>
                <dd className="mt-2 break-all font-display text-xl font-black tracking-wide text-gold-200">{PAYMENT_ACCOUNT}</dd>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                <dt className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Svrha uplate</dt>
                <dd className="mt-2 text-sm font-bold text-neutral-200">{product.purpose}</dd>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                <dt className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Napomena uz uplatu</dt>
                <dd className="mt-2 break-all text-sm font-bold text-neutral-200">{paymentNote}</dd>
              </div>
            </dl>

            <p className="mt-3 text-[11px] leading-5 text-neutral-500">
              Preračunato po kursu 1 EUR = {EUR_RSD_RATE.toFixed(2)} RSD. Za ručnu uplatu koristite prikazani iznos u dinarima.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void copy('account', PAYMENT_ACCOUNT)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gold-500/25 bg-gold-500/10 px-4 py-3 text-xs font-black uppercase tracking-wide text-gold-200 transition-colors hover:bg-gold-500/15"
              >
                {copied === 'account' ? <Check size={16} /> : <ClipboardCopy size={16} />}
                {copied === 'account' ? 'Račun kopiran' : 'Kopiraj račun'}
              </button>
              <button
                type="button"
                onClick={() => void copy('details', paymentSummary)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold-500 px-4 py-3 text-xs font-black uppercase tracking-wide text-black transition-colors hover:bg-gold-400"
              >
                {copied === 'details' ? <Check size={16} /> : <ReceiptText size={16} />}
                {copied === 'details' ? 'Podaci kopirani' : 'Kopiraj podatke za uplatu'}
              </button>
            </div>
            {copyError && <p className="mt-3 text-xs font-medium text-red-300">{copyError}</p>}
          </div>

          <aside className="rounded-2xl border border-gold-500/20 bg-[linear-gradient(145deg,rgba(40,27,0,0.34),rgba(0,0,0,0.82))] p-5 md:p-7">
            <div className="flex items-center gap-3">
              <QrCode className="text-gold-400" size={23} />
              <div>
                <h2 className="font-display text-xl font-black text-white">QR kod za uplatu</h2>
                <p className="mt-1 text-xs text-neutral-500">Skenirajte kod u mobilnoj banking aplikaciji.</p>
              </div>
            </div>
            <div className="mt-5 flex min-h-[274px] items-center justify-center rounded-xl border border-white/10 bg-white p-3">
              {qrImage ? (
                <img src={qrImage} alt={`QR kod za uplatu - ${product.name}`} className="h-auto w-full max-w-[260px]" />
              ) : qrError ? (
                <p className="max-w-xs text-center text-xs leading-5 text-neutral-700">{qrError}</p>
              ) : (
                <div className="h-56 w-56 animate-pulse rounded-lg bg-neutral-200" />
              )}
            </div>
            <p className="mt-3 text-[10px] leading-5 text-neutral-500">
              QR sadrži IPS podatke za nalog, iznos i svrhu uplate. Pre potvrde proverite podatke i dodajte prikazanu email napomenu u aplikaciji banke.
            </p>
          </aside>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="flex gap-3 rounded-2xl border border-gold-500/20 bg-gold-500/[0.06] p-4">
            <Landmark className="mt-0.5 shrink-0 text-gold-400" size={20} />
            <div>
              <p className="text-sm font-bold text-gold-100">Uplata se proverava ručno.</p>
              <p className="mt-1 text-xs leading-5 text-neutral-500">Pristup se aktivira nakon provere uplate.</p>
            </div>
          </div>
          <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <Mail className="mt-0.5 shrink-0 text-gold-400" size={20} />
            <div>
              <p className="text-sm font-bold text-neutral-200">Pošaljite dokaz o uplati.</p>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                Nakon uplate pošaljite dokaz kroz <Link to="/contact" className="text-gold-300 hover:text-gold-200">kontakt formu</Link> ili na{' '}
                <a href={`mailto:${PAYMENT_SUPPORT_EMAIL}`} className="text-gold-300 hover:text-gold-200">{PAYMENT_SUPPORT_EMAIL}</a>.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-neutral-600">
          <LockKeyhole size={13} /> Bez kartičnog plaćanja. Podaci za uplatu ostaju prikazani samo na ovoj stranici.
        </div>
      </section>
    </div>
  );
}
