# EliteVIPTips Handoff

Updated: 2026-11-26

## Current work

- Isolated collector branch: `codex/public-turso-collector-20261126`.
- PR #17 is the only PR in scope. PR #16 remains untouched.
- The main worktree backup is at `C:\Users\Nemanja\.codex\backups\elitevip-main-worktree-20261126-211451`; 137 copied files were SHA-256 verified against all 109 changed paths. Main worktree was not edited.
- PR #17's Turso-only compare-and-swap writer is retained; the local alternative was not copied because it reintroduced a separate PostgreSQL sync path.

## Collector safety changes in progress

- Require at least three distinct recent finished fixtures (maximum age: 10 days) and one distinct upcoming fixture before writing a snapshot. A stale available dataset is excluded rather than merged into the new snapshot.
- Refuse unresolved past fixtures and preserve existing finished scores on conflicts.
- Require a matching Turso read-back receipt before reporting a successful sync.
- Preserve the collector freshness/status metadata through the Turso payload parser so cron status checks can validate a stored write and skip redundant ingestion.
- Manual workflow dispatch is dry-run by default; a manual production write requires `confirm_write=true`. Scheduled runs are automatic after the one-time repository variable `ELITE_PUBLIC_FOOTBALL_DAILY_SYNC_ENABLED=true`; leave it unset/false until the first verified production sync.
- Dispatch policy is centralized and regression-tested: scheduled writes require the daily gate; manual writes require explicit confirmation; all other events remain read-only.

## Verified source state

- Live OpenFootball loader on 2026-11-26: Premier League and Championship returned schedules, but the latest finished result was 2026-09-20; League One, League Two, and National League current-season datasets were unavailable.
- The collector must not write this feed as current. No production sync or database write has been attempted.
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
- Preview `a057fec` (`https://vip-tiketi-elite-cx3yrx1c2-nemanjazivkovic1605-specs-projects.vercel.app`) reached READY. Authenticated fetch verified SSR `/fudbal` shows the stale-source warning and no stale upcoming rows; the public overview JSON returns `rows: []` for the selected next-seven-day window while retaining actual historical aggregates/results. The dispatcher change still needs its own Preview after push.
- Authenticated GitHub REST previously confirmed PR #17 is open, based on `main`, mergeable, and Git HTTPS push works. The GitHub MCP 404 is connector-specific; `gh` is unnecessary.
- Next: push the dispatch-policy change and verify its new Preview. Do not run a production write or enable the daily cron until a source passes freshness, coverage and rights checks. No such source is currently available, so a production sync must remain blocked and no incomplete snapshot may replace Turso.
