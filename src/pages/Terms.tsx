import React, { useState } from 'react';
import { ChevronDown, FileText, Scale, ShieldCheck } from 'lucide-react';
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
    title: 'Prihvatanje uslova',
    body: 'Korišćenjem ELITE VIP TIPS platforme prihvatate sva pravila, uslove korišćenja i politiku privatnosti navedenu na sajtu.',
  },
  {
    id: 'terms-2',
    title: 'Namenjeno punoletnim osobama',
    body: 'Platforma je namenjena isključivo osobama starijim od 18 godina. Korišćenjem sajta potvrđujete da ste punoletni u skladu sa zakonima vaše države.',
  },
  {
    id: 'terms-3',
    title: 'Odgovorno klađenje',
    body: 'Sportsko klađenje nosi finansijski rizik. Korisnici su odgovorni za svoje odluke i upravljanje budžetom. Nikada ne ulažite novac koji ne možete da priuštite da izgubite.',
  },
  {
    id: 'terms-4',
    title: 'Ne garantujemo profit',
    body: 'ELITE VIP TIPS ne garantuje siguran dobitak niti konstantan profit. Svi tipovi predstavljaju analitičke predloge zasnovane na statistici, iskustvu i proceni tržišta.',
  },
  {
    id: 'terms-5',
    title: 'Informativni karakter sadržaja',
    body: 'Sav sadržaj na platformi služi isključivo u informativne i edukativne svrhe. Korisnik samostalno donosi odluku da li će igrati određeni predlog.',
  },
  {
    id: 'terms-6',
    title: 'VIP članstvo',
    body: 'VIP pristup se aktivira nakon potvrđene uplate i traje u skladu sa izabranim paketom. Deljenje VIP sadržaja sa trećim licima strogo je zabranjeno.',
  },
  {
    id: 'terms-7',
    title: 'Zabrana deljenja sadržaja',
    body: 'Kopiranje, deljenje, prodaja ili prosleđivanje naših tipova, analiza i sadržaja bez dozvole može dovesti do trajnog uklanjanja naloga bez refundacije.',
  },
  {
    id: 'terms-8',
    title: 'Pravo na izmenu sadržaja',
    body: 'ELITE VIP TIPS zadržava pravo izmene sadržaja, tipova, statistike, cena članstva i uslova korišćenja u bilo kom trenutku.',
  },
  {
    id: 'terms-9',
    title: 'Suspenzija naloga',
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
    title: 'Refundacije',
    body: 'Nakon aktivacije VIP pristupa refundacija nije moguća, osim u posebnim slučajevima koje administracija odobri.',
  },
  {
    id: 'terms-11',
    title: 'Tehničke poteškoće',
    body: 'ELITE VIP TIPS nije odgovoran za eventualne tehničke probleme, prekide rada sajta, kašnjenja ili probleme izazvane trećim servisima.',
  },
  {
    id: 'terms-12',
    title: 'Privatnost korisnika',
    body: 'Podaci korisnika se čuvaju poverljivo i neće biti prodavani ili deljeni trećim licima osim ukoliko to zakon nalaže.',
  },
  {
    id: 'terms-13',
    title: 'Kontakt podrška',
    body: 'Za sva pitanja korisnici mogu kontaktirati podršku putem kontakt forme ili email adrese: support@elitetips.com',
  },
];

const disclaimerSections: LegalSection[] = [
  {
    id: 'disclaimer-1',
    title: 'Informativni karakter sadržaja',
    body: 'Sav sadržaj objavljen na ELITE VIP TIPS platformi služi isključivo u informativne, edukativne i zabavne svrhe. Objavljeni tipovi, analize i predlozi ne predstavljaju finansijski savet, garanciju dobitka niti podsticanje na klađenje.',
  },
  {
    id: 'disclaimer-2',
    title: 'Korišćenje na sopstvenu odgovornost',
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
    title: 'Ne garantujemo dobitak',
    body: 'Sportsko klađenje nosi visok nivo rizika i ne postoji sistem koji garantuje profit ili siguran dobitak. Prethodni rezultati i statistika ne predstavljaju garanciju budućih rezultata.',
  },
  {
    id: 'disclaimer-4',
    title: 'Odgovorno klađenje',
    body: 'Korisnici su dužni da se klade odgovorno i u skladu sa zakonima države u kojoj se nalaze. Nikada ne treba ulagati novac koji ne možete da priuštite da izgubite.',
  },
  {
    id: 'disclaimer-5',
    title: 'Punoletstvo korisnika',
    body: 'Korišćenjem platforme potvrđujete da imate najmanje 18 godina ili zakonski minimum za sportsko klađenje u vašoj državi.',
  },
  {
    id: 'disclaimer-6',
    title: 'Nije platforma za klađenje',
    body: 'ELITE VIP TIPS nije kladionica niti organizator igara na sreću. Platforma ne prima uplate za klađenje, ne organizuje klađenje i ne upravlja igrama na sreću. Platforma pruža isključivo analitički i informativni sadržaj.',
  },
  {
    id: 'disclaimer-7',
    title: 'Tačnost informacija',
    body: 'Iako se trudimo da sve informacije budu tačne i ažurne, ELITE VIP TIPS ne garantuje potpunu tačnost, dostupnost ili pouzdanost svih objavljenih podataka, kvota i statistike.',
  },
  {
    id: 'disclaimer-8',
    title: 'Spoljni linkovi i servisi',
    body: 'Platforma može sadržati linkove ka spoljnim sajtovima i servisima. ELITE VIP TIPS nije odgovoran za sadržaj, politiku privatnosti ili rad trećih strana.',
  },
  {
    id: 'disclaimer-9',
    title: 'Pravo izmene',
    body: 'Zadržavamo pravo izmene sadržaja, cena, pravila korišćenja i pravnog odricanja odgovornosti u bilo kom trenutku bez prethodne najave.',
  },
  {
    id: 'disclaimer-10',
    title: 'Ograničenje odgovornosti',
    body: 'U maksimalnoj meri dozvoljenoj zakonom, ELITE VIP TIPS i povezana lica neće biti odgovorni ni za kakvu direktnu, indirektnu, slučajnu ili posledičnu štetu nastalu korišćenjem platforme.',
  },
  {
    id: 'disclaimer-11',
    title: 'Prihvatanje uslova',
    body: 'Korišćenjem sajta potvrđujete da ste pročitali, razumeli i prihvatili sva pravila, uslove korišćenja i ovo odricanje odgovornosti.',
  },
];

