# Javni fudbalski pregled i Match Finder

## Odvajanje podataka

Javne stranice koriste iskljucivo rezultate i raspored iz OpenFootball (CC0) i
OpenLigaDB (ODbL). Polja se proveravaju prema sopstvenom poreklu: otvoreni izvor
na spojenom zapisu ne cini ostala polja tog zapisa javnim.

Privatna CSV arhiva Football-Data.co.uk, kvote, predlozi, analize, pristupni
podaci i admin funkcije nisu deo javnog modela. Postojeci Firestore tiketi,
istorija tipova, naplata i VIP pravila nisu promenjeni.

Javni podaci su pripremljeni u jednoj SQL tabeli `fa_public_snapshots`, zapis
`football-v1` (migracija 4). To nije nova baza utakmica: zapis je bezbedna
projekcija postojecih/dozvoljenih izvornih podataka. Privatna istorija ostaje u
postojecim `fa_*` tabelama. Nema javnog pristupa tim tabelama.

## Rute i SEO

- `/fudbal`: raspored, rezultati, uzorci i svih devet HT/FT prelaza.
- `/match-finder`: GET pretraga po ligi, datumu, timu, formi, golovima i preokretima.
- `/fudbal/lige/:slug`: liga, sezone, agregati i rezultati u stranicama po 30.
- `/fudbal/utakmice/:id`: poznati rezultati, forma poslednjih 10 i raniji H2H.
- `/timovi` i `/statistika/:slug`: javni imenik timova i pojedinacni profili sa
  stvarnom formom, golovima, sezonama i pravilno pripisanim preokretima.
- `/h2h` i `/h2h/:first/:second`: samo parovi koji vec imaju zabelezene javne
  susrete; obrnuti redosled timova preusmerava na jednu canonical adresu.
- `/analize-danas`: raspored i istorijski pokazatelji za danas po vremenu Srbije.
  To nije otkljucavanje privatnih predloga, kvota ili VIP AI analiza.
- `/lige/:slug` i `/utakmice/:id`: kompatibilni 301 alias-i ka postojecim
  canonical adresama; ne prave duple stranice u sitemap-u.
- `/sitemap.xml` i `/robots.txt`: stvarni XML/TXT resursi, ne SPA fallback.

Ove fudbalske stranice vracaju serverski renderovan HTML, jedinstvene naslove,
canonical/description/OG metapodatke i strukturirane podatke. Nije potreban
Firebase ili React app bundle u browseru. Filtrirane URL varijante i interna
pretraga imaju `noindex,follow`; osnovne lige i utakmice su indeksabilne.
Sitemap je sada indeks sa segmentima do 1.000 URL-ova za javne stranice,
lige, timove, postojece H2H parove i sve utakmice iz pripremljenog javnog
snapshot-a. Nema vise ogranicenja na poslednjih 600 utakmica. H2H par bez
poznatog zavrsenog susreta nije u sitemap-u. `checkedAt` se ne predstavlja kao
datum materijalne izmene sadrzaja: ne generisu se lazni `lastmod` datumi.

Pocetna, kontakt, FAQ, pravila i tri postojece informativne stranice koriste
build-time prerender istih React komponenti. Komponente se razresavaju pre
renderovanja, tako da nema skrivenih Suspense segmenata ni zavisnosti od JS-a
za osnovni sadrzaj. Browser hidrira isti prikaz; lazy loading ostaje na snazi.
Build ne pristupa mrezi, Firestore-u ili sportskim API-jima. Privatni server
prerender bundle ostaje van `dist` i nije nova Serverless funkcija.

History/Stats racunanje i read-only javni datasource ostaju nepromenjeni.
Ne pravi se lazni statisticki snapshot tokom build-a. Njihovi HTML shell-ovi
imaju sopstvene metapodatke; interaktivni podaci se i dalje ucitavaju iz
postojecih javnih indeksa. Nepoznat produkcijski URL vraca pravi 404/noindex,
a poznate SPA, admin, auth i API rute ostaju dostupne. Ovaj javni sistem i
dalje deli postojecu funkciju: ukupno ostaje devet API entrypoint-a.

Google indeksiranje nije trenutno niti garantovano. DNS zapis sa prefiksom
`google-site-verification` postoji (provereno 22.11.2026), ali sam zapis nije
potvrda vlasnickog statusa, predatog sitemap-a ili obima indeksiranja u Search
Console-u. To zahteva pristup vlasnickom Google nalogu. Za HTML metod postoji
opciona build promenljiva `GOOGLE_SITE_VERIFICATION`; unosi se samo stvarni
HTML token koji Google izda, nikada kopija DNS tokena ili lozinka.

## Statisticka pravila

Forma je procenat osvojenih bodova u stvarnom uzorku poslednjih 5 ili 10
zavrsenih utakmica pre izabranog meca. Nepoznato nije nula. Ako redosled
utakmica istog dana nije poznat, ne koristi se kao prethodna forma.

