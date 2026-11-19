# Revizija funkcionalnosti: 18-19. novembar 2026.

## Obim i bezbednost

Pregledani su Vite/React rute, API handleri, Firestore i SQL servisi, produkcijska
Vercel konfiguracija, bounded automation evidencija i postojeci testovi.
Nije pokrenut masovni Firestore sync, testna objava tiketa niti naplata.
Nijedan API kljuc, korisnicki nalog ili privatna analiza nisu deo ovog izvestaja.

## Nalazi i primenjene ispravke

| Oblast | Zateceno stanje | Resenje / ogranicenje |
| --- | --- | --- |
| Javni football pregled | Postojao je privatni analizator, bez zasebnog javnog sloja | Javni SSR pregled iz dozvoljene projekcije, bez admin funkcija |
| SEO | Glavne rute vracale su isti mali SPA HTML sa generickim naslovom | Centralni SPA metapodaci; novi league/match pregledi vracaju stvarni serverski HTML |
| Sitemap/robots | `/sitemap.xml` i `/robots.txt` vracali su HTML SPA shell | Pravi XML sitemap i TXT robots |
| Raspored i pretraga | Privatni raspored nije bio guest Match Finder | Nova javna pretraga sa ogranicenjem perioda, uzorkom i paginacijom |
| Privatna arhiva | 155.431 stvarna utakmica, 148.762 privatna CSV snapshot-a kvota | Arhiva ostaje privatna; ne objavljuju se automatski sva polja |
| Poreklo podataka | Spojeni zapisi mogu imati polja vise razlicitih izvora | Sanitizacija po poreklu svakog polja, ne samo po listi izvora |
| SQL osvezavanje | Siri sync je namerno iskljucen; poslednje provere su bile 15.11. | Poseban ograniceni dnevni public sync sa dry-run planom i atomic commit-om |
| Firestore trosak | Raniji rizik masovnih index write operacija | Novi javni pregled ne koristi Firestore i ne radi upis pri pregledu |
| Vercel Hobby | Produkcijski deploy odbio trinaestu serverless funkciju | Public handler izdvojen kao modul u postojecoj funkciji, sa zasebnim read-only rutiranjem; nema Pro nadogradnje |
| SSR runtime | Lokalni Vite je razresavao `.js` -> `.tsx`, produkcijski tracer nije | Build pravi i native-Node proverava serverski JSX bundle; public handler se ucitava odvojeno od privatnog API-ja |

## Proverene produkcijske automatizacije

Read-only provera ogranicena je na 15 poslednjih automation logova i sest
dnevnih manifest dokumenata, bez citanja cele Firestore baze.

- Objavljivanje proizvoda 16, 17. i 18.11. ima uspesne manifest zapise za
  Elite Tiket i Safe Pick. Dnevnici 18.11. beleze oba proizvoda u 08:44 UTC.
- Dnevni singl manifesti imaju po jedan FREE i dva VIP tipa za proverene dane
  17-19.11. Ne dodavati drugi paralelni publisher.
- Obrada rezultata ima stvarne WON/LOST/PENDING promene u istoj evidenciji.
- Sest poslednjih GitHub Actions izvrsavanja za rezultate bilo je uspesno.
  Registrovana satnica je cesca od stvarno primecenih izvrsavanja; provereni
  intervali su bili od nekoliko sati. Ne obecavati precizan polucasovni cron.
- Vercel `daily-picks` i `daily-results` konfiguracije ostaju nepromenjene.
- Novi SQL public sync je dodat tek nakon dry-run provere izvora i budzeta.
  Rucni potvrdeni sync 19.11. uspesno je dopunio 18 javnih zapisa uz nula
  canonical izmena i nula Firestore upisa. Checkpoint je `partial` zato sto tri
  lige nemaju izvor tekuce sezone, a ne zbog neuspelog upisa.
- Zakazano izvrsavanje novog cron-a tek treba posmatrati narednog dana; samo
  prisustvo konfiguracije nije dokaz buduceg izvrsavanja.

## Dostupni podaci i praznine

Pocetna javna projekcija ima 11.977 utakmica u 8 liga. Nakon incremental
provere ima 11.995. Obuhvat privatne arhive nije jednak javno dozvoljenom
obuhvatu. Pri bootstrap-u izostavljeno je 158 spojenih zapisa sa ogranicenim
poreklom identitetskih polja; dozvoljen izvor se proverava nezavisno.

Potvrdjeni javni skupovi ukljucuju Premier League, Championship, League One,
League Two, National League i tri nemacke lige. Tekuca sezona OpenFootball
rasporeda dostupna je za Premier League i Championship. Za League One,
League Two i National League trenutno postoje istorijski podaci, ali nema
potvrdjenog javnog rasporeda 2026/27. Engleski rangovi 6/7 nisu proglaseni
pokrivenim. Nepoznat HT, FT i vremenska zona ostaju nepoznati.

## API konfiguracija i placeni izvori

Vercel metadata potvrduje prisustvo server-side konfiguracije za PitchAPI,
API-Football, Football-Data.org, The Odds API i Gemini. Produkcijski Secret-i
nisu dostupni lokalnom `env pull` procesu; to nije dokaz da kljuc nedostaje.
Admin-only `GET /api/football-analytics?action=health` radi bounded health
proveru u stvarnom runtime-u i ne vraca kljuceve ili privatne podatke.

- OpenLigaDB: stvarni current-season zahtev HTTP 200; besplatan/dozvoljen uz attribution.
- OpenFootball: stvarni current-season zahtev HTTP 200; CC0, bez API kljuca.
- PitchAPI: testni kljuc se nikada ne prihvata kao dokaz stvarnih public podataka.
- API-Football / Football-Data.org: obim i istorija zavise od postojeceg naloga,
  dozvoljenih takmicenja i kvote; novi public tok ne zahteva placeni paket.
- The Odds API: health koristi katalog sportova, ne trosi odds kredite.
  Automatika tiketa i dalje zavisi od postojecih kredita za stvarne kvote.
- Football-Data.co.uk CSV: postojeca privatna arhiva se cuva, ali nije dozvoljena
  za neograniceno javno redistribuiranje ili novi komercijalni auto-download.
- Gemini: provera konfiguracije bez generisanja sadrzaja tokom revizije.
- Neon: ostaje Free plan. Postojeca baza zauzimala je oko 849 MB pre javne
  projekcije; novi upisi imaju izricitu rezervu ispod besplatnog ogranicenja.

Nije aktiviran placeni API/hosting. Detalji ogranicenja izvora:
`docs/public-football.md`.

## Provere

- `npm test`: 176 testova, ukljucujuci postojece auth/pristupne,
  purchase, auto-publication, result i nove public/sync testove.
- `npm run lint`, `npm run analytics:archive:check`, `npm run build`: obavezni
  release gate-ovi; finalni rezultat se proverava pre objave.
- Browser: guest pregled, statisticki filter (44 -> 2), stranica utakmice,
  sezonski izbor, paginacija, mobilni viewport 390 px i konzola bez gresaka.
- Novi football pregledi ne ucitavaju Firebase niti admin/client app bundle.

Nisu menjane Firestore security rules, cene, VIP/FREE dozvole, registracija,
naplata, AI promptovi niti racunanje statistike objavljenih tiketa. Slanje
pravih verifikacionih/reset emailova i kupovina nisu ponavljani nad
produkcijskim korisnicima tokom ove revizije.
