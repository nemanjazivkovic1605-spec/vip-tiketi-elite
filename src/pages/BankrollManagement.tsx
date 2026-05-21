import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Calculator,
  CheckCircle2,
  Coins,
  LineChart,
  PieChart,
  ShieldCheck,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react';

const unitMultipliers = [1, 2, 3, 5, 10];
const exampleBankroll = 200;

const stakeCategories = [
  {
    title: '1/10 - 3/10 Units',
    text: 'Manji ulog, veći rizik, combo/high odds tipovi.',
  },
  {
    title: '4/10 - 6/10 Units',
    text: 'Standardni VIP ulozi, singlovi i dublovi sa jakom analizom.',
  },
  {
    title: '7/10 - 10/10 Units',
    text: 'Najveći nivo poverenja, retko se koristi, samo kada se poklope statistika, forma, motivacija, povrede i value kvota.',
  },
];

const comparisonCards = [
  {
    title: 'Amater',
    icon: XCircle,
    tone: 'red',
    items: ['Juri minus', 'Duplira ulog', 'Paniči nakon pada', 'Igra iz emocija', 'Nema plan'],
  },
  {
    title: 'Profesionalac',
    icon: CheckCircle2,
    tone: 'gold',
    items: ['Prati sistem', 'Poštuje unit ulog', 'Razume variance/bad run', 'Gleda ROI i yield', 'Razmišlja dugoročno'],
  },
];

const metricCards = [
  {
    title: 'ROI',
    icon: PieChart,
    text: 'Pokazuje povraćaj investicije u odnosu na uloženi kapital. Bitan je za procenu efikasnosti sistema.',
  },
  {
    title: 'Yield',
    icon: TrendingUp,
    text: 'Meri čist profit u odnosu na ukupan ulog. Kod tipstera je jedna od najvažnijih dugoročnih metrika.',
  },
  {
    title: 'Hit Rate',
    icon: Target,
    text: 'Procenat pogođenih tiketa. Nije dovoljan sam po sebi, jer zavisi od prosečne kvote.',
  },
  {
    title: 'Average Odds',
    icon: BarChart3,
    text: 'Prosečna kvota svih odigranih tiketa. Pomaže da se pravilno tumači hit rate i profitabilnost.',
  },
];

const formatEuro = (value: number) =>
  new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);

