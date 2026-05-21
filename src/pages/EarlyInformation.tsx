import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Brain,
  CheckCircle2,
  CircleDollarSign,
  CloudSun,
  LineChart,
  MapPin,
  Mic,
  ShieldCheck,
  TrendingUp,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';

type EdgeCardProps = {
  key?: React.Key;
  title: string;
  icon: React.ElementType;
  text: string;
  details: string[];
  highlight?: string;
  isOpen: boolean;
  onToggle: () => void;
};

const edgePillars = [
  {
    title: 'Opening Lines Monitoring',
    icon: LineChart,
    text: 'Čim azijske kladionice i profesionalne berze izbace početne kvote, naš sistem ih poredi sa internim projekcijama i value modelima. Ako tržište pogrešno proceni tim zbog površnog gledanja rezultata ili forme, reagujemo odmah — pre nego što kvota padne.',
    details: ['Opening Line', 'Early Value', 'CLV (Closing Line Value)', 'Market inefficiency'],
    highlight: 'Najveći value često postoji prvih nekoliko sati nakon izlaska kvote.',
  },
  {
    title: 'Klupska dinamika i insajderske informacije',
    icon: Users,
    text: 'Ne pratimo samo standardne sportske portale. Analiziramo lokalne izvore, konferencije, izjave, trening izveštaje i klupsku dinamiku. Povrede, sukobi u svlačionici, kašnjenje plata, rotacije ili problemi sa putovanjem često menjaju realnu vrednost meča mnogo pre nego što tržište odreaguje.',
    details: ['Dressing room issues', 'Motivation', 'Delayed salaries', 'Travel fatigue', 'Private/local sources'],
  },
  {
    title: 'Smart Money i Steam Moves',
    icon: CircleDollarSign,
    text: 'Pratimo tok novca na profesionalnim tržištima poput Pinnacle i Betfair. Kada dođe do naglog pada kvote u više svetskih kladionica istovremeno, tržište ostavlja trag. Naš sistem detektuje Steam Moves i analizira da li iza njih stoji profesionalni novac.',
    details: ['Steam Move', 'Smart Money', 'Sharp Syndicates', 'Market Volume', 'Public vs sharp money'],
    highlight: 'Pametan novac ostavlja trag pre nego što kvota eksplodira.',
  },
  {
    title: 'Niže lige i lokalna prednost',
    icon: MapPin,
    text: 'Što je liga manja, to je bukmejkerima teže da kontrolišu informacije. Regionalne lige, niži rangovi i egzotična tržišta često kriju najveći VALUE jer velike kladionice nemaju detaljan lokalni monitoring.',
    details: ['Weather', 'Artificial turf', 'Empty stadium', 'Referee tendencies', 'Lower league motivation'],
    highlight: 'Najveće greške tržišta često nastaju u ligama koje većina igrača ignoriše.',
  },
  {
    title: 'Taktički Matchup i konferencije',
    icon: Mic,
    text: 'Bukmejkeri retko ozbiljno reaguju na izjave trenera i taktičke nagoveštaje. Mi ih analiziramo detaljno. Ako trener nagovesti rotaciju zbog evropskog meča ili promenu formacije, tržište često kasni sa reakcijom.',
    details: ['Tactical systems', 'Formation changes', 'Press conferences', 'Lineup prediction', 'Under/over impact'],
  },
];

const alertItems = [
  'Povrede',
  'Steam Moves',
  'Rotacije',
  'Vremenski uslovi',
  'Smart Money',
  'Sudije',
  'Kašnjenje plata',
  'Trening izveštaji',
  'Putovanja',
  'Promene kvota',
  'Motivacija',
  'Suspensions',
];

