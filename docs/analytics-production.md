# Elite Analytics: produkciona baza

## Odobrena konfiguracija

- Postojeći projekat: `vip-tiketi-elite`, domen `eliteviptips.com`.
- Zasebna Neon PostgreSQL baza `elite-analytics`, Frankfurt, besplatni plan `free_v3`.
- Verifikovan TLS. Runtime koristi isključivo server-side `ANALYTICS_DATABASE_URL`, sačuvan kao Vercel Secret za Production.
- Nisu menjani Firebase Auth, Firestore kolekcije/rules, tiketi, naplata ili javna statistika.
- Nisu dodati novi automatski poslovi niti aktiviran plaćeni plan.

## Potvrđen prenos 16. novembra 2026.

Iz postojeće lokalne SQLite baze preneto je svih 17 analitičkih tabela. Provera broja redova i SHA-256 kontrolnih vrednosti potvrđuje isti sadržaj svake tabele; izostavljeni su izolovani testni zapisi.

| Podatak | Broj |
| --- | ---: |
| Stvarne utakmice | 155.431 |
| Završene utakmice | 153.880 |
| Poznat HT i FT | 153.723 |
| Zastupljene lige u utakmicama | 23 |
| Istorijski zapisi kvota/statistike | 148.762 |
| Vrednosti izvornih kvota u arhivi | 8.069.372 |
| Obrađeni CSV fajlovi | 434 |
| Provereni redovi u 17 tabela | 634.813 |
| Veličina PostgreSQL baze posle prenosa | 848.601.088 bajtova |
| Firestore upisi u ovom prenosu | 0 |

Arhivske kvote nisu interne EliteVIPTips kvote. Poznate činjenice nisu prepisivane, postojeći lokalni fajl i backup ostaju sačuvani. Sadržaj Football-Data.co.uk arhive ostaje privatan; pre daljeg komercijalnog korišćenja potrebno je proveriti dozvolu izvora.

Besplatni plan trenutno ima 1 GB prostora. Ostavljena je rezerva, ali dalji veliki backfill zahteva nov dry-run i proveru slobodnog prostora. Skripta prekida prenos pre svoje granice od 930 MB i nikada ne aktivira plaćeni plan.

## Privatni pristup

Posle objave koda postojeći administrator otvara **Admin -> Elite Analytics**:

- `/admin/historical-analytics`: rezultati, statistika i H2H engleskih liga.
- `/admin/htft`: HT/FT rang-lista, prelazi i istorija timova.
- `/admin/analize`: pregled kompletne baze i sačuvanog rasporeda.

Rute su lazy-loaded i zaštićene postojećom admin proverom. API `/api/football-analytics` proverava Firebase administratorski token pre otvaranja SQL konekcije. Odgovori su `private, no-store`. Gost i običan korisnik nemaju pristup arhivi.

Engleski HT/FT prikaz namerno obuhvata sezone 2023/24–2026/27: 9.701 utakmica, od kojih 8.780 ima HT i FT, u 5 od 11 ciljnih liga. Postoji 266 prelaza 2/1 i 208 prelaza 1/2. Coventry City FC ima 7 napravljenih 2/1; Aston Villa FC i Barnet imaju po 5 napravljenih 1/2 u ovom uzorku. Rangovi 6 i 7 nisu proglašeni pokrivenim. Nedostajući podaci i nepoznata vremenska zona ostaju označeni, ne izmišljaju se.

Read-only provera za period 16–22. novembar pronašla je 22 sačuvane buduće utakmice. To nije tvrdnja da je raspored svih nižih liga kompletan.

## Automatski upisi ostaju isključeni

Production konfiguracija:

```dotenv
ANALYTICS_DATABASE_URL=<Vercel Secret>
ANALYTICS_SYNC_ENABLED=false
HISTORICAL_ANALYTICS_WRITE_ENABLED=false
HISTORICAL_ANALYTICS_SYNC_ENABLED=false
```

Pregled stranice samo čita sačuvane podatke. Nema uvoza pri mount-u, promene taba ili refresh-u. Za budući uvoz potreban je zaseban potvrđen plan i eksplicitna admin/CLI akcija. Postojeći cron poslovi za tikete nisu menjani.

## Provera i bezbedan nastavak

Skripta `scripts/deploy-analytics-data.ts` podrazumevano radi dry-run. `write` zahteva originalni fingerprint, `--allow-large` i, kod prekida, `--resume`. Paketi imaju najviše 400 redova; primarni ključevi, transakcioni checkpoint i kontrolne vrednosti sprečavaju duplikate i nepotpun prenos. Direktna konekcija se koristi za bootstrap/session lock, pooled konekcija za runtime.

```powershell
node --import tsx scripts/deploy-analytics-data.ts dry-run
node --import tsx scripts/deploy-analytics-data.ts verify
```

Komande zahtevaju server-side SQL konekciju. Vercel Secret se ne vraća kroz lokalni env pull; to nije znak da nije dostupan deployment-u. Ne menjati ga u javnu `VITE_` promenljivu. Plan i potvrda se nalaze u ignorisanom `.local-backups` direktorijumu. Ponovna verifikacija ne vrši SQL ili Firestore upise.

Provere: `npm run lint`, `npm run analytics:archive:check`, `npm test`, `npm run build`, stvarni PostgreSQL read modeli, paginacija bez preklapanja i provera svih 17 tabela.