const protectionSections: LegalSection[] = [
  {
    id: 'protection-14',
    title: 'Digitalni proizvod',
    body: 'Kupovinom VIP članstva korisnik dobija pristup digitalnom sadržaju, analizama, statistikama i informacijama koje su dostupne odmah nakon aktivacije naloga. Zbog prirode digitalnog proizvoda i trenutnog pristupa sadržaju, refundacija nakon aktivacije članstva nije moguća.',
  },
  {
    id: 'protection-15',
    title: 'Intelektualna svojina',
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
    title: 'Zabrana deljenja sadržaja',
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
    title: 'Deljenje naloga',
    body: 'Jedan VIP nalog može koristiti isključivo jedna osoba. Detekcija deljenja naloga, VPN zloupotrebe, višestrukih simultanih prijava ili sumnjivih aktivnosti može rezultovati trajnom zabranom pristupa platformi.',
  },
  {
    id: 'protection-18',
    title: 'Chargeback i prevara',
    body: 'Svaki pokušaj lažnog chargeback-a, prevare, zloupotrebe platnog sistema ili neovlašćenog povraćaja sredstava smatraće se pokušajem finansijske prevare i može biti prijavljen nadležnim institucijama i payment providerima.',
  },
  {
    id: 'protection-19',
    title: 'Affiliate i partnerski linkovi',
    body: 'Platforma može sadržati affiliate, promotivne ili partnerske linkove ka trećim stranama i servisima. ELITE VIP TIPS ne garantuje usluge, kvote, rezultate, bonuse niti funkcionalnost tih platformi.',
  },
  {
    id: 'protection-20',
    title: 'Promene kvota i tržišta',
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
    title: 'Ograničenje odgovornosti',
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
    title: 'Rezultati i statistika',
    body: 'Prethodni rezultati, prolaznost tipova i statistika ne predstavljaju garanciju budućih rezultata. Sportsko klađenje uključuje visok nivo rizika i rezultati mogu značajno varirati.',
  },
  {
    id: 'protection-23',
    title: 'Odgovorno klađenje',
    body: 'Korisnici su dužni da se klade odgovorno. Ukoliko korisnik pokazuje znake zavisnosti od klađenja, preporučuje se prekid korišćenja platforme i traženje stručne pomoći.',
  },
  {
    id: 'protection-24',
    title: 'Tehnički problemi',
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
    title: 'Viša sila (Force Majeure)',
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
    title: 'Pravo izmene uslova',
    body: 'Zadržavamo pravo izmene cena, VIP paketa, pravila korišćenja, pravnog odricanja odgovornosti, politike privatnosti i sadržaja platforme u bilo kom trenutku bez prethodne najave.',
  },
  {
    id: 'protection-27',
    title: 'Suspenzija i trajni ban',
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
    title: 'Nadležnost',
    body: 'Korišćenjem platforme korisnik prihvata da se svi eventualni sporovi rešavaju u skladu sa važećim zakonima i nadležnostima koje odredi vlasnik platforme.',
  },
  {
    id: 'protection-29',
    title: 'Automatsko prihvatanje uslova',
    body: 'Korišćenjem sajta, registracijom naloga ili kupovinom VIP članstva korisnik automatski potvrđuje da je pročitao, razumeo i prihvatio sve uslove korišćenja, pravila i pravna odricanja odgovornosti.',
  },
  {
    id: 'protection-30',
    title: 'Završna odredba',
    body: 'Ukoliko se bilo koji deo ovih uslova smatra nevažećim ili neprimenljivim, ostali delovi ostaju u punoj pravnoj snazi.',
  },
];

const groups = [
  {
    id: 'disclaimer',
    eyebrow: 'Legal disclaimer',
    title: 'Legal Disclaimer / Pravno odricanje odgovornosti',
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
  {
    id: 'terms',
    eyebrow: 'Pravila korišćenja',
    title: 'Pravila korišćenja',
    description: 'Osnovni uslovi za korišćenje platforme, VIP pristupa, sadržaja i naloga.',
    icon: FileText,
    sections: termsSections,
  },
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
              Pravila korišćenja i pravno odricanje odgovornosti
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-neutral-400 md:text-lg">
              Ova stranica definiše pravila korišćenja, odricanje odgovornosti i dodatne pravne uslove za pristup
              sportskoj analitici, VIP sadržaju i community platformi ELITE VIP TIPS.
            </p>
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
              <div className="sticky top-20 z-20 -mx-2 mb-6 flex flex-col gap-4 rounded-2xl border border-white/10 bg-neutral-950/95 p-3 shadow-xl shadow-black/30 backdrop-blur-xl md:-mx-3 md:flex-row md:items-end md:justify-between md:p-4">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gold-400">
                    <Icon size={16} />
                    {eyebrow}
                  </div>
                  <h2 className="font-display text-2xl font-black text-white md:text-4xl">{title}</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-500 md:text-base">{description}</p>
                </div>
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
