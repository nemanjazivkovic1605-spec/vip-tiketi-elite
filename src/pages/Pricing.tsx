import React from 'react';
import { ArrowRight, Crown, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { VIP_PACKAGES } from '../lib/demoData';
import { useAuth } from '../hooks/useAuth';
import { getCheckoutPath, type PaymentProductId } from '../lib/paymentProducts';

const vipPackages = VIP_PACKAGES.filter((plan) => plan.id !== 'free');
const checkoutProducts: Record<string, PaymentProductId> = {
  silver_7: 'silver-7',
  gold_30: 'gold-30',
  elite_90: 'elite-90',
};

export default function Pricing() {
  const { isApproved } = useAuth();

  return (
    <div className="px-6 pb-24 pt-10">
      <section className="mx-auto max-w-7xl">
        <div className="mb-12 max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gold-400">
            <Crown size={14} /> VIP članstvo
          </div>
          <h1 className="font-display text-4xl font-black md:text-5xl">Izaberite VIP pristup</h1>
          <p className="mt-4 max-w-2xl leading-7 text-neutral-400">
            Vaš FREE nalog ostaje aktivan. Izaberite paket, izvršite uplatu na tekući račun i pošaljite dokaz. VIP sadržaj se otključava nakon ručne potvrde.
          </p>
        </div>

        {isApproved && (
          <div className="mb-8 flex items-start gap-3 rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-300">
            <ShieldCheck className="mt-0.5 shrink-0" size={18} />
            VIP članstvo je već aktivno na vašem nalogu.
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          {vipPackages.map((pkg) => {
            const checkoutProduct = checkoutProducts[pkg.id];
            return (
              <article
                key={pkg.id}
                className={`glass relative flex flex-col rounded-[2rem] p-7 ${
                  pkg.isPopular ? 'border-gold-500/45 shadow-[0_0_36px_rgba(245,158,11,0.14)]' : 'border-white/5'
                }`}
              >
                {pkg.isPopular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-gold-500 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-black">
                    Najpopularnije
                  </div>
                )}
                <h2 className="mb-2 text-xl font-black text-neutral-200">{pkg.name}</h2>
                <div className="mb-7 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-black">€{pkg.price}</span>
                  <span className="text-sm text-neutral-500">/ {pkg.durationDays} dana</span>
                </div>
                <div className="mb-8 flex-1 space-y-3">
                  {pkg.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-3 text-sm text-neutral-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />
                      {feature}
                    </div>
                  ))}
                </div>
                <Link
                  to={getCheckoutPath(checkoutProduct)}
                  className={`flex items-center justify-center gap-2 rounded-2xl py-4 font-black transition-all ${
                    pkg.isPopular ? 'bg-gold-500 text-black hover:bg-gold-400' : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {isApproved ? 'Produži članstvo' : 'Podaci za uplatu'}
                  <ArrowRight size={18} />
                </Link>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
