# Historical Football Analytics Engine

## Scope and audited baseline (14 November 2026)

This is an extension of the existing private football analyzer, not ticket history, a new prediction system or an AI integration. The working branch includes current main through `c387d7d`; existing daily publication, product purchases, VIP/FREE permissions, result settlement, prices and public ticket statistics are unchanged.

Read-only production audit used three aggregate count queries, not full collection downloads: `openfootballMatchHistory=0`, `tickets=1092`, `dailyAnalyses=111`. The existing checked-in `data/match-history/england.json` contains 2,792 results across seven datasets, including 2,653 HT scores; having this file did not mean it had been imported into Firestore. Before this task the isolated SQL analyzer had 3,968 real German fixtures and nine English **test** fixtures. Test records never count towards real coverage.

## Storage decision

Reuse the existing separate SQL database: native SQLite locally and a dedicated PostgreSQL connection for deployment. This avoids consuming the site's Firestore daily write quota or maintaining two divergent football archives. The requested logical collections are separate tables: `fa_matches` (matches), `fa_teams` and `fa_aliases` (clubs/identities), `fa_leagues` (competitions), `fa_providers`/`fa_sources` (sources), `fa_historical_checks` (dataset checks), `fa_import_runs` (import status/errors), `fa_import_locks` (concurrency) and `fa_versions`/`fa_unresolved` (corrections/quarantine).

No existing Firestore collection is overwritten or deleted. There are **zero Firestore writes** in this engine. `scripts/import-match-history.mjs` now forwards the existing repository snapshot through the same canonical importer and dry-run policy instead of starting a second Firestore archive. Existing remote archive documents, if added separately, remain untouched.

`server/footballAnalytics/migrations.ts` adds schema version 2. Migrations are explicit administrative actions, never a side effect of opening a page. Local database backup before migration: `.local-backups/football-analytics-before-historical-2026-11-14.sqlite`.

## Target and actual coverage

The catalogue contains eleven distinct competitions, not seven: Premier League, Championship, League One, League Two, National League, National League North/South, Isthmian Premier, Northern Premier, Southern Premier Central/South. Four seasons, 2023/24 through 2026/27, produce 44 target datasets.

The verified local backfill created **8,167** records in five leagues and seventeen datasets. **6,849** have a reported final score; **6,649** have both HT and regular-time FT. There are 200 finished matches with missing HT, 1,318 records without FT (including future fixtures), 266 without a wall-clock time, and 8,167 without a source-confirmed timezone. Fifteen ambiguous additional fixtures are quarantined, not counted as duplicate matches or included in statistics. The source validator rejected 541 out-of-season/invalid rows and skipped twelve duplicate source rows.

Repeating the full dry-run after import returned `create=0`, `update=0`, `unchanged=8167`, `unresolved=15`, `firestoreWrites=0`. The import run ID is `5281c327-f9ff-4b8e-b81b-1c9c54613a05`.

| Competition | Records | Finished FT | HT + FT | Available season datasets |
| --- | ---: | ---: | ---: | ---: |
| Premier League | 1,520 | 1,158 | 1,131 | 4 |
| Championship | 2,208 | 1,710 | 1,631 | 4 |
| League One | 1,380 | 1,327 | 1,281 | 3 |
| League Two | 1,656 | 1,338 | 1,290 | 3 |
| National League | 1,403 | 1,316 | 1,316 | 3 |
| Levels 6/7, all six regional competitions | 0 | 0 | 0 | 0 |

Coverage is deliberately **partial**. No free permitted automatic source has been confirmed for levels six/seven. For 2026/27 the tested OpenFootball files cover only Premier League and Championship. The dashboard lists the other datasets as uncovered/unverified; it never labels the entire pyramid complete. A 100% known-HT percentage means all imported finished matches have HT, not that all season fixtures are present.

## Source and permission audit