Filter forme trazi prag bar jednog tima; Over 2.5/GG prag mora ispuniti svaki
tim. Statisticki filteri zahtevaju izabrani minimalni uzorak oba tima.
Preokreti imaju poseban HT/FT imenilac. Pretraga obuhvata najvise sedam dana
odjednom, unutar narednih 30 dana. Predstojeci raspored i istorijski rezultati
imaju odvojenu paginaciju. Nema prognoziranih procenata pouzdanosti.

Ako izvor nema dokumentovanu vremensku zonu, prikazuje se izvorni termin uz
jasnu napomenu; ne izmislja se UTC timestamp. Poznati UTC termini prikazuju se
u `Europe/Belgrade`. Nepoznat HT/FT, nepotpuni uzorci i nepokrivene lige jasno
su oznaceni.

## Read-only javni tok

Radi ogranicenja Hobby plana na 12 funkcija, public handler je izdvojen u
`server/publicFootball/http.ts`, ali deli postojecu Vercel funkciju
`api/football-analytics.ts`. Rewrite dodaje `public=1`; takav zahtev zavrsava
iskljucivo u zasebnom GET/HEAD handleru. Ne moze pozvati admin akciju. JSON
alias `/api/public-football` ne pravi trinaestu serverless funkciju.
`npm run build` prvo priprema serverski `view.js` iz TSX izvora pomocu postojeceg
esbuild-a i proverava njegov import u obicnom Node.js procesu. Ovo je potrebno
jer Vercel-ov Node tracer ne razresava `.js` alias ka `.tsx` izvoru. Generisani
fajl nije client bundle i ne cuva se u git-u. Privatni API ucitava public
handler tek kada dobije javni zahtev, pa problem tog prikaza ne blokira admin.

Javni handler dozvoljava GET/HEAD, cita jedan pripremljeni SQL zapis i ne zove
sportske API-je. U memoriji deli paralelna ucitavanja (TTL 5 minuta), a CDN
koristi 5 minuta cache-a i do 30 minuta stale-while-revalidate. Odgovor sadrzi
samo potrebnu stranicu, ne kompletan snapshot. Greska baze vraca 503/no-store,
ne laznu praznu listu. Nijedna nova javna stranica ne radi Firestore upise.

## Kontrolisani uvoz i dnevni sync

CLI `npm run football:public -- plan` je podrazumevano dry-run. Prvi bootstrap:

```text
npm run football:public -- plan
npm run football:public -- write --confirm=<fingerprint>
npm run football:public -- status
```

Nakon bootstrap-a koristiti samo incremental tok:

```text
npm run football:public -- sync-plan
npm run football:public -- sync-write --confirm=<fingerprint>
```

Plan i potvrda moraju biti identicni. Skripte traze server-side SQL konekciju;
ne stavljati URL baze u VITE promenljive ili git. Produkcijski Secret se ne
preuzima komandom `vercel env pull`.

`PUBLIC_FOOTBALL_SYNC_ENABLED=true` omogucava samo ovaj ograniceni sync.
Postojeci siri `ANALYTICS_SYNC_ENABLED`, `HISTORICAL_ANALYTICS_SYNC_ENABLED` i
`HISTORICAL_ANALYTICS_WRITE_ENABLED` ostaju iskljuceni.

Vercel cron `/api/football-analytics?action=sync`, `17 5 * * *`, pokrece se
jednom dnevno uz postojeci `CRON_SECRET`. To je oko 06:17 zimi i 07:17 leti po
vremenu Srbije; Hobby plan ne garantuje preciznost u minut. Postojeci cron-ovi
za tikete i rezultate nisu menjani. Rucni admin POST `public-sync-plan` i
`public-sync-write` zahtevaju postojecu admin autorizaciju i fingerprint.

Obuhvat: trenutna sezona, pet engleskih i tri nemacke lige; poslednjih 7 do
narednih 7 dana. Ako izvor nije dostupan, njegovi stari podaci se ne brisu.
Budzet: najvise 200 promenjenih utakmica, procena do 2.500 SQL upisa i rezerva
prostora do 930 MB. Provider deo ima ograniceno ukupno trajanje. Canonical
izmene i javni snapshot upisuju se u jednoj transakciji, sa zakljucavanjem
verzije. Dnevni checkpoint i lease sprecavaju duple/paralelne sync-ove.
Zabelezen delimiacan uspeh ne ponavlja se automatski istog dana.

## Izvori i ogranicenja

- OpenFootball: https://github.com/openfootball/football.json/blob/master/LICENSE.md
- OpenLigaDB: https://www.openligadb.de/lizenz
- OpenLigaDB uslovi: https://www.openligadb.de/nutzungsbedingungen

Attribution je vidljiv u footer-u. Logotipi timova nisu preuzimani jer nisu
obuhvaceni ovom dozvolom. Nema automatskog preuzimanja Football-Data.co.uk
arhive ili njenog javnog redistribuiranja. Pokrivenost nije predstavljena kao
kompletna i ne ukljucuje izmisljene rezultate za nedostajuce lige.
