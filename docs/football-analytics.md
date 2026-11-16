# Private football analyzer

Production connection and the approved archive transfer are documented in [analytics-production.md](analytics-production.md). Earlier verification entries below describe the state at the time of those checks, not the current deployment.

The English historical expansion and current verified counts are documented in [historical-analytics.md](historical-analytics.md). Historical analytics do not publish tickets. Broad and historical scheduled imports are now separate opt-in flags and default off.

## Scope and boundaries

React 19 / Vite 8 / Tailwind, lazy route `/admin/analize`, existing Firebase login and server `isAdminRequest`. Guests and ordinary members are rejected before any analytics connection is opened. The standalone admin screen does not mount the old dashboard's Firestore subscriptions. There are no links from public navigation.

Everything under `server/footballAnalytics` uses a separate SQL database. It does not read or write user, payment, ticket, public-index or statistics collections. Elite Ticket, Safe Pick, DailyTips publication, AI and their result workflows are unchanged. Opening the analyzer reads SQL only; catalog discovery, migration and imports require explicit authenticated POST actions. All responses are private/no-store.

## Database and migrations

Local: Node 22.13+ / 24, native SQLite file `.local-data/football-analytics.sqlite` (ignored by Git). It survives application restarts. Production: `pg` and a **dedicated** PostgreSQL connection in `ANALYTICS_DATABASE_URL`. No production fallback to `/tmp`, localStorage, SQLite-in-Vercel or production Firestore is allowed. Without a separate connection, production reports missing configuration; it does not generate sample data.

`server/footballAnalytics/migrations.ts` contains versioned, transactional, portable migrations. Tables: leagues/catalog coverage, checkpointed import items, canonical matches, source links, team aliases, append-only observed versions, unresolved matches and provider status. Initialize once, not during page reads.

Server environment (local ignored `.env.analysis.local`, or Vercel):

```dotenv
PITCHAPI_KEY=
ANALYTICS_DATABASE_URL=
# Optional development-only override:
ANALYTICS_SQLITE_PATH=.local-data/football-analytics.sqlite
# Existing fallback credential, never sent to the browser:
FOOTBALL_DATA_API_KEY=
```

The user-approved replacement key is saved in Vercel as Secret for Production and Preview under `PITCHAPI_KEY`. The existing public Pitch integration on current `main` still uses `PITCHAPI_API_KEY`, so that server-only compatibility alias is preserved with the same replacement value. This analyzer reads only `PITCHAPI_KEY`. Never print credentials or put them under VITE_. The newly issued Pitch key is still a **test key**: analyzer responses are stored with `environment=test`, never promoted into real history. API catalogue access alone does not prove that a test key returns production data.

Production needs a separate PostgreSQL database and its server-only URL. A `pk_live_` Pitch key is needed for Pitch-backed real history; a test key can exercise only the isolated test dataset. The existing football-data.org production secret can be reused on the server; protected secrets need not be downloaded locally.

## Commands and safe resume

```powershell
npm run analytics:migrate
npm run analytics:catalog
# Process bounded batches; default is one step, real data only:
npm run analytics:import -- --provider=openligadb --steps=100
# Explicit isolated test import:
npm run analytics:import -- --provider=pitchapi --environment=test --steps=1
npm run analytics:report
npm run analytics:report -- --coverage
# Resume a particular league/season, using the ID returned by report:
npm run analytics:import -- --id=JOB_ID --steps=20
# Refresh source facts, retaining match IDs and previous observations:
npm run analytics:import -- --id=JOB_ID --steps=20 --refresh
```

Run `npm run dev`, sign in with the existing admin, open `/admin/analize` or Admin → Dnevni raspored. Today/tomorrow/date, league and club search query stored data. Compact match rows open comparison/form/H2H/HT-FT detail; unsupported metrics are hidden rather than fabricated. Source/import controls and coverage are collapsed separately. The coverage section lists actual per-season counts, HT+FT, both-team xG, checked statistics, cursor, error and last synchronization. `unverified` differs from successfully checked `empty`. Test/real selectors are separate; default is real. The shared `Rezultati i H2H` link opens the English historical database at `/admin/historical-analytics`.

Imports checkpoint a season list once, then process at most 50 normal fixtures or 3 Pitch fixtures per request. Detail endpoints are called only in import. Progress is saved after every processed fixture. A five-minute SQL lease prevents overlapping jobs; a failed request resumes at the last successful ordinal. PostgreSQL transaction-scoped identity locks serialize concurrent cross-provider matches. The UI caps an import action at 20 batches and allows cancellation. It never launches an import on mount. SQL upserts preserve known non-null values and append corrections rather than erasing history.

