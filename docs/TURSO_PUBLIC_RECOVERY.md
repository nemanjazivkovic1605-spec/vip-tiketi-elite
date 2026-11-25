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
Pre rollback-a potvrditi poslednji aktivni deployment. Ovo vraca aplikaciju,
ne opozvane tokene. Ne vracati kompromitovane tokene, ne brisati snapshot niti
ukljucivati blokirani Neon radi automatskog fallback-a. Sema/podaci drugih baza
nisu menjani ovim release-om.
