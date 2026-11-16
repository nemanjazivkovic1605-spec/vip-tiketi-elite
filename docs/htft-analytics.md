# English HT/FT Analytics

## Existing data, not a second database

The feature extends the existing `fa_matches`, `fa_sources`, `fa_aliases`, `fa_historical_checks`, `fa_import_runs` and import locks. No SQL migration, Firestore collection, published ticket, payment or access rule is changed. Reads are private/admin-only and return at most 50 table rows per page.

Admin route: `/admin/htft` (lazy-loaded). Navigation: **HT/FT Rang-lista**.

- Ranking: filter by league, season, transition and team role; sort by name, played count, 2/1, 1/2, total, percentage, last occurrence or selected transition count.
- All transitions: counts, percentages, denominators and paginated real matches for all nine codes.
- Team history: original home/away orientation, opponent, HT, FT, role, and all four season summaries.
- Schedule: today/tomorrow/day-after/next seven Belgrade calendar dates, with explicit league coverage gaps.
- Match comparison: actual historical counts, last 5/10, current season and H2H. No prediction or confidence is inferred from frequency.

### Counting rules

`2/1` means away ahead at HT and home ahead at FT. Only the home team gets a made-2/1 count; the away team gets a conceded-2/1 count. `1/2` credits the away team and records the home team's lost lead.

A dropped lead includes a halftime leader that draws **or** loses at FT. Catching up to a draw and winning from a drawn HT are separate counters. Other codes retain their original fixture home/away meaning; team venue is always displayed.

Only real, finished matches with coherent HT and regular-time FT enter the HT/FT denominator. Missing HT never becomes 0:0. Played count and HT/FT sample are distinct. Last-five/ten windows select the last five/ten finished games first and then expose the actual known HT sample; they do not substitute older games. Future finished results are excluded. Unknown kickoff time cannot order two matches on the same date.

Data is calculated on reads from the shared English match repository; an import correction is reflected on the next refresh without a stats-writing loop. UI pagination is 50. English data reads have an explicit 50,000-row ceiling; larger datasets will require database-side rollups rather than silently truncating the history.

## Daily synchronization

The existing Vercel cron `/api/football-analytics` at `0 6 * * *` calls the existing `sync` branch. That is 07:00 Serbian winter time / 08:00 summer time; all calendar boundaries inside the import use `Europe/Belgrade`. No second cron or ticket-publishing job is added.

The English current-season sync now uses the same historical loader, source priority and deduplication pipeline:

1. Confirmed live PitchAPI, if configured; test credentials are never used as real data.
2. Permitted CC0 OpenFootball JSON.
3. Existing football-data.org integration, when a usable key and league entitlement exist. A merely successful but stale OpenFootball response is not sufficient: when past FT/HT is missing, the daily loader compares the available football-data results and prefers the more complete real dataset.

All eleven English competition targets are checked, but missing sources stay missing. The daily rolling window checks fourteen previous days and the next seven calendar dates, plus newly resolved older FT/HT gaps already present in the current season. It does not rewrite every completed season. Old-season corrections still require the existing explicit historical backfill tool.

The function plans first, uses a 150-second provider budget, cancellation, rate limits/retry and existing import locks. Automatic writes stop above 200 changed matches / 3,000 estimated SQL operations. The existing writer also caps a run at 1,000 inspected records. Logs include unavailable datasets and failures. One successful/partial run per Belgrade date prevents repeat cron deliveries from rewriting the data. Failures are retryable, and fixture identities remain deduplicated across sources. No tickets are generated/published.

### Production prerequisites

Required server-only environment:

```dotenv
ANALYTICS_DATABASE_URL=postgresql://...
HISTORICAL_ANALYTICS_WRITE_ENABLED=true
HISTORICAL_ANALYTICS_SYNC_ENABLED=true
CRON_SECRET=...
```

Existing optional provider variables remain `PITCHAPI_KEY` (real data requires `pk_live_`) and `FOOTBALL_DATA_API_KEY`. OpenFootball does not need a key. Keep `ANALYTICS_SYNC_ENABLED=false` if the unrelated older general-provider sync is not intended.