The optional `/api/football-analytics?action=sync` handler reuses `CRON_SECRET`. It is not scheduled in this production release. Broad and historical import flags remain disabled. Enabling a future schedule requires a separate coverage and storage review; it must not publish tips. Existing product/result crons are unchanged.

## Sources, coverage and licensing

- [PitchAPI official reference](https://pitchapi.dev/): catalogue and per-league seasons are discovered, not hardcoded. Current and up to three previous **available** seasons are queued. xG is measured per imported match, never inferred from league membership. Actual responses use lowercase `goal` and sometimes `ShotsOnTarget`; normalization covers these, zero-valued statistics and null absence. Events and shot-level xG are retained. Match-level extra-time stats are not assumed to be regular-time stats.
- [football-data.org documentation](https://docs.football-data.org/general/v4/competition.html): only accessible free competitions are used. A historical season may return 403 even when the competition is free; coverage records it as unavailable. HT, regular time, extra time and shootouts are separated. Attribution is included in the private screen.
- [OpenLigaDB](https://www.openligadb.de/), ODbL: existing supported `bl1`, `bl2`, `bl3` schedules, FT and HT. No xG or red-card coverage is claimed. Missing optional fields stay null.
- [Football-Data.co.uk data-use notice](https://football-data.co.uk/data.php): explicitly excludes automated commercial/data-training use. Its CSV download is **not enabled** for this commercial platform without separate permission. This is not treated as a technical lack of data.

Matching uses provider IDs first, then competition, season, exact normalized home/away identities and a ten-minute kickoff window. Rescheduling with the same source ID updates one canonical record. Ambiguous cross-source/rescheduled matches remain in `fa_unresolved`; no fuzzy automatic merge creates false history. A new source's team aliases are bound only after a verified fixture match. Unknown club-name variants may therefore remain unmerged until reviewed rather than silently joining two clubs.

## Calculations and time safety

Last 5/10 windows are selected **before** checking metric availability. Missing xG in one of five fixtures yields 4/5, not a replacement sixth fixture. xGA is the opponent's xG. Goals-minus-xG uses exactly the fixtures with both values. Separate home/away five-game windows and league/all-competition views are available. Each number opens its contributing fixture list. Extremes show the mean with/without the largest goal total. Penalty and early-red context is shown only for sources that actually supply those event types; OpenLiga goal timelines do not imply card coverage.

H2H uses the same pre-match cutoff. All nine HT/FT combinations use that fixture's home/away orientation and a denominator of complete HT and 90-minute scores only. Extended/shootout scores are not regular-time scores. The rule-based Serbian conclusion includes supporting numbers, contrary/limiting evidence and sample size; it makes no unvalidated confidence claim.

Every material source change creates a version with the time it was **observed**. Historical analysis selects versions observed before the target kickoff, and past opponent strength uses only facts observed before that past match. **A freshly imported old season is not evidence that those exact corrected statistics were known years ago.** Historical views may have an empty strict as-of sample when no old observations exist; no synthetic availability timestamp is backdated. Upcoming-match analysis can use the genuine history already imported today. The UI explicitly shows the cutoff. This conservative rule prevents look-ahead leakage.

## Verification

`npm test`, `npm run lint`, `npm run build`. Dedicated tests use isolated SQLite files/in-memory databases and synthetic unit-test observations only, never production matches. They cover repeated migrations/imports, resume, source deduplication, null-safe corrections, unresolved identities, persistent reopen, 4/5 xG, nine HT/FT outcomes, regular vs extra time, Belgrade DST/day boundaries, unavailable future observations, read-only pages and unauthorized requests. Real import counts must be taken from `analytics:report`, not the test fixtures.

Local tests alone do not prove a production release. The approved hosted-database transfer uses a separate verified bootstrap described in [analytics-production.md](analytics-production.md); migrations are not run during page reads. Do not copy the SQLite file into `public/` or publish raw analytics snapshots.

### Verified local import (12 November 2026)

- Real OpenLigaDB: 3 leagues, 12 completed league/season jobs, 3,968 stored fixtures, 3,285 finished with HT+FT, no xG claimed. Repeating the current 2. Bundesliga season retained the same total fixture count.
- Pitch test catalogue: 77 leagues, 251 league/season jobs. Three fixtures each from Championship, League One and League Two were imported in the isolated test dataset (9 test fixtures with HT and xG); their seasons remain incomplete, not marked fully covered.
- Browser verification: real upcoming fixture, comparison and contributing-match drilldown, persisted refresh, guest API 403 and route redirect, 390px mobile without page overflow, no page errors and no browser-to-provider calls.
- No analytics data were written to production Firestore. The replacement-key redeploy uses the existing production commit, not this undeployed analyzer implementation. A dedicated production PostgreSQL connection is still missing.