export default function BankrollManagement() {
  const [bankrollInput, setBankrollInput] = useState(String(exampleBankroll));
  const [openComparison, setOpenComparison] = useState('Profesionalac');
  const [openMetric, setOpenMetric] = useState('Yield');

  const bankroll = useMemo(() => {
    const value = Number(bankrollInput.replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : exampleBankroll;
  }, [bankrollInput]);

  const oneUnit = bankroll * 0.01;
  const rawValue = Number(bankrollInput.replace(',', '.'));
  const isExample = bankrollInput.trim() === '' || !Number.isFinite(rawValue) || rawValue <= 0;

  return (
    <div className="min-h-screen bg-neutral-950 px-6 py-14 md:py-20">
      <div className="mx-auto max-w-6xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neutral-500 transition-colors hover:text-gold-400"
        >
          <ArrowLeft size={15} />
          Nazad na početnu
        </Link>

        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-black px-6 py-10 shadow-2xl shadow-black/40 md:px-10 md:py-14">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500 to-transparent" />
          <div className="absolute -right-16 top-0 h-56 w-56 rounded-full bg-gold-500/10 blur-3xl" />

          <div className="relative max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold-500/25 bg-gold-500/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-gold-400">
              <ShieldCheck size={15} />
              Bankroll Management
            </div>
            <h1 className="font-display text-4xl font-black tracking-tight text-white md:text-6xl">
              Bankroll Management
            </h1>
            <p className="mt-4 font-display text-xl font-black text-gold-400 md:text-2xl">
              Disciplina. Kontrola rizika. Dugoročni profit.
            </p>
            <p className="mt-6 max-w-3xl text-base leading-8 text-neutral-400 md:text-lg">
              Preko 95% igrača dugoročno gubi novac u kladionici. Ne zato što ne znaju sport, već zato što nemaju sistem.
            </p>
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
            <h2 className="font-display text-2xl font-black text-white">Klađenje kao visokorizična investicija</h2>
            <p className="mt-4 text-sm leading-7 text-neutral-400 md:text-base">
              Mi klađenje ne gledamo kao kocku, već kao visokorizičnu investiciju gde su disciplina, value, ROI, yield i dugoročni profit najvažniji. Cilj nije jedan ludački tiket, već stabilan mesečni profit kroz kontrolisan sistem.
            </p>
          </div>

          <div className="rounded-3xl border border-gold-500/20 bg-gold-500/10 p-6 md:p-8">
            <h2 className="font-display text-2xl font-black text-white">Šta je bankroll?</h2>
            <p className="mt-4 text-sm leading-7 text-neutral-300 md:text-base">
              Bankroll je novac odvojen isključivo za klađenje. To nije novac za račune, hranu ili svakodnevni život. Ne dopunjava se u afektu, ne koristi se za jurenje gubitaka i tretira se kao poslovni/investicioni kapital.
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-black p-6 md:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
            <div>
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-500/30 bg-gold-500/10 text-gold-400 shadow-[0_0_26px_rgba(245,124,0,0.16)]">
                <Coins size={22} />
              </div>
              <h2 className="font-display text-3xl font-black text-white">Unit sistem</h2>
              <p className="mt-4 text-sm leading-7 text-neutral-400 md:text-base">
                1 Unit = 1% ukupne banke. Zato ne govorimo svakom korisniku “uloži 50€”, jer neko ima banku 100€, a neko 10.000€.
              </p>
              <div className="mt-6 grid gap-3 text-sm font-bold text-neutral-300">
                {[
                  'Banka 100€ → 1 Unit = 1€',
                  'Banka 500€ → 1 Unit = 5€',
                  'Banka 1000€ → 1 Unit = 10€',
                ].map((example) => (
                  <div key={example} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    {example}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-gold-500/20 bg-gradient-to-br from-white/[0.06] via-black to-gold-500/[0.04] p-5 shadow-2xl shadow-black/30 md:p-6">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-500/30 bg-gold-500/10 text-gold-400 shadow-[0_0_26px_rgba(245,124,0,0.16)]">
                <Calculator size={22} />
              </div>
              <h3 className="font-display text-2xl font-black text-white">Izračunajte vrednost svog Unit-a</h3>
              <p className="mt-3 text-sm leading-7 text-neutral-400">
                Unesite iznos svoje banke i kalkulator će automatski prikazati preporučene uloge po Unit sistemu.
              </p>

              <label className="mt-6 block">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500">
                  Iznos banke
                </span>
                <div className="flex overflow-hidden rounded-2xl border border-white/10 bg-black/45 transition-colors focus-within:border-gold-500/50">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    value={bankrollInput}
                    onChange={(event) => setBankrollInput(event.target.value)}
                    placeholder="200"
                    className="min-w-0 flex-1 bg-transparent px-4 py-4 text-lg font-bold text-white outline-none placeholder:text-neutral-700"
                  />
                  <div className="flex items-center border-l border-white/10 px-4 text-sm font-black uppercase tracking-widest text-gold-400">
                    EUR
                  </div>
                </div>
              </label>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                  {isExample ? 'Primer obračuna' : 'Trenutni obračun'}
                </p>
                <p className="mt-1 text-sm font-bold text-neutral-200">
                  1 Unit = 1% banke = {formatEuro(oneUnit)}
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {unitMultipliers.map((units) => (
                  <div key={units} className="rounded-2xl border border-white/10 bg-black/45 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">{units} Unit{units > 1 ? 's' : ''}</p>
                    <p className="mt-2 font-display text-2xl font-black text-gold-300">{formatEuro(oneUnit * units)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-3xl font-black text-white">Kategorije uloga</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {stakeCategories.map((category) => (
              <div key={category.title} className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 transition-colors hover:border-gold-500/40 hover:bg-gold-500/[0.04]">
                <h3 className="font-display text-xl font-black text-gold-400">{category.title}</h3>
                <p className="mt-4 text-sm leading-7 text-neutral-400">{category.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-3xl font-black text-white">Amater vs Profesionalac</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {comparisonCards.map(({ title, icon: Icon, tone, items }) => {
              const isOpen = openComparison === title;
              return (
                <button
                  key={title}
                  type="button"
                  onClick={() => setOpenComparison(isOpen ? '' : title)}
                  className={`rounded-3xl border p-6 text-left transition-all ${
                    isOpen
                      ? tone === 'gold'
                        ? 'border-gold-500/50 bg-gold-500/10 shadow-lg shadow-gold-500/10'
                        : 'border-red-500/30 bg-red-500/10'
                      : 'border-white/10 bg-white/[0.035] hover:border-gold-500/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={tone === 'gold' ? 'text-gold-500' : 'text-red-400'} size={24} />
                    <h3 className="font-display text-2xl font-black text-white">{title}</h3>
                  </div>
                  {isOpen && (
                    <ul className="mt-5 space-y-3 text-sm font-bold text-neutral-300">
                      {items.map((item) => (
                        <li key={item} className="flex gap-3">
                          <span className={`mt-2 h-1.5 w-1.5 rounded-full ${tone === 'gold' ? 'bg-gold-500' : 'bg-red-400'}`} />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <h2 className="font-display text-3xl font-black text-white">Long term profit</h2>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-neutral-400 md:text-base">
            Jedan tiket ne pravi profit. Sistem pravi profit. Profit se meri kroz mesec, kvartal i sezonu, a ROI, Yield, Hit Rate i Average Odds su važniji od jednog dana.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {metricCards.map(({ title, icon: Icon, text }) => {
              const isOpen = openMetric === title;
              return (
                <button
                  key={title}
                  type="button"
                  onClick={() => setOpenMetric(isOpen ? '' : title)}
                  className={`rounded-2xl border p-5 text-left transition-all ${
                    isOpen ? 'border-gold-500/50 bg-gold-500/10 shadow-lg shadow-gold-500/10' : 'border-white/10 bg-black/35 hover:border-gold-500/40'
                  }`}
                >
                  <Icon size={22} className="text-gold-500" />
                  <h3 className="mt-4 font-display text-xl font-black text-white">{title}</h3>
                  {isOpen && <p className="mt-3 text-sm leading-6 text-neutral-400">{text}</p>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-gold-500/20 bg-gold-500/10 p-6 md:p-8">
            <LineChart size={30} className="text-gold-500" />
            <h2 className="mt-5 font-display text-3xl font-black text-white">Compound growth</h2>
            <p className="mt-4 text-sm leading-7 text-neutral-300 md:text-base">
              Kada bankroll raste, raste i vrednost unit-a. Ako je banka 500€, 1 Unit je 5€. Ako poraste na 600€, 1 Unit je 6€.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['500€', '1u = 5€'],
              ['600€', '1u = 6€'],
              ['750€', '1u = 7,50€'],
              ['900€', '1u = 9€'],
            ].map(([bank, unit]) => (
              <div key={bank} className="rounded-3xl border border-white/10 bg-black/45 p-5 text-center">
                <p className="font-display text-2xl font-black text-white">{bank}</p>
                <p className="mt-2 text-xs font-black uppercase tracking-widest text-gold-400">{unit}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-black p-6 text-center md:p-10">
          <h2 className="font-display text-3xl font-black text-white">Naša filozofija</h2>
          <p className="mx-auto mt-5 max-w-4xl text-sm leading-7 text-neutral-400 md:text-base">
            Mi ne prodajemo sigurne dojave, nameštene utakmice i lažna obećanja. Mi nudimo analizu, statistiku, value betting, disciplinu i profesionalno upravljanje bankom.
          </p>
          <p className="mx-auto mt-8 max-w-3xl font-display text-2xl font-black text-gold-400 md:text-4xl">
            “Kladionica ne uništava igrače lošim kvotama. Uništava ih nedisciplina.”
          </p>
          <Link
            to="/register"
            className="mt-8 inline-flex items-center gap-3 rounded-2xl bg-gold-500 px-8 py-4 text-sm font-black uppercase tracking-widest text-black shadow-xl shadow-gold-500/20 transition-all hover:bg-gold-600"
          >
            Pogledaj VIP planove
            <ArrowRight size={18} />
          </Link>
        </section>
      </div>
    </div>
  );
}
