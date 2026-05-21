import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Ambulance,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Brain,
  CheckCircle2,
  CloudSun,
  LineChart,
  PieChart,
  ShieldCheck,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react';

type ExpandableCardProps = {
  key?: React.Key;
  title: string;
  icon: React.ElementType;
  text: string;
  details: string[];
  isOpen: boolean;
  onToggle: () => void;
};

const pillars = [
  {
    title: 'Napredna statistika i xG modeli',
    icon: BarChart3,
    text: 'Ne gledamo samo poslednjih pet utakmica. Analiziramo napredne statističke parametre poput xG (Expected Goals), xGA, šansi iz opasnih zona, pressing intenziteta i efikasnosti napadačkih tranzicija. Statistika često otkriva ono što rezultat skriva.',
    details: ['xG objašnjenje', 'xGA objašnjenje', 'Possession', 'Shot Conversion'],
  },
  {
    title: 'Izostanci, povrede i suspenzije',
    icon: Ambulance,
    text: 'Informacija u pravom trenutku pravi ogromnu razliku. Pratimo povrede, suspenzije, promene trenera i zvanične izjave iz klubova pre nego što tržište odreaguje. Izostanak ključnog igrača često menja kompletnu vrednost kvote.',
    details: ['First goalkeeper impact', 'Key playmaker impact', 'Squad rotation', 'Fatigue after European matches'],
  },
  {
    title: 'Kretanje kvota i Smart Money',
    icon: TrendingUp,
    text: 'Pratimo kretanje kvota i ponašanje tržišta na profesionalnim kladioničarskim berzama poput Pinnacle i Betfair. Kada profesionalni novac ulazi na određeni ishod, tržište ostavlja trag.',
    details: ['Smart Money', 'Closing Line Value', 'Market Volume', 'Sharp vs Public Money'],
  },
  {
    title: 'Motivacija i spoljašnji faktori',
    icon: Brain,
    text: 'Statistika nije dovoljna bez konteksta. Analiziramo motivaciju timova, raspored utakmica, vremenske uslove, putovanja i psihološki momentum. Detalji često odlučuju utakmice.',
    details: ['Weather', 'Travel fatigue', 'Derby pressure', 'Champions League rotation', 'Motivation analysis'],
  },
];

const metrics = [
  { title: 'ROI', icon: PieChart, text: 'Povraćaj investicije i signal koliko sistem vraća u odnosu na uloženu banku.' },
  { title: 'Yield', icon: LineChart, text: 'Čist profit u odnosu na ukupno uložene units. Ključna metrika za ozbiljne tipstere.' },
  { title: 'Hit Rate', icon: Target, text: 'Procenat pogođenih tiketa, ali se uvek čita zajedno sa prosečnom kvotom.' },
  { title: 'Average Odds', icon: BarChart3, text: 'Prosečna kvota pokazuje profil rizika i pomaže da se realno tumači hit rate.' },
  { title: 'CLV', icon: Activity, text: 'Closing Line Value pokazuje da li smo uhvatili bolju kvotu od završne tržišne linije.' },
];

const stakingLevels = [
  { title: '1/10', text: 'Niži confidence, veći rizik, zaštita banke na volatilnim tipovima.' },
  { title: '3/10', text: 'Kontrolisan ulog za value spotove sa jasnim ali ne maksimalnim edge-om.' },
  { title: '5/10', text: 'Standardni VIP nivo kada se statistika, forma i tržište dobro poklapaju.' },
  { title: '10/10', text: 'Retko, samo za najviši nivo poverenja uz strogu bankroll kontrolu.' },
];

