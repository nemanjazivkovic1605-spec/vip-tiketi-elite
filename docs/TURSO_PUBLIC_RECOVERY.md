# Javni fudbalski pregled: Turso oporavak

Datum: 25.11.2026. Izolovana grana `codex/turso-public-recovery`, osnova
`origin/main` (`b3499b4`). Originalni worktree sa svim fazama i lokalnim izmenama
ostaje netaknut. Ovaj release ne ukljucuje nepregledane refaktore.

## Obim

- Neon istorijska analitika se ne brise, ne eksportuje i ne menja.
- Firestore korisnici, tiketi, istorija, performanse, naplata i admin ostaju isti.
- Turso cita samo postojecu `fa_public_snapshots` projekciju.
- Provider se bira preko serverskog `PUBLIC_FOOTBALL_READ_PROVIDER`.
- Turso kvar ne pokrece Neon; lokalni javni arhivski fallback ostaje oznacen.
- In-flight deduplikacija, circuit breaker i last-good cache ostaju aktivni.
- Turso transport ima timeout 10 sekundi. Snapshot je gzip/base64, legacy JSON je
  i dalje citljiv; granica raspakivanja je 16 MB.
- CDN odgovori su javni/nepersonalizovani: 1h TTL, 24h SWR, 7d stale-if-error.
  ETag omogucava 304 odgovor; privatne rute se ne menjaju.

## Stvarni raspolozivi podaci

Pre ove rotacije je upisan i procitan jedan Turso snapshot: 3.636 utakmica,
2.837 FT, 2.698 HT i 618 scheduled. Sadrzi lokalnu OpenFootball arhivu i dva
OpenFootball fajla sezone 2026/27. Nema izmisljene statistike niti kvota.
Izvor i SHA ostaju u internim snapshot metapodacima.

Prikupljeno: 844 novih zapisa; 88 duplikata spojeno; 0 konflikata.
JSON: 1.366.362 bajta; skladisteni kompresovani payload: 149.269 bajtova
(89,1% manje). To nije merenje ukupne mesecne potrosnje naloga.

OpenFootball trenutni fajlovi imaju poslednju proverenu izmenu 22.09.2026;
lokalna arhiva je sacuvana 14.11.2026. Uspesno citanje baze NE znaci da su
raspored i rezultati danasnji. Nizi rangovi i nedostajuci rezultati nisu dopunjeni
neproverenim podacima. Football-Data CSV arhiva nije javno uvezena jer komercijalna
prava redistribucije nisu potvrdjena.

## Bezbednost i konfiguracija

Vercel Production koristi namenski read-only token; Development poseban token.
Stari tokeni opozvani su po odobrenju vlasnika. Nijedan token nije u kodu/Git-u.
Preview/lokalni runtime ne nasledjuju produkcione Turso vrednosti.
Ovaj release ne dodaje Vercel funkcije niti aktivira sinhronizaciju ili seed.

## Lokalne provere

- `npm test`: 247 PASS, 0 FAIL, 0 SKIP.
- `npm run lint`: PASS.
- `npm run typecheck:api`: PASS.
- `npm run build`: PASS; 7 prerender stranica bez DB/pristupa mrezi.
- `git diff --check`: PASS.
- `npm audit --omit=dev`: 9 MODERATE, 0 HIGH/CRITICAL. Nasledjene putanje
  Firebase Admin/Google Cloud/uuid i csv-parse; major nadogradnje nisu deo oporavka.
- Vite upozorenja o buducem native config loader-u nisu build greske.
- Audit stvarnih funkcija izvrsiti tek posle `vercel build --prod`.

## Aktiviranje i rollback

Prvo staged production deployment sa `--prod --skip-domain`; domen ostaje na
prethodnoj verziji do verifikacije. Proveriti `X-Data-Provider: turso`, broj zapisa,
stvarne lige/rezultate, ETag, history/stats/home, zakljucavanje i SEO putanje.

