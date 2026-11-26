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
- The scheduled workflow is gated by the repository variable `ELITE_PUBLIC_FOOTBALL_DAILY_SYNC_ENABLED`; it must remain unset/false until the first verified production sync.

## Verified source state

- Live OpenFootball loader on 2026-11-26: Premier League and Championship returned schedules, but the latest finished result was 2026-09-20; League One, League Two, and National League current-season datasets were unavailable.
- The collector must not write this feed as current. No production sync or database write has been attempted.
- Football-data.org's public documentation says the free tier is non-commercial; do not add it to the public snapshot without an explicit commercial licence. Other candidate feeds were also excluded where terms prohibit commercial use or reserve third-party rights.

## Validation and next actions

- `npm test`: 256/256 passed after the distinct-fixture guard.
- `npm run lint`: passed after the distinct-fixture guard.
- `npm run typecheck:api`: passed after the distinct-fixture guard.
- `npm run build`: passed after the distinct-fixture guard; existing Vite native config warnings remain.
- GitHub CLI is not installed. Git HTTPS read access to the PR branch works; GitHub MCP previously returned 404 on merge. Investigate authenticated PR/API access before any merge.
- Next: finish the source/license decision, commit only the collector files in this worktree, push to refresh Preview, verify Preview, and keep production automation disabled until a permitted, fresh source can produce a verified sync.
