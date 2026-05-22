import React, { useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  CircleHelp,
  Crown,
  LineChart,
  Mail,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
} from 'lucide-react';

type FaqItem = {
  question: string;
  answer: string;
  bullets?: string[];
};

const faqItems: FaqItem[] = [
  {
    question: 'Kako funkcioniše ELITE VIP TIPS?',
    answer: 'ELITE VIP TIPS pruža sportske analize i predloge tiketa na osnovu statistike, forme timova, kvota i dodatnih analiza tržišta.',
  },
  {
    question: 'Da li su tipovi sigurni?',
    answer: 'Ne postoji 100% siguran tiket. Cilj platforme je da poveća šanse za profit kroz kvalitetnu analizu i disciplinovan pristup klađenju.',
  },
  {
    question: 'Koliko tipova dnevno objavljujete?',
    answer: 'Broj tipova zavisi od ponude i kvaliteta mečeva tog dana. Fokus je na kvalitetu, ne na količini.',
  },
  {
    question: 'Da li nudite singlove ili dublove?',
    answer: 'Primarni fokus su singl tipovi, dok se povremeno objavljuju i dubl kombinacije kada postoji dobra vrednost.',
  },
  {
    question: 'Na koje sportove se fokusirate?',
    answer: 'Najviše se fokusiramo na sportove gde imamo najviše podataka, tržišne dinamike i kvalitetnih value prilika.',
    bullets: ['Fudbal', 'Košarka', 'Tenis', 'Ponekad eSports i drugi sportovi'],
  },
  {
    question: 'Kako dobijam VIP tipove?',
    answer: 'Nakon aktivacije članstva, pristup dobijaš direktno preko sajta, Telegram grupe ili privatnog kanala komunikacije.',
  },
  {
    question: 'Da li početnici mogu koristiti platformu?',
    answer: 'Da. Analize i tipovi su jednostavno objašnjeni i prilagođeni i početnicima i iskusnim igračima.',
  },
  {
    question: 'Koliko novca je potrebno za klađenje?',
    answer: 'Preporučuje se odgovorno upravljanje budžetom. Nikada ne treba igrati novcem koji ne možeš da priuštiš da izgubiš.',
  },
  {
    question: 'Da li postoji mesečna pretplata?',
    answer: 'Da, platforma funkcioniše putem VIP članstva sa određenim periodom pristupa.',
  },
  {
    question: 'Da li garantujete profit?',
    answer: 'Ne. Klađenje uvek nosi rizik i ELITE VIP TIPS ne garantuje siguran dobitak. Naš cilj je da kroz detaljne analize, statistiku i iskustvo dugoročno povećamo šanse za profit. Ukoliko pratite naše predloge disciplinovano i odgovorno upravljate budžetom, velika je verovatnoća da budete u plusu, što možete videti i kroz našu statistiku i rezultate.',
  },
  {
    question: 'Da li mogu da otkažem članstvo?',
    answer: 'Da, članstvo može biti otkazano po isteku aktivnog perioda.',
  },
  {
    question: 'Kako mogu kontaktirati podršku?',
    answer: 'Putem kontakt forme na sajtu ili preko email podrške: support@eliteviptips.com',
  },
  {
    question: 'Zašto biste se pretplatili na ELITE VIP TIPS?',
    answer: 'Zato što ne dobijate nasumične tipove, već detaljno analizirane predloge zasnovane na statistici, formi timova, vrednosti kvota i iskustvu. Fokus nam nije na količini tiketa, već na kvalitetu i dugoročnom profitu. Naš cilj nije da obećavamo “sigurne dojave”, već da kroz kvalitetne analize povećamo vaše šanse da dugoročno budete u plusu.',
    bullets: [
      'Pažljivo analizirane singl i VIP tipove',
      'Fokus na value bet pristup, ne “ludačke” kvote',
      'Transparentnu statistiku i rezultate',
      'Redovne predloge i analize',
      'Profesionalan i disciplinovan pristup klađenju',
      'Zajednicu ljudi koji ozbiljno pristupaju sportskom klađenju',
    ],
  },
  {
    question: 'Koliko godina se bavite sportskim klađenjem?',
    answer: 'Naš tim godinama prati sportsko klađenje, analizu mečeva, statistiku i kretanje kvota. Kroz dugogodišnje iskustvo razvili smo disciplinovan pristup i sistem analize koji nam pomaže da izdvojimo najbolje value tipove i kvalitetne prilike za igru.',
  },
  {
    question: 'Da li ELITE VIP TIPS vodi jedna osoba?',
    answer: 'Ne. ELITE VIP TIPS nije zasnovan na mišljenju samo jedne osobe. Iza platforme stoji tim ljudi koji prati različite sportove, statistiku, forme timova i tržište kvota kako bi analize bile što kvalitetnije.',
  },
  {
    question: 'Da li imate strane tipstere?',
    answer: 'Da. Pored domaćih analiza, pratimo i određene strane tipstere, analitičare i sportske izvore kako bismo imali širu sliku tržišta i dodatne informacije pre objave tipova. Naravno, svaki predlog prolazi našu dodatnu proveru i analizu pre nego što bude objavljen članovima.',
  },
  {
    question: 'Da li sarađujete sa vrhunskim tipsterima?',
    answer: 'Da. U analizama pratimo i koristimo informacije, statistiku i pristupe nekih od najboljih domaćih i svetskih tipstera i sportskih analitičara. Kombinujemo više izvora, naprednu statistiku i sopstvene analize kako bismo članovima pružili što kvalitetnije predloge i najbolju moguću vrednost za klađenje.',
  },
  {
    question: 'Da li pratite ostale VIP grupe?',
    answer: 'Da. Pratimo domaće i strane VIP grupe, tipstere i sportske analitičare kako bismo imali širu sliku tržišta, kretanja kvota i informacija pre početka mečeva. Ipak, ne kopiramo tuđe tipove - svaki predlog prolazi našu sopstvenu analizu, proveru statistike i procenu vrednosti pre objave članovima ELITE VIP TIPS zajednice.',
  },
  {
    question: 'Da li ste profesionalni tipsteri?',
    answer: 'Da. ELITE VIP TIPS pristupa sportskom klađenju ozbiljno i profesionalno. Fokusirani smo na analizu statistike, forme timova, value kvota i disciplinovano upravljanje bankrollom. Naš cilj nije prodaja “sigurnih dojava”, već dugoročno kvalitetni i profitabilni predlozi zasnovani na iskustvu i detaljnoj analizi tržišta.',
  },
];