Kod regresije: `vercel rollback <prethodni-deployment-id>` iz istog projekta/tima.
Prethodni poznati deployment: `dpl_GxijDeM5Z5uJfs1S5Kpm1RnD8SvP`.
Pre rollback-a potvrditi poslednji aktivni deployment i rollback candidacy.
Ako stara verzija vise nije rollback kandidat, `vercel promote` moze vratiti
eksplicitno izabrani, postojeci READY produkcioni deployment bez rebuild-a.
Rollback nije izvrsavan nad aktivnom produkcijom tokom provere. Ovo vraca aplikaciju,
ne opozvane tokene. Ne vracati kompromitovane tokene, ne brisati snapshot niti
ukljucivati blokirani Neon radi automatskog fallback-a. Sema/podaci drugih baza
nisu menjani ovim release-om.

## Zavrsna produkciona verifikacija, 26.11.2026.

- GitHub `main` i `codex/turso-public-recovery`: `36434864aef559daded000634d55bc73be66b305`.
- Staged deployment `dpl_4L8NFXfTbt9wxbN6esL8YqfLHrmU` je prvo proveravan
  bez promene domena, zatim promovisan. Posle fast-forward-a GitHub main-a,
  Vercel je iz istog commita napravio aktivni Git deployment
  `dpl_HVbGpubVMFAJ4MGPkM2WHTd1TvHx` (READY).
- Aktivni domen `eliteviptips.com` potvrdjen je na tom deploymentu.
- Stvarni remote build ima 9 lambda funkcija, 3 slobodna mesta do Hobby limita 12;
  `api/football-analytics` bundle staged builda je 5,17 MB.
- Lokalni Vercel builder nije prosao zbog Windows EPERM symlink zabrane u CLI
  kesu. Ne predstavljati ovu proveru kao PASS; remote build jeste PASS.
- Production `/fudbal` i public API imaju `X-Data-Provider: turso`,
  `X-Snapshot-Records: 3636`, verziju
  `16644f8ae9b5766663fa79b35ca35fe6cd583837f487753dd610156e18281391`.
- Stvarne lige: Championship 1.630, League One 813, League Two 813,
  Premier League 380. Nepoznati HT/FT ostaju null; uzorci nisu kompletni.
- `/fudbal`, public API, pocetna, `/history`, `/stats`, robots i sitemap
  vracaju odgovarajuci sadrzaj. `/fudbal` nema public noindex zaglavlje;
  JSON API namerno ostaje noindex. Istorija/performanse ucitane su i u browseru.
- Anonymous private analytics status zahtevi su 403/private,no-store.
- CDN HIT i If-None-Match 304/0 bajtova potvrdjeni su na glavnom domenu.
- Development token je posle rotacije stvarno proveravan: konekcija, jedna
  tabela/cetiri kolone/jedan indeks, jedan snapshot, 149.269 bajtova, ista verzija.
  Izolovani TEMP TABLE write/read test je PASS, persistentDataChanged=false.
- Ciljani testovi u originalnom worktree-u nakon prenosa popravki: 21 PASS.
- U posmatranom 30-minutnom produkcionom prozoru nema error/fatal runtime logova;
  to nije garancija odsustva svih gresaka ili potvrda celog meseca.
- Nisu izvrsene probne kupovine, admin ticket writes, Neon eksporti, Firestore
  migracije niti menjanje rules. Browser sesija je kasnije bila admin; ne
  predstavljati tu daily-tips proveru kao novi guest lock test.

## Preostale granice

Privatna napredna analitika i dalje zavisi od Neona. Javna projekcija nije
migracija cele istorijske baze. Izvor nema sveze rezultate posle septembra 2026,
a nizi engleski rangovi nisu potpuno pokriveni. CSV prava ostaju blokada za javni
uvoz arhive. Mesecna Turso potrosnja nije izmerena: dokazani su payload velicina,
kes i ograniceni broj poziva, a ne garantovana mesecna usteda. Nije bilo placenih
aktivacija niti DNS izmena.
