# EliteVIPTips Handoff

Updated: 2026-11-27

## 2026-11-27 analytics outage diagnosis

- PR #20 merged as `e547787` and its Production deployment `dpl_4TNQvUXEdzzrMFPYZaJAifJpAdQo` is READY. Authenticated `/admin/historical-analytics` now receives the existing 503 database-unavailable response, proving the earlier "schema uninitialized" message was a masked connectivity failure, not evidence of missing tables. The Production URL remains a non-exportable Vercel Secret; no schema inventory can be claimed while Neon is unavailable.
- A second isolated branch, `codex/historical-analytics-outage-20261127`, removes the remaining misleading migration button on 503 from the historical admin page. Only the existing 409 missing-schema response can offer initialization. No database write is part of this change. Local checks: 266/266 tests, lint, API typecheck, build pass.

- Isolated branch `codex/analytics-recovery-20261127` starts from merged PR #19 (`acf6525`); the original 140-path dirty worktree and verified backup remain untouched.
- Production has `ANALYTICS_DATABASE_URL` configured as a Vercel Secret. Preview and Development do not have that variable. Vercel CLI correctly refuses to export the Production secret, so no direct local SQL connection or schema inventory was attempted.
- Existing `analyticsSchemaReady` swallowed every SQL error and called an unavailable Neon connection an uninitialized schema. It now returns false only for an actual missing `fa_schema` table and propagates connection/quota errors to the existing 503 handler. The admin view clears a stale overview on failure, so it cannot offer migration during an outage.
- No database migration, import, production write, source activation, or Neon-heavy query has run. Local checks on this branch: 266/266 tests, lint, API typecheck and build pass. Production diagnosis remains pending Preview/Production verification; do not infer that tables are absent from the old message.

## 2026-11-27 isolated Registry continuation

- Original dirty worktree remains on `feature/elite-pro-football-database`. Its 112 status entries expanded to 140 paths; all 140 were copied and SHA-256 verified in `C:\Users\Nemanja\.codex\backups\elitevip-main-worktree-20261127-140path-refresh` (manifest SHA-256 `04F318C96D9CA7F3680EFB590AF9D9EEB3F9D917D71E3A464EDDA8C5150B0E0D`). No original path was reset or deleted.
- Registry integration is isolated in `codex/data-source-registry-20261127` from `origin/main` `f9283b3`. Reviewed hunks cover only the Registry model, admin display/API, provider activation preservation, importer/public-sync rights gates, and focused tests. Other local work remains outside this branch.
- Local isolated checks: `npm test` 264/264 after the additional public-sync rights-gate test; `npm run lint`, `npm run typecheck:api`, and `npm run build` pass. The existing separate Firestore emulator suite in the original worktree passes 9/9 with zero skips; it exercises baseline/proposal rules, not a Registry-specific Firestore schema (Registry adds none).
- No new Vercel API entrypoint was created. Preview deployment `dpl_C6jDf9ymkCa8NygYtFdDDaXdgtJJ` is READY and its inspected build output has exactly nine lambda functions. Local `vercel build` failed while Vercel CLI tried to create symlinks in its Windows cache (`EPERM`); the remote build succeeded. No production collector activation or database write was performed.
- Registry activation controls the SQL importer and legacy SQL public-sync plan. The current Turso collector remains a separate OpenFootball-only OIDC endpoint behind its own global write gate; it does not read Neon registry policy. Admin UI now states this boundary explicitly. A unified Turso policy needs a separately reviewed, non-Neon design before claiming complete source management.

### Original 20 phases: evidence checkpoint

Statuses refer to the named phase as a whole; a working subfeature does not mean the entire phase is finished. Production evidence below comes from the prior verified handoff unless a 2026-11-27 local test is named.

| Phase | Status | Evidence / remaining gap |
|---|---|---|
| 01 Audit | Completed locally | Existing audit and phase ledgers; no repeat audit in this continuation. |
| 02 Stability, backup, rollback | Partial | Verified 140-path backup and 9 emulator tests; full restore/rollback drill remains open. |
| 03 Infrastructure and costs | Partial | Turso public snapshot and cache are deployed per prior handoff; no current end-to-end cost measurement. |
| 04 Central football DB | Partial | `server/footballAnalytics/database.ts` and normalization exist; private analytics still depend on Neon. |
| 05 Python scraping | Blocked | No approved fresh multi-tier source or verified commercial rights; no scraper activated. |
| 06 Data Source Manager | Partial | Isolated Registry, API/admin gates and tests; Turso collector policy remains separate, and production verification is pending. |
| 07 Historical football DB | Partial / blocked | Historical importers and real archive exist; lower tiers and commercial import rights remain incomplete. |
| 08 Data quality | Partial | `normalization.ts`, conflict tests and source provenance exist; cross-source quality coverage is incomplete. |
| 09 Football statistics | Partial | HT/FT, form and H2H calculations have unit tests; production data freshness and full formula audit remain open. |
| 10 xG/xGA | Blocked | Existing optional fields do not establish a fresh, licensed, complete xG source. |
| 11 Club Intelligence | Not started | No verified sourced injury/lineup/news pipeline in current main. |
| 12 AI analysis | Partial | Manual Gemini analysis and tests exist; broader verified-context integration remains open. |
| 13 Football RAG | Not started | No approved document corpus or demonstrated need for retrieval. |
| 14 GitHub automation | Partial | Collector workflow is deployed with write gate off; first fresh licensed production sync has not succeeded. |
| 15 n8n | Not started | No demonstrated requirement beyond existing GitHub Actions. |
| 16 Match Finder | Partial | `/match-finder` public route exists; usable fresh coverage/filter depth is not verified. |
| 17 Public football stats | Partial | `/fudbal` Turso path and stale warning deployed; current results remain stale. |
| 18 SEO | Partial | SSR public routes, sitemap and robots exist; Search Console/indexing verification remains open. |
| 19 PWA | Not started | No safe public-only offline cache or install flow verified. |
| 20 Final QA/security | Partial | Local 263-test suite, lint/build/API typecheck and 9 emulator tests pass; Preview and production E2E remain open. |