Do not enable production flags before the remote analytics schema and existing data have been verified. Vercel cannot access the desktop SQLite file. This task has not created a hosted database, moved the local 8,167 matches to production, enabled production flags or deployed the application. No paid provider is introduced.

### Manual checks

```powershell
npm run analytics:htft -- report --output=.local-data/htft-report.json
npm run analytics:htft -- plan --output=.local-data/htft-daily-plan.json
```

Both commands are read/dry-run. To explicitly apply a checked local plan, use `sync --write --confirm-plan=FINGERPRINT` with the fingerprint from the preceding plan. Remote writes also require the production write flag. A changed plan is rejected; create a fresh dry-run. Existing full-season/backfill commands remain available.

## Verified local snapshot after real result supplementation (15 November 2026)

The starting point was 8,167 English matches and 6,649 coherent HT+FT. After checking the user's previously supplied football-data.org credential (HTTP 200), a confirmed dry-run and SQLite backup, 158 existing records were updated from real API results/times. There were zero created/deleted matches and zero overwrites of previously known FT results. The resulting dataset has **8,167 matches, 6,989 finished FT and 6,789 coherent HT+FT** (+140). German/test records and all ticket/Firestore data were untouched.

| Transition | Count | Percent of 6,789 |
| --- | ---: | ---: |
| 2/1 | 213 | 3.14% |
| 1/2 | 163 | 2.40% |
| 2/X | 372 | 5.48% |
| 1/X | 406 | 5.98% |
| X/1 | 1,017 | 14.98% |
| X/2 | 819 | 12.06% |
| 1/1 | 1,904 | 28.05% |
| 2/2 | 1,265 | 18.63% |
| X/X | 630 | 9.28% |

Most made 2/1: **Coventry City FC, 7**. Most made 1/2: **Aston Villa FC, 5**. These are counts in the available partial history, not complete all-time records.

- Premier League / Championship: all four season targets (2023/24 through 2026/27), partial data completeness.
- League One / League Two / National League: 2023/24, 2024/25, 2025/26; some season datasets are partial.
- Levels 6/7 and current-season levels 3/4/5 have no confirmed imported source. They remain listed as gaps, with manual permitted CSV/JSON import available.
- 21 already-stored upcoming fixtures occur on 15–21 November. The first archive-only dry-run was 57 unchanged rows. The more complete football-data fallback plan was then 0 creates, 158 updates, 6 ambiguous identities quarantined, with one invalid upstream record rejected. The actual write matched the confirmed fingerprint. A repeated dry-run is now 0 creates, 0 updates, 47 unchanged and the same 6 unresolved identities; it was not applied again.
- The 6 ambiguous cases remain in `fa_unresolved`; they were not forced into existing records or duplicated. A consistent SQLite backup is retained under `.local-backups/football-analytics-before-htft-fd-*.sqlite`.
- Local PitchAPI remains test-only. The existing football-data.org key is now configured only in the ignored `.env.analysis.local` and verified with the official service; it is not in tracked source or browser code. Hosted analytics DB is unconfigured locally. Production environment was not inspected/changed in this task.

Verification: lint, build, all 146 tests, and authenticated read-only browser runs before/after the local supplementation. The browser verified sorting, team history, transition drilldown/pagination, league/season/role filters, 21 upcoming fixtures, preview samples, Escape-to-close, reload and mobile widths 320/390. It recorded zero runtime errors, Firestore writes, analytics mutations and browser calls to sports providers. A separate backup comparison verified 0 new/deleted IDs, 0 changes outside English real matches, 0 known FT overwrites and 0 incoherent HT/FT pairs. The existing intermittent Firestore Listen transport warning was observed during tests; it did not block the analytics API responses.

Sources: [OpenFootball CC0 data and daily update details](https://github.com/openfootball/football.json), [football-data.org free coverage](https://www.football-data.org/coverage), [Vercel cron authentication and execution](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
