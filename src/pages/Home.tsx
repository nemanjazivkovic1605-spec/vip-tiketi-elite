import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BarChart3,
  Clock3,
  Coins,
  Headphones,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Target,
  TrendingUp,
  UserRound,
  UsersRound,
  Zap,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import {
  CompactInfoCard,
  DailyPickCard,
  FeatureCard,
  HistoryLink,
  PricingCard,
  RecentTicketsTable,
  SecondaryCta,
  StatCard,
  type PricingCardProps,
} from '../components/home/HomeLandingComponents';
import { useAuth } from '../hooks/useAuth';
import { mockTipsService, type PublicHomepageData } from '../services/mockTips';
import { getCheckoutPath } from '../lib/paymentProducts';

const formatUnits = (value = 0) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
const formatPercent = (value = 0) => `${value.toFixed(1)}%`;

export default function Home() {
  const [homepageData, setHomepageData] = useState<PublicHomepageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const { user, isVerified } = useAuth();
  const { hash } = useLocation();

  useEffect(() => {
    const fetchHomepageData = async () => {
      try {
        setHomepageData(await mockTipsService.getPublicHomepageData());
        setLoadError('');
      } catch (error) {
        console.error('Homepage public data load failed:', error);
        setLoadError('Statistika trenutno nije dostupna.');
      } finally {
        setLoading(false);
      }
    };

    void fetchHomepageData();
    return mockTipsService.subscribePublicStats(() => void fetchHomepageData());
  }, []);

  useEffect(() => {
    if (!hash) return;
    const animationFrame = requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [hash]);

  const stats = homepageData?.stats;
  const hasPublicStats = Boolean(stats?.completedCount);
  const unlockTarget = user && isVerified ? '/daily-tips' : '/register';
  const hasVerifiedAccount = Boolean(user && isVerified);
  const pricingCards: PricingCardProps[] = [
    {
      name: 'FREE',
      description: 'Free tipovi za verifikovane korisnike',
      price: 'BESPLATNO',
      features: ['Pristup FREE tipovima'],
      tone: 'free',
      buttonLabel: hasVerifiedAccount ? 'Pogledaj tipove' : 'Registruj se',
      target: hasVerifiedAccount ? '/daily-tips' : '/register',
    },
    {
      name: 'SILVER',
      description: 'Osnovni VIP pristup',
      price: '15€',
      duration: '7 dana',
      features: ['VIP tipovi', 'Pristup istoriji', 'Podrška'],
      tone: 'silver',
      buttonLabel: 'Izaberi paket',
      target: getCheckoutPath('silver-7'),
    },
    {
      name: 'GOLD',
      description: 'Najbolji odnos cene i kvaliteta',
      price: '40€',
      duration: '30 dana',
      features: ['VIP tipovi', 'Pristup istoriji', 'Prioritetna podrška', 'Dodatni saveti'],
      tone: 'gold',
      buttonLabel: 'Izaberi paket',
      target: getCheckoutPath('gold-30'),
      popular: true,
    },
    {
      name: 'ELITE',
      description: 'Najisplativiji paket',
      price: '100€',
      duration: '90 dana',
      features: ['VIP tipovi', 'Pristup istoriji', 'Prioritetna podrška', 'Dodatni saveti', 'Ekskluzivni tipovi'],
      tone: 'elite',
      buttonLabel: 'Izaberi paket',
      target: getCheckoutPath('elite-90'),
    },
  ];

  return (
    <div className="overflow-hidden bg-[#050505]">
      <section
        className="relative min-h-[560px] overflow-hidden border-b border-white/10 bg-cover bg-right px-5 py-11 md:min-h-[610px] md:px-6 md:py-16"
        style={{ backgroundImage: "url('/elite-football-hero.png')" }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.98)_0%,rgba(0,0,0,0.9)_58%,rgba(0,0,0,0.42)_100%)] md:bg-[linear-gradient(90deg,rgba(0,0,0,0.98)_0%,rgba(0,0,0,0.92)_34%,rgba(0,0,0,0.28)_56%,rgba(0,0,0,0)_82%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.22))]" />

        <div className="relative mx-auto max-w-7xl">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-gold-400">Elite sports analytics</p>
              <span className="rounded border border-gold-500/25 bg-black/45 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-gold-200">18+ odgovorno</span>
            </div>
            <h1 className="max-w-xl font-display text-5xl font-black leading-[0.95] text-white md:text-7xl">
              Dominiraj <span className="text-gold-400">sportskim kladionicama</span>
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-neutral-300 md:text-base">
              Free tipovi za verifikovane korisnike i VIP tipovi za ozbiljne igrače koji žele dugoročan profit.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to={unlockTarget}
                className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-5 py-3 text-xs font-black uppercase tracking-wide text-black shadow-[0_0_22px_rgba(245,124,0,0.3)] transition-all hover:bg-gold-400"
              >
                Otključaj tipove <ArrowRight size={17} />
              </Link>
              <SecondaryCta to="/stats">Pogledaj statistiku</SecondaryCta>
            </div>
          </motion.div>

          <div className="mt-12 overflow-hidden rounded-xl border border-white/15 bg-black/65 backdrop-blur-md">
            <div className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
              <StatCard icon={Target} label="Prolaznost" value={loading ? '...' : hasPublicStats ? formatPercent(stats?.hitRate) : '—'} />
              <StatCard icon={Coins} label="Profit (jedinice)" value={loading ? '...' : hasPublicStats ? formatUnits(stats?.unitsProfit) : '—'} />
              <StatCard icon={BarChart3} label="ROI" value={loading ? '...' : hasPublicStats ? formatPercent(stats?.roi) : '—'} />
              <StatCard icon={ReceiptText} label="Završeni tiketi" value={loading ? '...' : hasPublicStats ? `+${stats?.completedCount ?? 0}` : '—'} />
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-4 md:px-6">
        <div className="mx-auto grid max-w-7xl overflow-hidden rounded-xl border border-white/10 bg-black/55 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard icon={ShieldCheck} title="Provereni tipovi" text="Visoka prolaznost na duge staze" />
          <FeatureCard icon={ReceiptText} title="Transparentnost" text="Javna istorija svih završenih tiketa" />
          <FeatureCard icon={UserRound} title="Stručne analize" text="Analize mečeva od našeg tima" />
          <FeatureCard icon={LockKeyhole} title="Sigurno i fer" text="Zaštita korisnika na prvom mestu" />
        </div>
      </section>

      <section className="px-5 py-4 md:px-6">
        <div className="mx-auto grid max-w-7xl gap-3 lg:grid-cols-[1fr_1fr_0.62fr]">
          <DailyPickCard
            title="VIP tiket dana"
            description="Pažljivo odabran tiket sa većom kvotom."
            price="15€"
            tone="vip"
            features={['2–6 mečeva (dubl, tripl ili kombo)', 'Kvota 2.50+', 'Objava svaki dan']}
            buttonLabel="Kupi tiket"
            target={getCheckoutPath('vip-ticket-day')}
            sectionId="vip-ticket-day"
          />
          <DailyPickCard
            title="Safe pick dana"
            description="Najsigurniji dnevni predlog."
            price="10€"
            tone="safe"
            badge="Popularno"
            features={['1–3 meča (singl, dubl ili kombo)', 'Kvota 1.50–3.00', 'Objava svaki dan']}
            buttonLabel="Kupi pick"
            target={getCheckoutPath('safe-pick-day')}
            sectionId="safe-pick-day"
          />
          <aside className="grid content-center gap-6 rounded-xl border border-white/10 bg-black/55 p-5">
            <CompactInfoCard icon={ShoppingCart} title="Kupovina bez pretplate" text="Odmah dobijaš tiket" />
            <CompactInfoCard icon={Clock3} title="Dostupno svakog dana" text="Objava ujutru" />
            <CompactInfoCard icon={UserRound} title="Pogodno za sve igrače" text="Početnike i iskusne" />
          </aside>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-28 px-5 py-7 md:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 text-center">
            <h2 className="font-display text-3xl font-black uppercase text-neutral-100">Paketi pretplate</h2>
            <p className="mt-1 text-sm text-neutral-400">Izaberi paket koji odgovara tvojim ciljevima.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {pricingCards.map((card) => <PricingCard key={card.name} {...card} />)}
          </div>
        </div>
      </section>

      <section className="px-5 pb-5 md:px-6">
        <div className="mx-auto max-w-7xl rounded-xl border border-white/10 bg-black/45 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
            <h2 className="font-display text-xl font-black uppercase text-neutral-100">Poslednjih 5 završenih tiketa</h2>
            <HistoryLink />
          </div>
          {loadError && !homepageData ? (
            <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-8 text-center text-sm text-neutral-500">{loadError}</div>
          ) : loading ? (
            <div className="h-52 animate-pulse rounded-xl border border-white/10 bg-white/[0.035]" />
          ) : (
            <RecentTicketsTable tips={homepageData?.recentTips ?? []} />
          )}
        </div>
      </section>

      <section className="px-5 pb-8 md:px-6">
        <div className="mx-auto grid max-w-7xl overflow-hidden rounded-xl border border-white/10 bg-black/55 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard icon={Zap} title="Pravovremeni tipovi" text="Tipovi objavljeni na vreme, svaki dan" />
          <FeatureCard icon={ShieldCheck} title="100% transparentno" text="Nema skrivanja, svi rezultati su javni" />
          <FeatureCard icon={Headphones} title="Brza podrška" text="Tu smo za tebe kada je važno" />
          <FeatureCard icon={UsersRound} title="Zajednica igrača" text="Pridruži se hiljadama zadovoljnih korisnika" />
        </div>
      </section>
    </div>
  );
}
