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
  Star,
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
import { reviewsService } from '../services/reviewsService';
import { getCheckoutPath } from '../lib/paymentProducts';
import { type Review } from '../types';

const formatUnits = (value = 0) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
const formatPercent = (value = 0) => `${value.toFixed(1)}%`;

export default function Home() {
  const [homepageData, setHomepageData] = useState<PublicHomepageData | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const [reviewForm, setReviewForm] = useState({ name: '', rating: 5, text: '' });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');
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
    void reviewsService.getApprovedReviews()
      .then(setReviews)
      .catch((error) => console.warn('Reviews load failed:', error));
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
  const canSubmitReview = Boolean(user);

  const handleReviewSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      setReviewMessage('Morate biti prijavljeni da biste poslali recenziju.');
      return;
    }

    const name = reviewForm.name.trim();
    const text = reviewForm.text.trim();
    if (!name || !text) {
      setReviewMessage('Unesite ime i tekst recenzije.');
      return;
    }

    setReviewSubmitting(true);
    setReviewMessage('');
    try {
      await reviewsService.submitReview({
        userId: user.uid || user.id,
        name,
        rating: reviewForm.rating,
        text,
      });
      setReviewForm({ name: '', rating: 5, text: '' });
      setReviewMessage('Hvala! Recenzija je poslata i čeka odobrenje administratora.');
    } catch (error) {
      console.error('Review submit failed:', error);
      setReviewMessage('Slanje recenzije trenutno nije uspelo. Pokušajte ponovo.');
    } finally {
      setReviewSubmitting(false);
    }
  };
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
      <section className="relative overflow-hidden border-b border-white/10 bg-[#050505] px-5 py-9 md:px-6 md:py-14">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,transparent,rgba(245,124,0,0.06))]" />
        <div className="pointer-events-none absolute right-0 top-0 h-[390px] w-full overflow-hidden md:h-[430px] md:w-[76%] lg:h-[470px] lg:w-[68%]">
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 }}
            className="absolute inset-0"
          >
            <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_76%_52%,rgba(245,124,0,0.48),transparent_38%)] blur-[30px] md:blur-[44px]" />
            {!heroImageFailed ? (
              <img
                src="/elite-football-hero.png"
                alt="Fudbalska lopta sa narandžastim svetlosnim efektom na stadionu"
                className="absolute inset-0 z-[1] h-full w-full object-cover object-[67%_center] opacity-[0.85] md:opacity-100 lg:object-center"
                onError={() => setHeroImageFailed(true)}
              />
            ) : (
              <div className="absolute inset-y-0 right-0 flex w-[72%] items-center justify-center">
                <div className="absolute h-64 w-64 rounded-full bg-gold-500/30 blur-[76px] md:h-96 md:w-96" />
                <div className="relative flex h-44 w-44 items-center justify-center rounded-full border-4 border-gold-300/65 bg-black/75 text-center font-display text-xl font-black uppercase tracking-[0.2em] text-gold-200 shadow-[0_0_68px_rgba(245,124,0,0.6)] md:h-64 md:w-64 md:text-3xl">
                  Elite<br />Tips
                </div>
              </div>
            )}
          </motion.div>
          <div
            className="absolute inset-0 z-[2] bg-[linear-gradient(90deg,#050505_0%,rgba(5,5,5,0.72)_26%,rgba(5,5,5,0.34)_52%,rgba(5,5,5,0.02)_100%)] md:bg-[linear-gradient(90deg,#050505_0%,rgba(5,5,5,0.82)_12%,rgba(5,5,5,0.38)_34%,rgba(5,5,5,0.00)_78%)]"
            style={{ backgroundColor: 'transparent' }}
          />
          <div
            className="absolute inset-x-0 bottom-0 z-[2] h-24 bg-[linear-gradient(180deg,transparent,rgba(5,5,5,0.84))]"
            style={{ backgroundColor: 'transparent' }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl">
          <div className="min-h-[390px] md:min-h-[430px] lg:min-h-[470px]">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 max-w-2xl pt-4 md:pt-10 lg:pt-14">
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

          </div>

          <div className="overflow-hidden rounded-xl border border-white/15 bg-black/65 backdrop-blur-md">
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
            title="Elite tiket"
            description="Premium tiket sa većom kvotom i ciljem većeg profita."
            price="15€"
            tone="vip"
            features={['2–6 mečeva', 'Veća kvota', 'Premium analiza']}
            buttonLabel="Kupi tiket"
            target={getCheckoutPath('vip-ticket-day')}
            sectionId="elite-ticket"
          />
          <DailyPickCard
            title="Safe pick"
            description="Stabilniji predlog sa fokusom na veću prolaznost."
            price="10€"
            tone="safe"
            badge="Popularno"
            features={['Singl, dubl ili manji kombo', 'Kvota 1.50–3.00', 'Fokus na prolaznost']}
            buttonLabel="Kupi pick"
            target={getCheckoutPath('safe-pick-day')}
            sectionId="safe-pick"
          />
          <aside className="grid content-center gap-6 rounded-xl border border-white/10 bg-black/55 p-5">
            <CompactInfoCard icon={ShoppingCart} title="Kupovina bez pretplate" text="Odmah dobijaš tiket" />
            <CompactInfoCard icon={Clock3} title="Dostupno svakog dana" text="Objava ujutru" />
            <CompactInfoCard icon={UserRound} title="Pogodno za sve igrače" text="Početnike i iskusne" />
          </aside>
        </div>
      </section>

      <section className="px-5 py-5 md:px-6">
        <div className="mx-auto max-w-7xl rounded-xl border border-white/10 bg-black/45 p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-gold-400">Najbolje od nas</p>
              <h2 className="mt-1 font-display text-2xl font-black uppercase text-neutral-100">Elite tiket i Safe pick</h2>
            </div>
            <Link to="/history" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-300 transition hover:border-gold-500/40 hover:text-gold-300">
              Vidi istoriju <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <article className="rounded-xl border border-gold-500/25 bg-gradient-to-br from-gold-500/10 via-black/45 to-black p-5">
              <div className="mb-3 flex items-center gap-3">
                <Target className="text-gold-400" size={24} />
                <h3 className="font-display text-xl font-black uppercase text-gold-100">ELITE TIKET</h3>
              </div>
              <p className="text-sm leading-6 text-neutral-400">Premium tiket sa 2 do 6 meceva, vecom ukupnom kvotom i fokusom na veci profit.</p>
              <Link to="/#elite-ticket" className="mt-5 inline-flex rounded-lg bg-gold-500 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black transition hover:bg-gold-400">
                Pogledaj Elite tiket
              </Link>
            </article>
            <article className="rounded-xl border border-blue-400/25 bg-gradient-to-br from-blue-500/10 via-black/45 to-black p-5">
              <div className="mb-3 flex items-center gap-3">
                <ShieldCheck className="text-blue-300" size={24} />
                <h3 className="font-display text-xl font-black uppercase text-blue-100">SAFE PICK</h3>
              </div>
              <p className="text-sm leading-6 text-neutral-400">Singl, dubl ili manji kombo sa kvotom uglavnom 1.50 do 3.00 i fokusom na prolaznost.</p>
              <Link to="/#safe-pick" className="mt-5 inline-flex rounded-lg bg-blue-500 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-400">
                Pogledaj Safe pick
              </Link>
            </article>
          </div>
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
        <div className="mx-auto max-w-7xl rounded-xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_34%),rgba(0,0,0,0.58)] p-4 md:p-6">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-gold-400">Utisci korisnika</p>
              <h2 className="mt-1 font-display text-2xl font-black uppercase text-white md:text-3xl">Recenzije zajednice</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                Odobrene recenzije korisnika koji prate Elite Tips pristup, javnu istoriju i disciplinovanu statistiku.
              </p>
            </div>
            {!canSubmitReview && (
              <Link to="/login" className="inline-flex items-center justify-center rounded-lg border border-gold-500/25 bg-gold-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gold-300 transition hover:bg-gold-500/20">
                Prijavi se za recenziju
              </Link>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {reviews.slice(0, 16).map((review) => (
              <article key={review.id} className="rounded-xl border border-white/10 bg-[#111]/85 p-4 transition hover:-translate-y-0.5 hover:border-gold-500/25 hover:bg-[#151515]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-display text-lg font-black text-white">{review.name}</h3>
                  <span className="text-[10px] font-bold text-neutral-500">{new Date(review.createdAt).toLocaleDateString('sr-RS')}</span>
                </div>
                <div className="mb-3 flex gap-1 text-gold-400">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} size={15} fill="currentColor" className={index < review.rating ? 'opacity-100' : 'opacity-25'} />
                  ))}
                </div>
                <p className="text-sm leading-6 text-neutral-400">"{review.text}"</p>
              </article>
            ))}
          </div>

          <form onSubmit={handleReviewSubmit} className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-black/40 p-4 md:grid-cols-[1fr_150px_2fr_auto] md:items-end">
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Ime</span>
              <input
                value={reviewForm.name}
                onChange={(event) => setReviewForm((current) => ({ ...current, name: event.target.value }))}
                disabled={!canSubmitReview || reviewSubmitting}
                className="w-full rounded-lg border border-white/10 bg-black/45 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-gold-500/50 disabled:opacity-50"
                placeholder="Vaše ime"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Ocena</span>
              <select
                value={reviewForm.rating}
                onChange={(event) => setReviewForm((current) => ({ ...current, rating: Number(event.target.value) }))}
                disabled={!canSubmitReview || reviewSubmitting}
                className="w-full rounded-lg border border-white/10 bg-black/45 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-gold-500/50 disabled:opacity-50"
              >
                {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} zvezdica</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Recenzija</span>
              <input
                value={reviewForm.text}
                onChange={(event) => setReviewForm((current) => ({ ...current, text: event.target.value }))}
                disabled={!canSubmitReview || reviewSubmitting}
                className="w-full rounded-lg border border-white/10 bg-black/45 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-gold-500/50 disabled:opacity-50"
                placeholder={canSubmitReview ? 'Napišite kratak utisak...' : 'Prijavite se da pošaljete recenziju'}
              />
            </label>
            <button
              type="submit"
              disabled={!canSubmitReview || reviewSubmitting}
              className="rounded-lg bg-gold-500 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-black transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {reviewSubmitting ? 'Slanje...' : 'Pošalji'}
            </button>
          </form>
          {reviewMessage && <p className="mt-3 text-sm font-semibold text-gold-200">{reviewMessage}</p>}
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