const questionIcons = [Target, BarChart3, ShieldCheck, Trophy, LineChart, Crown, Users, Sparkles, CircleHelp];

const highlights = [
  {
    icon: Target,
    label: 'Value pristup',
    text: 'Fokus na kvalitetnim prilikama, ne na nasumičnoj količini tiketa.',
  },
  {
    icon: BarChart3,
    label: 'Statistika i forma',
    text: 'Analize uključuju formu timova, tržište kvota i sportski kontekst.',
  },
  {
    icon: ShieldCheck,
    label: 'Realna očekivanja',
    text: 'Bez obećanja sigurnih dojava, uz naglasak na odgovornu igru.',
  },
];

function FaqAccordionItem({
  item,
  index,
  isOpen,
  onToggle,
}: {
  item: FaqItem;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const Icon = questionIcons[index % questionIcons.length];

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/35 transition-all duration-300 hover:border-gold-500/40 hover:bg-white/[0.04] hover:shadow-xl hover:shadow-gold-500/10">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-5 py-5 text-left md:px-6"
        aria-expanded={isOpen}
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gold-500/25 bg-gold-500/10 text-gold-400 shadow-[0_0_22px_rgba(245,124,0,0.12)]">
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gold-500/80">
            Pitanje {String(index + 1).padStart(2, '0')}
          </span>
          <h3 className="text-base font-black leading-6 text-white md:text-lg">{item.question}</h3>
        </div>
        <ChevronDown
          size={22}
          className={`shrink-0 text-gold-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <div className={`grid transition-all duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="border-t border-white/5 px-5 pb-6 pt-5 md:px-6">
            <p className="text-sm leading-7 text-neutral-400 md:text-base">{item.answer}</p>
            {item.bullets && (
              <ul className="mt-4 grid gap-2 text-sm text-neutral-400 md:grid-cols-2 md:text-base">
                {item.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500 shadow-[0_0_12px_rgba(245,124,0,0.8)]" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Faq() {
  const [openItems, setOpenItems] = useState<number[]>([0, 9, 12]);

  const toggleItem = (index: number) => {
    setOpenItems((current) =>
      current.includes(index) ? current.filter((itemIndex) => itemIndex !== index) : [...current, index],
    );
  };

  return (
    <div className="min-h-screen bg-neutral-950 px-6 py-14 md:py-20">
      <div className="mx-auto max-w-7xl">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-black px-6 py-10 shadow-2xl shadow-black/40 md:px-10 md:py-14">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500 to-transparent" />
          <div className="absolute -right-12 top-10 hidden h-52 w-52 rounded-full bg-gold-500/10 blur-3xl md:block" />

          <div className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold-500/25 bg-gold-500/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-gold-400">
                <CircleHelp size={15} />
                Česta pitanja
              </div>
              <h1 className="font-display text-4xl font-black tracking-tight text-white md:text-6xl">
                FAQ za ELITE VIP TIPS zajednicu
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-8 text-neutral-400 md:text-lg">
                Sve što treba da znate o VIP tipovima, analizi, članstvu, odgovornom klađenju i načinu rada platforme.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {highlights.map(({ icon: Icon, label, text }) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all duration-300 hover:border-gold-500/40 hover:bg-gold-500/5 hover:shadow-lg hover:shadow-gold-500/10">
                  <Icon size={22} className="mb-4 text-gold-500" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-white">{label}</h2>
                  <p className="mt-3 text-sm leading-6 text-neutral-500">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-4">
          {faqItems.map((item, index) => (
            <React.Fragment key={item.question}>
              <FaqAccordionItem
                item={item}
                index={index}
                isOpen={openItems.includes(index)}
                onToggle={() => toggleItem(index)}
              />
            </React.Fragment>
          ))}
        </section>

        <section className="mt-10 rounded-3xl border border-gold-500/20 bg-gold-500/10 p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-gold-400">Treba vam pomoć?</p>
              <h2 className="mt-2 font-display text-2xl font-black text-white">Kontaktirajte VIP podršku</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-300 md:text-base">
                Za pitanja oko članarine, naloga ili pristupa VIP tipovima, podrška je dostupna preko kontakt forme ili email adrese.
              </p>
            </div>
            <a
              href="mailto:support@eliteviptips.com"
              className="inline-flex w-fit items-center gap-3 rounded-xl border border-gold-500/30 bg-black px-5 py-3 text-sm font-black uppercase tracking-widest text-gold-400 transition-all hover:-translate-y-0.5 hover:border-gold-500 hover:shadow-lg hover:shadow-gold-500/20"
            >
              <Mail size={17} />
              support@eliteviptips.com
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