function ExpandableCard({ title, icon: Icon, text, details, isOpen, onToggle }: ExpandableCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-3xl border p-6 text-left transition-all duration-300 ${
        isOpen
          ? 'border-gold-500/50 bg-gold-500/10 shadow-xl shadow-gold-500/10'
          : 'border-white/10 bg-white/[0.035] hover:border-gold-500/40 hover:bg-gold-500/[0.04]'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gold-500/30 bg-gold-500/10 text-gold-400">
          <Icon size={22} />
        </div>
        <div>
          <h3 className="font-display text-xl font-black text-white md:text-2xl">{title}</h3>
          <p className="mt-4 text-sm leading-7 text-neutral-400">{text}</p>
        </div>
      </div>
      {isOpen && (
        <div className="mt-5 grid gap-2 border-t border-white/10 pt-5 sm:grid-cols-2">
          {details.map((detail) => (
            <div key={detail} className="rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-xs font-black uppercase tracking-widest text-neutral-300">
              {detail}
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

export default function DailyAnalysis() {
  const [openPillar, setOpenPillar] = useState(pillars[0].title);
  const [openMetric, setOpenMetric] = useState('CLV');

  return (
    <div className="min-h-screen bg-neutral-950 px-6 py-14 md:py-20">
      <div className="mx-auto max-w-7xl">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neutral-500 transition-colors hover:text-gold-400">
          <ArrowLeft size={15} />
          Nazad na početnu
        </Link>

        <div className="sticky top-20 z-20 mb-6 hidden rounded-2xl border border-white/10 bg-neutral-950/80 px-4 py-3 backdrop-blur-xl lg:flex lg:items-center lg:justify-between">
          {[
            ['Proces', '#proces'],
            ['Stubovi', '#stubovi'],
            ['Value', '#value'],
            ['Staking', '#staking'],
            ['Metrike', '#metrike'],
          ].map(([label, href]) => (
            <a key={href} href={href} className="text-[10px] font-black uppercase tracking-widest text-neutral-500 transition-colors hover:text-gold-400">
              {label}
            </a>
          ))}
        </div>

        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-black px-6 py-10 shadow-2xl shadow-black/40 md:px-10 md:py-16">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500 to-transparent" />
          <div className="absolute -right-16 top-0 h-64 w-64 rounded-full bg-gold-500/10 blur-3xl" />
          <div className="relative max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold-500/25 bg-gold-500/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-gold-400">
              <Activity size={15} />
              Premium Sports Analytics
            </div>
            <h1 className="font-display text-4xl font-black tracking-tight text-white md:text-6xl">Dnevna Analiza</h1>
            <p className="mt-4 font-display text-lg font-black text-gold-400 md:text-2xl">
              Premium Sports Analytics • Value Betting • Smart Money
            </p>
            <p className="mt-6 max-w-3xl text-base leading-8 text-neutral-400 md:text-lg">
              Za nas klađenje nije igra na sreću, već igra brojki, informacija i discipline. Svaki VIP tip koji objavimo rezultat je višesatnog istraživanja, analize tržišta i praćenja ključnih faktora koji utiču na utakmicu.
            </p>
            <div className="mt-8 inline-flex rounded-2xl border border-gold-500/25 bg-gold-500/10 px-5 py-4 text-sm font-black uppercase tracking-widest text-gold-300">
              Ne jurimo nasumične kvote. Tražimo VALUE.
            </div>
          </div>
        </section>

        <section id="proces" className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <h2 className="font-display text-3xl font-black text-white">Analiza pre osećaja</h2>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <p className="text-sm leading-8 text-neutral-400 md:text-base">
              Da biste dugoročno bili profitabilni u klađenju, nije dovoljno samo pratiti sport. Potrebno je razumeti tržište, psihologiju igrača, kretanje kvota, statistiku i motive timova.
            </p>
            <p className="text-sm leading-8 text-neutral-400 md:text-base">
              Naša analiza nije zasnovana na osećaju ili intuiciji. Svaki tip prolazi kroz višeslojni proces provere kako bismo pronašli value bet situacije — trenutke kada je realna verovatnoća događaja veća od one koju kladionica prikazuje kroz kvotu.
            </p>
          </div>
        </section>

        <section id="stubovi" className="mt-8">
          <h2 className="font-display text-3xl font-black text-white">Četiri stuba analize</h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {pillars.map((pillar) => (
              <ExpandableCard
                key={pillar.title}
                title={pillar.title}
                icon={pillar.icon}
                text={pillar.text}
                details={pillar.details}
                isOpen={openPillar === pillar.title}
                onToggle={() => setOpenPillar(openPillar === pillar.title ? '' : pillar.title)}
              />
            ))}
          </div>
        </section>

        <section id="value" className="mt-8 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-3xl border border-gold-500/20 bg-gold-500/10 p-6 md:p-8">
            <h2 className="font-display text-3xl font-black text-white">Šta je Value Bet?</h2>
            <p className="mt-4 text-sm leading-8 text-neutral-300 md:text-base">
              Value bet ne znači da će tip sigurno proći. Value znači da kvota koju kladionica nudi ima veću vrednost nego što realna verovatnoća događaja pokazuje. Dugoročni profit dolazi iz konstantnog pronalaženja value situacija.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black p-6 md:p-8">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Primer value situacije</p>
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 font-bold text-neutral-200">Realna šansa = 60%</div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 font-bold text-neutral-200">Kvota kladionice = 2.10</div>
              <div className="rounded-2xl border border-gold-500/30 bg-gold-500/10 p-4 font-display text-2xl font-black text-gold-300">To predstavlja VALUE.</div>
            </div>
          </div>
        </section>

        <section id="staking" className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="font-display text-3xl font-black text-white">Sistem uloga (Staking Plan)</h2>
              <p className="mt-4 max-w-4xl text-sm leading-8 text-neutral-400 md:text-base">
                Uz svaku VIP analizu dobijate i preporuku uloga kroz Unit sistem. Profesionalno klađenje nije potraga za sigurnim tiketom — već kontrola rizika i dugoročni profit.
              </p>
            </div>
            <Link to="/bankroll-management" className="inline-flex w-fit items-center gap-3 rounded-2xl border border-gold-500/30 bg-gold-500/10 px-5 py-3 text-xs font-black uppercase tracking-widest text-gold-300 transition-all hover:bg-gold-500 hover:text-black">
              Pogledaj Bankroll Management
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {stakingLevels.map((level) => (
              <div key={level.title} className="rounded-2xl border border-white/10 bg-black/35 p-5 transition-colors hover:border-gold-500/40">
                <h3 className="font-display text-3xl font-black text-gold-400">{level.title}</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-400">{level.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 md:p-8">
            <XCircle className="text-red-400" size={28} />
            <h2 className="mt-4 font-display text-3xl font-black text-white">Rekreativno klađenje</h2>
            <ul className="mt-5 space-y-3 text-sm font-bold text-neutral-300">
              {['Emocije', 'Jurenje minusa', 'Intuicija', 'Kvota 20+', 'Bez sistema'].map((item) => (
                <li key={item} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-red-400" />{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-gold-500/25 bg-gold-500/10 p-6 md:p-8">
            <CheckCircle2 className="text-gold-500" size={28} />
            <h2 className="mt-4 font-display text-3xl font-black text-white">Elite Tips pristup</h2>
            <ul className="mt-5 space-y-3 text-sm font-bold text-neutral-300">
              {['Value betting', 'Statistika', 'Smart money', 'Risk management', 'Dugoročni ROI', 'Analiza tržišta'].map((item) => (
                <li key={item} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-gold-500" />{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section id="metrike" className="mt-8">
          <h2 className="font-display text-3xl font-black text-white">Metrike koje pratimo</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-5">
            {metrics.map(({ title, icon: Icon, text }) => {
              const isOpen = openMetric === title;
              return (
                <button
                  key={title}
                  type="button"
                  onClick={() => setOpenMetric(isOpen ? '' : title)}
                  className={`rounded-2xl border p-5 text-left transition-all ${
                    isOpen ? 'border-gold-500/50 bg-gold-500/10 shadow-lg shadow-gold-500/10' : 'border-white/10 bg-white/[0.035] hover:border-gold-500/40'
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

        <section className="mt-8 rounded-3xl border border-white/10 bg-black p-6 text-center md:p-10">
          <CloudSun size={30} className="mx-auto text-gold-500" />
          <p className="mx-auto mt-5 max-w-4xl text-sm leading-8 text-neutral-400 md:text-base">
            Ne obećavamo nemoguće. Ne prodajemo lažne dojave i sigurne utakmice. Naš cilj je da kroz disciplinu, analizu i value betting ostvarimo dugoročnu matematičku prednost nad tržištem.
          </p>
          <p className="mx-auto mt-8 max-w-3xl font-display text-2xl font-black text-gold-400 md:text-4xl">
            “Profit ne pravi jedan tiket. Profit pravi sistem.”
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/register" className="rounded-2xl bg-gold-500 px-6 py-4 text-xs font-black uppercase tracking-widest text-black transition-all hover:bg-gold-600">
              Pridruži se VIP timu
            </Link>
            <Link to="/stats" className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-xs font-black uppercase tracking-widest text-neutral-200 transition-all hover:border-gold-500/40 hover:text-gold-400">
              Pogledaj statistiku
            </Link>
            <Link to="/faq" className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-xs font-black uppercase tracking-widest text-neutral-200 transition-all hover:border-gold-500/40 hover:text-gold-400">
              Saznaj kako funkcioniše naš sistem
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
