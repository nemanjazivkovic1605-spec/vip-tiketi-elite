import React, { useState } from 'react';
import { AlertTriangle, BadgeCheck, ChevronDown, FileText, Lock, Mail, Scale, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';

type LegalSection = {
  id: string;
  title: string;
  body?: string;
  bullets?: string[];
};

const termsSections: LegalSection[] = [
  {
    id: 'terms-1',
    title: '1. Prihvatanje uslova',
    body: 'Korišćenjem ELITE VIP TIPS platforme prihvatate sva pravila, uslove korišćenja i politiku privatnosti navedenu na sajtu.',
  },
  {
    id: 'terms-2',
    title: '2. Namenjeno punoletnim osobama',
    body: 'Platforma je namenjena isključivo osobama starijim od 18 godina. Korišćenjem sajta potvrđujete da ste punoletni u skladu sa zakonima vaše države.',
  },
  {
    id: 'terms-3',
    title: '3. Odgovorno klađenje',
    body: 'Sportsko klađenje nosi finansijski rizik. Korisnici su odgovorni za svoje odluke i upravljanje budžetom. Nikada ne ulažite novac koji ne možete da priuštite da izgubite.',
  },
  {
    id: 'terms-4',
    title: '4. Ne garantujemo profit',
    body: 'ELITE VIP TIPS ne garantuje siguran dobitak niti konstantan profit. Svi tipovi predstavljaju analitičke predloge zasnovane na statistici, iskustvu i proceni tržišta.',
  },
  {
    id: 'terms-5',
    title: '5. Informativni karakter sadržaja',
    body: 'Sav sadržaj na platformi služi isključivo u informativne i edukativne svrhe. Korisnik samostalno donosi odluku da li će igrati određeni predlog.',
  },
  {
    id: 'terms-6',
    title: '6. VIP članstvo',
    body: 'VIP pristup se aktivira nakon potvrđene uplate i traje u skladu sa izabranim paketom. Deljenje VIP sadržaja sa trećim licima strogo je zabranjeno.',
  },
  {
    id: 'terms-7',
    title: '7. Zabrana deljenja sadržaja',
    body: 'Kopiranje, deljenje, prodaja ili prosleđivanje naših tipova, analiza i sadržaja bez dozvole može dovesti do trajnog uklanjanja naloga bez refundacije.',
  },
  {
    id: 'terms-8',
    title: '8. Pravo na izmenu sadržaja',
    body: 'ELITE VIP TIPS zadržava pravo izmene sadržaja, tipova, statistike, cena članstva i uslova korišćenja u bilo kom trenutku.',
  },
  {
    id: 'terms-9',
    title: '9. Suspenzija naloga',
    body: 'Zadržavamo pravo da suspendujemo ili trajno uklonimo korisnike koji:',
    bullets: [
      'zloupotrebljavaju platformu',
      'dele VIP sadržaj',
      'vređaju administraciju ili članove',
      'pokušavaju prevaru ili neovlašćen pristup',
    ],
  },
  {
    id: 'terms-10',
    title: '10. Refundacije',
    body: 'Nakon aktivacije VIP pristupa refundacija nije moguća, osim u posebnim slučajevima koje administracija odobri.',
  },
  {
    id: 'terms-11',
    title: '11. Tehničke poteškoće',
    body: 'ELITE VIP TIPS nije odgovoran za eventualne tehničke probleme, prekide rada sajta, kašnjenja ili probleme izazvane trećim servisima.',
  },
  {
    id: 'terms-12',
    title: '12. Privatnost korisnika',
    body: 'Podaci korisnika se čuvaju poverljivo i neće biti prodavani ili deljeni trećim licima osim ukoliko to zakon nalaže.',
  },
  {
    id: 'terms-13',
    title: '13. Kontakt podrška',
    body: 'Za sva pitanja korisnici mogu kontaktirati podršku putem kontakt forme ili email adrese: support@elitetips.com',
  },
];

const disclaimerSections: LegalSection[] = [
  {
    id: 'disclaimer-1',
    title: '1. Informativni karakter sadržaja',
    body: 'Sav sadržaj objavljen na ELITE VIP TIPS platformi služi isključivo u informativne, edukativne i zabavne svrhe. Objavljeni tipovi, analize i predlozi ne predstavljaju finansijski savet, garanciju dobitka niti podsticanje na klađenje.',
  },
  {
    id: 'disclaimer-2',
    title: '2. Korišćenje na sopstvenu odgovornost',
    body: 'Svaki korisnik koristi informacije sa platforme isključivo na sopstvenu odgovornost. ELITE VIP TIPS, vlasnici, administratori, saradnici i partneri ne snose odgovornost za:',
    bullets: [
      'finansijske gubitke',
      'direktnu ili indirektnu štetu',
      'izgubljenu dobit',
      'posledice nastale korišćenjem naših analiza i predloga',
    ],
  },
  {
    id: 'disclaimer-3',
    title: '3. Ne garantujemo dobitak',
    body: 'Sportsko klađenje nosi visok nivo rizika i ne postoji sistem koji garantuje profit ili siguran dobitak. Prethodni rezultati i statistika ne predstavljaju garanciju budućih rezultata.',
  },
  {
    id: 'disclaimer-4',
    title: '4. Odgovorno klađenje',
    body: 'Korisnici su dužni da se klade odgovorno i u skladu sa zakonima države u kojoj se nalaze. Nikada ne treba ulagati novac koji ne možete da priuštite da izgubite.',
  },
  {
    id: 'disclaimer-5',
    title: '5. Punoletstvo korisnika',
    body: 'Korišćenjem platforme potvrđujete da imate najmanje 18 godina ili zakonski minimum za sportsko klađenje u vašoj državi.',
  },
  {
    id: 'disclaimer-6',
    title: '6. Nije platforma za klađenje',
    body: 'ELITE VIP TIPS nije kladionica niti organizator igara na sreću. Platforma ne prima uplate za klađenje, ne organizuje klađenje i ne upravlja igrama na sreću. Platforma pruža isključivo analitički i informativni sadržaj.',
  },
  {
    id: 'disclaimer-7',
    title: '7. Tačnost informacija',
    body: 'Iako se trudimo da sve informacije budu tačne i ažurne, ELITE VIP TIPS ne garantuje potpunu tačnost, dostupnost ili pouzdanost svih objavljenih podataka, kvota i statistike.',
  },
  {
    id: 'disclaimer-8',
    title: '8. Spoljni linkovi i servisi',
    body: 'Platforma može sadržati linkove ka spoljnim sajtovima i servisima. ELITE VIP TIPS nije odgovoran za sadržaj, politiku privatnosti ili rad trećih strana.',
  },
  {
    id: 'disclaimer-9',
    title: '9. Pravo izmene',
    body: 'Zadržavamo pravo izmene sadržaja, cena, pravila korišćenja i pravnog odricanja odgovornosti u bilo kom trenutku bez prethodne najave.',
  },
  {
    id: 'disclaimer-10',
    title: '10. Ograničenje odgovornosti',
    body: 'U maksimalnoj meri dozvoljenoj zakonom, ELITE VIP TIPS i povezana lica neće biti odgovorni ni za kakvu direktnu, indirektnu, slučajnu ili posledičnu štetu nastalu korišćenjem platforme.',
  },
  {
    id: 'disclaimer-11',
    title: '11. Prihvatanje uslova',
    body: 'Korišćenjem sajta potvrđujete da ste pročitali, razumeli i prihvatili sva pravila, uslove korišćenja i ovo odricanje odgovornosti.',
  },
];

const protectionSections: LegalSection[] = [
  {
    id: 'protection-14',
    title: '14. Digitalni proizvod',
    body: 'Kupovinom VIP članstva korisnik dobija pristup digitalnom sadržaju, analizama, statistikama i informacijama koje su dostupne odmah nakon aktivacije naloga. Zbog prirode digitalnog proizvoda i trenutnog pristupa sadržaju, refundacija nakon aktivacije članstva nije moguća.',
  },
  {
    id: 'protection-15',
    title: '15. Intelektualna svojina',
    body: 'Sav sadržaj objavljen na ELITE VIP TIPS platformi predstavlja intelektualnu svojinu ELITE VIP TIPS platforme i zaštićen je autorskim pravima, uključujući:',
    bullets: [
      'tekstove',
      'analize',
      'statistike',
      'dizajn',
      'logo',
      'grafike',
      'VIP tipove',
      'rezultate',
      'baze podataka',
      'interni sistem rada',
    ],
  },
  {
    id: 'protection-16',
    title: '16. Zabrana deljenja sadržaja',
    body: 'Strogo je zabranjeno kopiranje, distribucija i javno objavljivanje sadržaja. Kršenje ovih pravila može dovesti do trajnog uklanjanja naloga bez refundacije i mogućih pravnih postupaka.',
    bullets: [
      'kopiranje sadržaja',
      'screenshotovanje VIP tipova',
      'prosleđivanje analiza',
      'deljenje naloga',
      'javno objavljivanje sadržaja',
      'prodavanje naših tipova trećim licima',
      'redistribucija sadržaja u drugim grupama ili platformama',
    ],
  },
  {
    id: 'protection-17',
    title: '17. Deljenje naloga',
    body: 'Jedan VIP nalog može koristiti isključivo jedna osoba. Detekcija deljenja naloga, VPN zloupotrebe, višestrukih simultanih prijava ili sumnjivih aktivnosti može rezultovati trajnom zabranom pristupa platformi.',
  },
  {
    id: 'protection-18',
    title: '18. Chargeback i prevara',
    body: 'Svaki pokušaj lažnog chargeback-a, prevare, zloupotrebe platnog sistema ili neovlašćenog povraćaja sredstava smatraće se pokušajem finansijske prevare i može biti prijavljen nadležnim institucijama i payment providerima.',
  },
  {
    id: 'protection-19',
    title: '19. Affiliate i partnerski linkovi',
    body: 'Platforma može sadržati affiliate, promotivne ili partnerske linkove ka trećim stranama i servisima. ELITE VIP TIPS ne garantuje usluge, kvote, rezultate, bonuse niti funkcionalnost tih platformi.',
  },
  {
    id: 'protection-20',
    title: '20. Promene kvota i tržišta',
    body: 'Kvote, tržišta i uslovi klađenja mogu biti promenjeni u bilo kom trenutku od strane kladionica. ELITE VIP TIPS nije odgovoran za:',
    bullets: [
      'pad kvota',
      'promenu tržišta',
      'zatvaranje meča',
      'limitiranje naloga kod kladionica',
      'nedostupnost određenih tipova',
      'tehničke probleme kladionica',
    ],
  },
  {
    id: 'protection-21',
    title: '21. Ograničenje odgovornosti',
    body: 'U maksimalnoj meri dozvoljenoj zakonom, ELITE VIP TIPS, vlasnici, administratori, saradnici i partneri neće biti odgovorni za:',
    bullets: [
      'direktne ili indirektne finansijske gubitke',
      'izgubljenu dobit',
      'psihološki stres',
      'zavisnost od klađenja',
      'korisničke dugove',
      'posledice lošeg upravljanja novcem',
      'odluke korisnika zasnovane na našim analizama',
    ],
  },
  {
    id: 'protection-22',
    title: '22. Rezultati i statistika',
    body: 'Prethodni rezultati, prolaznost tipova i statistika ne predstavljaju garanciju budućih rezultata. Sportsko klađenje uključuje visok nivo rizika i rezultati mogu značajno varirati.',
  },
  {
    id: 'protection-23',
    title: '23. Odgovorno klađenje',
    body: 'Korisnici su dužni da se klade odgovorno. Ukoliko korisnik pokazuje znake zavisnosti od klađenja, preporučuje se prekid korišćenja platforme i traženje stručne pomoći.',
  },
  {
    id: 'protection-24',
    title: '24. Tehnički problemi',
    body: 'ELITE VIP TIPS ne garantuje da će platforma raditi bez prekida ili grešaka. Ne odgovaramo za:',
    bullets: [
      'pad servera',
      'hakovanje',
      'probleme hostinga',
      'prekid interneta',
      'gubitak podataka',
      'kašnjenje objava',
      'bugove',
      'probleme sa email servisima',
      'probleme sa Telegram/Discord/platformama trećih strana',
    ],
  },
  {
    id: 'protection-25',
    title: '25. Viša sila (Force Majeure)',
    body: 'ELITE VIP TIPS nije odgovoran za nemogućnost pružanja usluge usled:',
    bullets: [
      'prirodnih katastrofa',
      'rata',
      'cyber napada',
      'nestanka struje',
      'prekida interneta',
      'odluka državnih organa',
      'problema payment providera',
      'tehničkih kvarova van naše kontrole',
    ],
  },
  {
    id: 'protection-26',
    title: '26. Pravo izmene uslova',
    body: 'Zadržavamo pravo izmene cena, VIP paketa, pravila korišćenja, pravnog odricanja odgovornosti, politike privatnosti i sadržaja platforme u bilo kom trenutku bez prethodne najave.',
  },
  {
    id: 'protection-27',
    title: '27. Suspenzija i trajni ban',
    body: 'Zadržavamo pravo trajnog uklanjanja korisnika bez prethodnog upozorenja zbog:',
    bullets: [
      'deljenja sadržaja',
      'vređanja administracije',
      'spamovanja',
      'pretnji',
      'pokušaja hakovanja',
      'sumnjivih aktivnosti',
      'zloupotrebe sistema',
      'lažnih uplata',
      'chargeback pokušaja',
    ],
  },
  {
    id: 'protection-28',
    title: '28. Nadležnost',
    body: 'Korišćenjem platforme korisnik prihvata da se svi eventualni sporovi rešavaju u skladu sa važećim zakonima i nadležnostima koje odredi vlasnik platforme.',
  },
  {
    id: 'protection-29',
    title: '29. Automatsko prihvatanje uslova',
    body: 'Korišćenjem sajta, registracijom naloga ili kupovinom VIP članstva korisnik automatski potvrđuje da je pročitao, razumeo i prihvatio sve uslove korišćenja, pravila i pravna odricanja odgovornosti.',
  },
  {
    id: 'protection-30',
    title: '30. Završna odredba',
    body: 'Ukoliko se bilo koji deo ovih uslova smatra nevažećim ili neprimenljivim, ostali delovi ostaju u punoj pravnoj snazi.',
  },
];

const groups = [
  {
    id: 'terms',
    eyebrow: 'Pravila korišćenja',
    title: 'Pravila korišćenja - ELITE VIP TIPS',
    description: 'Osnovni uslovi za korišćenje platforme, VIP pristupa, sadržaja i naloga.',
    icon: FileText,
    sections: termsSections,
  },
  {
    id: 'disclaimer',
    eyebrow: 'Legal disclaimer',
    title: 'Pravno odricanje odgovornosti',
    description: 'Jasno definisana ograničenja odgovornosti i informativna priroda svih analiza.',
    icon: Scale,
    sections: disclaimerSections,
  },
  {
    id: 'protection',
    eyebrow: 'Dodatna zaštita',
    title: 'Dodatna pravna zaštita i uslovi',
    description: 'Zaštita digitalnog sadržaja, intelektualne svojine, naloga i internih sistema.',
    icon: ShieldCheck,
    sections: protectionSections,
  },
];

const highlights = [
  { icon: BadgeCheck, label: '18+ pristup', text: 'Platforma je namenjena isključivo punoletnim korisnicima.' },
  { icon: AlertTriangle, label: 'Bez garancije profita', text: 'Tipovi su analitički predlozi, ne finansijski savet.' },
  { icon: Lock, label: 'VIP sadržaj je zaštićen', text: 'Deljenje naloga, tipova i analiza je strogo zabranjeno.' },
  { icon: Mail, label: 'Podrška', text: 'Kontakt: support@elitetips.com' },
];

const revealProps = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.18 },
  transition: { duration: 0.45, ease: 'easeOut' },
};