- [OpenFootball England](https://github.com/openfootball/england) and [football.json](https://github.com/openfootball/football.json): [CC0 licence](https://raw.githubusercontent.com/openfootball/england/master/LICENSE.md). Read structured JSON from the official repository first, then the project's generated England JSON. The existing repository snapshot is an offline fallback, not an invented substitute. The two JSON distributions differ in completeness; every dataset records its actual URL, row count and check time.
- [PitchAPI reference](https://pitchapi.dev/): configured local credential is a test key. Real imports require a `pk_live_` credential and a catalogue/season match. Test payloads/fixtures are excluded even if a credential is mislabeled. This historical path does not fetch xG, shots, player or AI endpoints.
- [football-data.org coverage](https://www.football-data.org/coverage): Premier League/Championship are candidates according to the actual credential's access. Historical seasons are not assumed accessible. Missing credentials skip the provider; rejected access is reported, not replaced with fabricated rows.
- [Football-Data.co.uk](https://football-data.co.uk/data.php): automated commercial use is explicitly excluded without permission, so no download adapter was added.
- [Football Web Pages API](https://www.footballwebpages.co.uk/api): its free access is restricted to official non-league club websites. It is not automatically used for this commercial platform.
- FA Full-Time and other regional web pages: no bulk commercial permission has been established; no scraping adapter was added. Use a properly licensed CSV/JSON export instead.

## Dates, nulls and integrity

Match fields include identity, league/tier, season, home/away, match date, wall-clock time, optional UTC kickoff, HT, FT, status, source URL and last verification. An archive without a documented timezone keeps `kickoffAt=null`, `timeZone=null` and the original `matchDate`/`matchTime`. No midnight/15:00 kickoff is invented. HT/FT values stay null when absent, including 0-0 games with unreported HT. A date outside July-to-June season boundaries is rejected rather than silently repaired. Invalid/negative/fractional scores, future final results, HT greater than FT and conflicting identities are rejected/quarantined.

Source IDs are stable across reschedules. Verified same-date/teams/league/season cross-provider matches share a canonical ID; ambiguous rematches remain unresolved. Known English name aliases and verified provider aliases normalize clubs. There is no fuzzy automatic merge of unrelated clubs. Source changes append observed versions, while missing incoming fields do not erase known scores.

## Import and incremental controls

All page reads use stored SQL only. Sports requests happen only on an explicit dry-run/import or the separately enabled historical sync. JSON responses are cached for fifteen minutes and in-flight requests are coalesced. Calls are spaced per host (football-data.org: 6.5 seconds), timed out, and retried at most twice for transient failures. `Retry-After` is respected; longer waits return a resumable failure rather than a request storm. Errors and unavailable sources are distinguished from proven missing coverage.

Dry-run uses a read-only in-memory identity view of the stored matches and stages proposed identities there. It executes no SQL mutations and no Firestore writes, including for overlapping inputs within the plan. The fingerprint covers normalized source facts and current change counts. Applying a different/stale plan fails. The normal limit is 500 matches per confirmed action; a larger local import needs `--allow-large` or the explicit admin checkbox. Production additionally requires an opt-in environment flag. A lease serializes overlapping imports; per-match transactions and the run ledger preserve progress after partial failure. Replan to resume; existing matches remain idempotent.

```powershell
npm run analytics:history -- migrate
npm run analytics:history:plan -- --league=league-two --season=2024/25 --provider=openfootball
npm run analytics:history:import -- --league=league-two --season=2024/25 --provider=openfootball --write --confirm-plan=FINGERPRINT --allow-large
npm run analytics:history:report
# Default import is still dry-run:
node scripts/import-match-history.mjs
# Current-season-only plan:
npm run analytics:history:plan -- --incremental --league=championship
```

For a permitted manual file:

```powershell
npm run analytics:history:plan -- --league=national-league-north --season=2025/26 --file=PATH.csv --source-name=LICENSED_SOURCE --rights-confirmed
```

CSV columns: `id,date,time,homeTeam,awayTeam,htHome,htAway,ftHome,ftAway,status,kickoffAt`. The downloaded template contains headers only, not demo matches. JSON accepts an array or `{matches:[...]}` and also accepts `team1/team2` with `score.ht/score.ft`. A timezone-aware ISO `kickoffAt` is optional. File maximum: 2 MB and 5,000 rows; quoted CSV is parsed with `csv-parse`, not string splitting. Liga/sezona and permission confirmation are mandatory.

## Private dashboard and calculations

`Admin -> Rezultati i H2H`, route `/admin/historical-analytics`, reuses the existing Firebase role/verified-session gate and server `isAdminRequest`. Unauthorized requests are rejected before SQL is opened. Responses are private/no-store. The route is lazy-loaded; the server, CSV parser and database libraries are not imported into the client bundle.

Filters: league, rank, season and team. A desktop league sidebar becomes a select on mobile. Separate views show `Utakmice`, `Statistika`, `Klubovi / H2H` and `Baza i uvoz`. Matches use compact HT/FT tables, fifty per page; row details retain source provenance and unconfirmed-timezone warnings. Team form/venue splits and H2H keep their original samples. Coverage, missing data, source permissions, last check/success, import errors and dry-run/apply controls remain available under the data view, never triggered by changing tabs. Filter changes reset pagination in the same UI event to avoid a stale-offset request.

Per-match analytics remain at `/admin/analize`, labeled `Dnevni raspored`, with shared workspace navigation and match rows. Match detail separates comparison, form, H2H and HT/FT. Metrics missing for both teams are omitted visually, without changing calculations or substituting values. The UI redesign makes no changes to API authorization, imports, SQL schema, ticket collections or publication.

The historical summary is retrospective, using currently recorded results, not a backtest or confidence estimate. All nine HT/FT transitions use the complete HT+FT denominator; a comeback means `1/2` or `2/1`. First/second-half goals require coherent HT+FT. FT overs/BTTS/results use finished valid FT only. Last five/ten windows have explicit actual sample sizes, separate home/away statistics, and no replacement of unavailable observations with extra older games. H2H preserves each match's original home/away orientation. Existing strict observed-as-of predictive analysis remains separate.

## Initial readiness checks and verification

At the initial local verification, no deployment or production SQL transfer had been performed and `ANALYTICS_DATABASE_URL` was missing. The subsequently approved dedicated Neon connection and verified archive transfer are documented in [analytics-production.md](analytics-production.md). Ephemeral SQLite in a serverless function remains disabled, and no automatic ticket publication is introduced.

Environment defaults:

```dotenv
ANALYTICS_DATABASE_URL=
PITCHAPI_KEY=
HISTORICAL_ANALYTICS_WRITE_ENABLED=false
HISTORICAL_ANALYTICS_SYNC_ENABLED=false
ANALYTICS_SYNC_ENABLED=false
```

The optional private analyzer sync handler calls historical incremental sync only when both historical flags are true. This release does not register an analytics cron and leaves all three flags false. It does not invoke product/daily publication. Verify a per-league dry-run and remaining free storage before enabling any future production sync. Existing product/result crons were not changed.

Verified: unit/integration tests, lint, production client build, local persistence and repeat dry-run. Browser checks with actual imported data confirmed guest API 403/login redirect, admin role access, league/season filters (League One 2024/25: 552 matches, 506 HT+FT), read-only dry-run, H2H, reload persistence and 390px responsive layout. No browser-to-provider requests or Firestore write requests occurred. A Firestore Listen transport warning was observed while closing the browser; no page runtime errors occurred.

Final verification: **135/135 tests passed**, `npm run lint` passed, `npm run build` passed with no large-chunk warning. The lazy historical page is about 23.46 kB (6.74 kB gzip); no database/CSV parser, private credentials or server-side API-key headers were found in the generated client assets. Test fixtures are confined to isolated in-memory test databases.

## Changed modules

- `server/footballAnalytics/englishPyramid.ts`: league/rank/season catalogue and conservative club aliases.
- `historicalProvider.ts`, `historicalImport.ts`, `historicalStats.ts`, `historicalOverview.ts`: source validation/fallback, dry-run/fingerprint/lease, calculations and private report queries.
- Existing `database.ts`, `migrations.ts`, `store.ts`, `normalization.ts`, `analysis.ts` and analytics types: reuse the isolated store, nullable kickoff support, observed versions and explicit last-check persistence.
- `api/football-analytics.ts`, `src/services/admin/footballAnalyticsService.ts`: authenticated read/plan/apply endpoints and gated incremental sync.
- `src/pages/Admin/HistoricalAnalytics.tsx` and components in `src/components/admin/analytics/`: private dashboard, shared workspace/tabs, compact match tables, team/H2H views, sample metrics, coverage and manual imports.
- `src/App.tsx`, `src/pages/Admin/AdminDashboard.tsx`, `vite.config.ts`: lazy private route/admin navigation and local API routing. Both purchase and analytics routes were retained when integrating current main.
- `scripts/historical-football.ts`, `scripts/import-match-history.mjs`, `public/templates/historical-matches.csv`: one safe CLI/import policy and header-only CSV template.
- `.env.example`, package manifests, `tests/historical-analytics.test.ts` and these docs. Existing user work and the earlier analyzer are preserved; no mass sync, Firestore rule change or production release was performed.

Local preview: `http://127.0.0.1:3002/admin/historical-analytics`. Full machine-readable local reports and screenshots are ignored under `.local-data/` and `.local-backups/`.