function EdgeCard({ title, icon: Icon, text, details, highlight, isOpen, onToggle }: EdgeCardProps) {
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

      {highlight && (
        <div className="mt-5 rounded-2xl border border-gold-500/25 bg-gold-500/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-gold-300">
          {highlight}
        </div>
      )}

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

export default function EarlyInformation() {
  const [openPillar, setOpenPillar] = useState(edgePillars[0].title);

  return (
    <div className="min-h-screen bg-neutral-950 px-6 py-14 md:py-20">
      <div className="mx-auto max-w-7xl">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neutral-500 transition-colors hover:text-gold-400">
          <ArrowLeft size={15} />
          Nazad na početnu
        </Link>

        <div className="sticky top-20 z-20 mb-6 hidden rounded-2xl border border-white/10 bg-neutral-950/80 px-4 py-3 backdrop-blur-xl lg:flex lg:items-center lg:justify-between">
          {[
            ['Edge', '#edge'],
            ['Stubovi', '#stubovi'],
            ['Value', '#value'],
            ['Alerts', '#alerts'],
            ['Sistem', '#sistem'],
          ].map(([label, href]) => (
            <a key={href} href={href} className="text-[10px] font-black uppercase tracking-widest text-neutral-500 transition-colors hover:text-gold-400">
              {label}
            </a>
          ))}
        </div>

        <section id="edge" className="relative overflow-hidden rounded-3xl border border-white/10 bg-black px-6 py-10 shadow-2xl shadow-black/40 md:px-10 md:py-16">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500 to-transparent" />
          <div className="absolute -right-16 top-0 h-64 w-64 rounded-full bg-gold-500/10 blur-3xl" />
          <div className="relative max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold-500/25 bg-gold-500/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-gold-400">
              <Zap size={15} />
              Early Information Edge
            </div>
            <h1 className="font-display text-4xl font-black tracking-tight text-white md:text-6xl">Rane Informacije</h1>
            <p className="mt-4 font-display text-lg font-black text-gold-400 md:text-2xl">
              Kako pobeđujemo bukmejkere u njihovoj sopstvenoj igri
            </p>
            <p className="mt-6 max-w-3xl text-base leading-8 text-neutral-400 md:text-lg">
              Informacija u pravo vreme pravi razliku između dugoročnog profita i prosečnog klađenja. Naš cilj nije da jurimo kvote koje su već pale — naš cilj je da prvi pronađemo VALUE dok tržište još nije reagovalo.
            </p>
            <div className="mt-8 rounded-2xl border border-gold-500/25 bg-gold-500/10 px-5 py-4 text-sm font-black uppercase tracking-widest text-gold-300 md:inline-flex">
              Najveći profit u sportskom klađenju nastaje pre nego što većina igrača uopšte vidi promenu kvote.
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <h2 className="font-display text-3xl font-black text-white">Zašto rane informacije vrede?</h2>
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <p className="text-sm leading-8 text-neutral-400 md:text-base">
              Da biste razumeli vrednost ranih informacija, morate razumeti kako funkcionišu moderne kladionice.
            </p>
            <p className="text-sm leading-8 text-neutral-400 md:text-base">
              Bukmejkeri početne kvote postavljaju pomoću matematičkih modela, istorijskih podataka i tržišnih procena. Međutim, statistika ne igra utakmicu — igraju ljudi, motivacija, povrede, putovanja i informacije koje tržište još nije apsorbovalo.
            </p>
            <p className="text-sm leading-8 text-neutral-400 md:text-base">
              Naš tim deluje upravo u tom kritičnom vremenskom prozoru između objave Opening Lines i početka utakmice, kada nastaju najveće anomalije i najveći VALUE.
            </p>
          </div>
        </section>

        <section id="stubovi" className="mt-8">
          <h2 className="font-display text-3xl font-black text-white">Pet glavnih stubova ranih informacija</h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {edgePillars.map((pillar) => (
              <EdgeCard
                key={pillar.title}
                title={pillar.title}
                icon={pillar.icon}
                text={pillar.text}
                details={pillar.details}
                highlight={pillar.highlight}
                isOpen={openPillar === pillar.title}
                onToggle={() => setOpenPillar(openPillar === pillar.title ? '' : pillar.title)}
              />
            ))}
          </div>
        </section>

        <section id="value" className="mt-8 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-3xl border border-gold-500/20 bg-gold-500/10 p-6 md:p-8">
            <h2 className="font-display text-3xl font-black text-white">Kako pronalazimo VALUE pre tržišta?</h2>
            <p className="mt-4 text-sm leading-8 text-neutral-300 md:text-base">
              Naš cilj nije da jurimo kvotu koja je već pala. Naš cilj je da prvi prepoznamo pogrešno procenjenu verovatnoću i uzmemo najbolju moguću cenu pre nego što tržište reaguje.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black p-6 md:p-8">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">CLV primer</p>
            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <span className="block text-xs font-black uppercase tracking-widest text-neutral-500">Kvota ujutru</span>
                <strong className="mt-1 block font-display text-3xl text-gold-300">2.20</strong>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <span className="block text-xs font-black uppercase tracking-widest text-neutral-500">Kvota pred meč</span>
                <strong className="mt-1 block font-display text-3xl text-neutral-100">1.85</strong>
              </div>
              <div className="rounded-2xl border border-gold-500/25 bg-gold-500/10 p-4 text-sm font-bold leading-7 text-neutral-200">
                Korisnici koji su uzeli ranu kvotu ostvarili su ogromnu matematičku prednost.
              </div>
            </div>
          </div>
        </section>

        <section id="alerts" className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <h2 className="font-display text-3xl font-black text-white">Šta pratimo svakodnevno?</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {alertItems.map((item) => (
              <button
                key={item}
                type="button"
                className="rounded-2xl border border-white/10 bg-black/35 px-4 py-4 text-left text-xs font-black uppercase tracking-widest text-neutral-300 transition-all hover:border-gold-500/40 hover:bg-gold-500/10 hover:text-gold-300"
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        <section id="sistem" className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 md:p-8">
            <XCircle className="text-red-400" size={28} />
            <h2 className="mt-4 font-display text-3xl font-black text-white">Obično klađenje</h2>
            <ul className="mt-5 space-y-3 text-sm font-bold text-neutral-300">
              {['Gleda samo tabelu', 'Prati TikTok dojave', 'Kasni na promene kvota', 'Igra emocijama', 'Juri kvotu'].map((item) => (
                <li key={item} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-red-400" />{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-gold-500/25 bg-gold-500/10 p-6 md:p-8">
            <CheckCircle2 className="text-gold-500" size={28} />
            <h2 className="mt-4 font-display text-3xl font-black text-white">Elite Tips sistem</h2>
            <ul className="mt-5 space-y-3 text-sm font-bold text-neutral-300">
              {['Early information edge', 'Value betting', 'Market analytics', 'Smart money tracking', 'Timing advantage', 'Professional risk management'].map((item) => (
                <li key={item} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-gold-500" />{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-black p-6 text-center md:p-10">
          <CloudSun size={30} className="mx-auto text-gold-500" />
          <p className="mx-auto mt-5 max-w-4xl text-sm leading-8 text-neutral-400 md:text-base">
            U profesionalnom klađenju tajming je često važniji od same prognoze. Korisnici koji imaju pravu informaciju nekoliko sati ranije ne igraju protiv sreće — oni igraju protiv sporosti tržišta.
          </p>
          <p className="mx-auto mt-8 max-w-3xl font-display text-2xl font-black text-gold-400 md:text-4xl">
            “Najveći profit nastaje pre nego što tržište stigne da reaguje.”
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/daily-analysis" className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-xs font-black uppercase tracking-widest text-neutral-200 transition-all hover:border-gold-500/40 hover:text-gold-400">
              Pogledaj Dnevnu Analizu
            </Link>
            <Link to="/register" className="rounded-2xl bg-gold-500 px-6 py-4 text-xs font-black uppercase tracking-widest text-black transition-all hover:bg-gold-600">
              Pridruži se VIP timu
            </Link>
            <Link to="/stats" className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-xs font-black uppercase tracking-widest text-neutral-200 transition-all hover:border-gold-500/40 hover:text-gold-400">
              Pogledaj statistiku
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