function AccordionItem({
  section,
  isOpen,
  onToggle,
}: {
  section: LegalSection;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35 transition-all duration-300 hover:border-gold-500/35 hover:shadow-lg hover:shadow-gold-500/10">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left"
        aria-expanded={isOpen}
      >
        <span className="text-sm font-black uppercase tracking-widest text-neutral-100 md:text-base">
          {section.title}
        </span>
        <ChevronDown
          size={20}
          className={`shrink-0 text-gold-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <div className={`grid transition-all duration-300 ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="border-t border-white/5 px-5 pb-6 pt-5">
            {section.body && (
              <p className="text-sm leading-7 text-neutral-400 md:text-base">
                {section.body}
              </p>
            )}
            {section.bullets && (
              <ul className="mt-4 grid gap-2 text-sm text-neutral-400 md:text-base">
                {section.bullets.map((bullet) => (
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

export default function Terms() {
  const [openSections, setOpenSections] = useState<string[]>(['terms-1', 'disclaimer-1', 'protection-14']);

  const toggleSection = (id: string) => {
    setOpenSections((current) =>
      current.includes(id) ? current.filter((sectionId) => sectionId !== id) : [...current, id],
    );
  };

  return (
    <div className="min-h-screen bg-neutral-950 px-6 py-14 md:py-20">
      <div className="mx-auto max-w-7xl">
        <motion.section
          {...revealProps}
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-black px-6 py-10 shadow-2xl shadow-black/40 md:px-10 md:py-14"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500 to-transparent" />
          <div className="absolute right-8 top-8 hidden h-40 w-40 rounded-full bg-gold-500/10 blur-3xl md:block" />

          <div className="relative max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold-500/25 bg-gold-500/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-gold-400">
              <Scale size={15} />
              Terms of Service / Pravila korišćenja / Legal Disclaimer
            </div>
            <h1 className="font-display text-4xl font-black tracking-tight text-white md:text-6xl">
              ELITE VIP TIPS legalni uslovi platforme
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-neutral-400 md:text-lg">
              Ova stranica definiše pravila korišćenja, odricanje odgovornosti i dodatne pravne uslove za pristup
              sportskoj analitici, VIP sadržaju i community platformi ELITE VIP TIPS.
            </p>
          </div>

          <div className="relative mt-10 grid gap-4 md:grid-cols-4">
            {highlights.map(({ icon: Icon, label, text }, index) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.35, delay: index * 0.05 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all duration-300 hover:border-gold-500/40 hover:bg-gold-500/5 hover:shadow-lg hover:shadow-gold-500/10"
              >
                <Icon size={22} className="mb-4 text-gold-500" />
                <h3 className="text-sm font-black uppercase tracking-widest text-white">{label}</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-500">{text}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        <div className="sticky top-20 z-30 mt-6 rounded-2xl border border-white/10 bg-black/85 px-4 py-3 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Scale size={18} className="text-gold-500" />
              <span className="text-xs font-black uppercase tracking-widest text-white">ELITE VIP TIPS Legal</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
              {groups.map(({ id, eyebrow }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="shrink-0 rounded-full border border-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-400 transition-all hover:border-gold-500/50 hover:bg-gold-500/10 hover:text-gold-400 hover:shadow-lg hover:shadow-gold-500/10"
                >
                  {eyebrow}
                </a>
              ))}
            </div>
          </div>
        </div>

        <motion.section {...revealProps} className="mt-8 rounded-2xl border border-gold-500/20 bg-gold-500/10 p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-gold-400">Važna napomena</p>
              <p className="mt-2 max-w-4xl text-sm leading-7 text-neutral-300 md:text-base">
                ELITE VIP TIPS nije kladionica, ne prima uplate za klađenje i ne garantuje dobitak. Sadržaj je
                informativan, edukativan i namenjen odgovornim punoletnim korisnicima.
              </p>
            </div>
            <div className="shrink-0 rounded-full border border-gold-500/30 px-4 py-2 text-xs font-black uppercase tracking-widest text-gold-400">
              18+ only
            </div>
          </div>
        </motion.section>

        <div className="mt-10 grid gap-8">
          {groups.map(({ id, eyebrow, title, description, icon: Icon, sections }) => (
            <motion.section
              {...revealProps}
              key={id}
              id={id}
              className="scroll-mt-36 rounded-3xl border border-white/10 bg-neutral-950/80 p-5 shadow-xl shadow-black/20 md:p-8"
            >
              <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gold-400">
                    <Icon size={16} />
                    {eyebrow}
                  </div>
                  <h2 className="font-display text-2xl font-black text-white md:text-4xl">{title}</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-500 md:text-base">{description}</p>
                </div>
                <span className="w-fit rounded-full border border-white/10 bg-black px-4 py-2 text-xs font-black uppercase tracking-widest text-neutral-500">
                  {sections.length} sekcija
                </span>
              </div>

              <div className="grid gap-3">
                {sections.map((section) => (
                  <React.Fragment key={section.id}>
                    <AccordionItem
                      section={section}
                      isOpen={openSections.includes(section.id)}
                      onToggle={() => toggleSection(section.id)}
                    />
                  </React.Fragment>
                ))}
              </div>
            </motion.section>
          ))}
        </div>
      </div>
    </div>
  );
}