## Current work

- Isolated collector branch: `codex/public-turso-collector-20261126`.
- PR #17 is the only PR in scope. PR #16 remains untouched.
- The main worktree backup is at `C:\Users\Nemanja\.codex\backups\elitevip-main-worktree-20261126-211451`; 137 copied files were SHA-256 verified against all 109 changed paths. Main worktree was not edited.
- PR #17's Turso-only compare-and-swap writer is retained; the local alternative was not copied because it reintroduced a separate PostgreSQL sync path.

## Collector safety changes deployed

- Require at least three distinct recent finished fixtures (maximum age: 10 days) and one distinct upcoming fixture before writing a snapshot. A stale available dataset is excluded rather than merged into the new snapshot.
- Refuse unresolved past fixtures and preserve existing finished scores on conflicts.
- Require a matching Turso read-back receipt before reporting a successful sync.
- Preserve the collector freshness/status metadata through the Turso payload parser so cron status checks can validate a stored write and skip redundant ingestion.
- Manual workflow dispatch is dry-run by default; a manual production write requires `confirm_write=true`. Scheduled runs are automatic after the one-time repository variable `ELITE_PUBLIC_FOOTBALL_DAILY_SYNC_ENABLED=true`; it remains unset/false because the first verified production sync has not succeeded.
- Dispatch policy is centralized and regression-tested: scheduled writes require the daily gate; manual writes require explicit confirmation; all other events remain read-only.

## Verified source state

- Live OpenFootball loader on 2026-11-26: Premier League and Championship returned schedules, but the latest finished result was 2026-09-20; League One, League Two, and National League current-season datasets were unavailable.
- The collector must not write this feed as current. A manually confirmed production workflow was attempted after deployment, but the freshness check failed before the ingest POST; no production database write occurred.
- Preview's existing snapshot also contained upcoming fixtures last checked on `2026-09-22`. Public API/page responses now mark source observations older than 10 days as stale, warn that upcoming times were not re-confirmed, and omit those stale fixtures from upcoming schedules.
- Repeated live read-only evaluation at `2026-11-26T20:40:36Z`: PL 380 and Championship 552 rows, both latest finished `2026-09-20`; League One/Two/National League 0 current rows. All five datasets were excluded by the 10-day gate; validation threw before any collector POST.
- Football-data.org's public documentation says the free tier is non-commercial; do not add it to the public snapshot without an explicit commercial licence. Other candidate feeds were also excluded where terms prohibit commercial use or reserve third-party rights.
- The same collector was run live again in forced local dry-run mode on 2026-11-26: 5 source datasets checked, 0 records eligible to transmit, 0 writes; latest actual finished OpenFootball result remained 2026-09-20.
- TheSportsDB's public API returned HTTP 200, but its England league search returned only five leagues (cups and three Isthmian divisions; no Premier League, Championship, League One/Two, or National League). Its free Isthmian Premier 2026/27 season endpoint returned 15 events with latest date 2026-08-11, so it does not meet current freshness/coverage needs even though the current terms permit monetized public display of API data.
- Football-Data.co.uk marked its files updated 2026-11-26, but its own fair-use policy restricts free data to personal/academic research and excludes commercial projects. It is not approved for this site's public dataset without a separate licensed product.
- `seanelvidge/England-football-results` advertises nightly top-four results through 2026-11-25, but its CC BY notice expressly covers the maintainer's original contributions only and reserves third-party source rights. Do not feed it to production without rights clearance.

## Validation and next actions

- `npm test`: 258/258 passed after the daily/manual dispatch policy change, including source-age labels, stale-upcoming suppression, and Turso freshness-metadata read-back.
- `npm run lint`, `npm run typecheck:api`, and `npm run build` passed. Build retains existing Vite native-config warnings about `__dirname` and a missing import extension.
- Final Preview `7048e02` reached READY; authenticated `/fudbal` showed the stale-source warning and the public API returned `rows: []` for the selected next-seven-day window. PR #17 was squash-merged as `f4bd5f98153a74572af8b6aadb2a0997d14388f8`; production deployment `dpl_EDbChoxvKKfJRXe5zoHfPLvFx7on` is READY and serves `eliteviptips.com`.
- Production smoke checks after deploy: `/`, `/history`, `/stats`, `/fudbal`, and the public overview API returned HTTP 200. The `/fudbal` warning is visible, API reports `dataStale: true`, `rows: 0`, and the same 3,636 total / 2,837 finished / 2,698 HT+FT records as before.
- Manual production workflow run [#1](https://github.com/nemanjazivkovic1605-spec/vip-tiketi-elite/actions/runs/45896762812) failed closed with “no fresh finished results in the last 10 days”; logs show failure before the ingest POST. The daily repository gate remains unset/false.
- Authenticated Git HTTPS push and GitHub REST work. The earlier GitHub MCP 404 was connector-specific; `gh` was not required.
- Latest local dry-run checked five datasets, found zero eligible records, and reported `writes: 0`. Do not enable the daily cron or attempt another production write until a source passes freshness, coverage and rights checks. No such source is currently available, so no incomplete snapshot may replace Turso.
