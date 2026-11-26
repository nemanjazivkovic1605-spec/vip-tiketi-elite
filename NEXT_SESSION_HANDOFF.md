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
- The scheduled workflow is gated by the repository variable `ELITE_PUBLIC_FOOTBALL_DAILY_SYNC_ENABLED`; it must remain unset/false until the first verified production sync.

## Verified source state

- Live OpenFootball loader on 2026-11-26: Premier League and Championship returned schedules, but the latest finished result was 2026-09-20; League One, League Two, and National League current-season datasets were unavailable.
- The collector must not write this feed as current. No production sync or database write has been attempted.
- Preview's existing snapshot also contained upcoming fixtures last checked on `2026-09-22`. Public API/page responses now mark source observations older than 10 days as stale, warn that upcoming times were not re-confirmed, and omit those stale fixtures from upcoming schedules.
- Repeated live read-only evaluation at `2026-11-26T20:40:36Z`: PL 380 and Championship 552 rows, both latest finished `2026-09-20`; League One/Two/National League 0 current rows. All five datasets were excluded by the 10-day gate; validation threw before any collector POST.
- Football-data.org's public documentation says the free tier is non-commercial; do not add it to the public snapshot without an explicit commercial licence. Other candidate feeds were also excluded where terms prohibit commercial use or reserve third-party rights.

## Validation and next actions

- `npm test`: 257/257 passed, including source-age response labels, stale-upcoming suppression, and Turso freshness-metadata read-back.
- `npm run lint`, `npm run typecheck:api`, `npm run build`, and `git diff --check`: passed after all current code changes. Build retains the existing Vite native-config warnings about `__dirname` and a missing import extension.
- Vercel Preview for prior collector commit `e7bf048` was READY. Protected HTTP was verified with Vercel's authenticated fetch: `/fudbal` returned SSR content and the public overview API returned actual records. That preview exposed stale upcoming records checked on 2026-09-22; this is why the source-age disclosure/suppression was added. A new Preview must be checked after the next push.
- Authenticated GitHub REST confirmed PR #17 is open, based on `main`, mergeable, and head `e7bf048`; Git HTTPS push works. GitHub MCP's earlier 404 is connector-specific, not a repository permission issue. `gh` is not installed and is not needed for the authenticated REST route.
- Next: commit and push the stale-source display guard, verify the new Preview including `/fudbal` and its public API, then keep production sync/cron disabled until a permitted fresh source can produce a verified Turso sync. Do not merge while the source gate is unsatisfied.
