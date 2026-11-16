# Football-Data.co.uk archive: approval-gated local import

## Existing architecture

Historical match analytics use the existing isolated SQL database (`fa_matches`, `fa_sources`, `fa_aliases`, `fa_versions`, import/check tables). Before this archive import, local SQLite contained 12,135 real matches, including the existing 8,167 English matches; nine test matches remain isolated. Published tickets and their profit/statistics indexes are a separate dataset.

A read-only Firestore audit on 15 November 2026 used three count queries: `openfootballMatchHistory=0`, `tickets=1097`, `dailyAnalyses=114`. No full ticket collection was downloaded. The archive command does not initialize Firebase, read Firestore, publish tickets, update users, or invoke any sync/AI endpoint.

## This phase

`npm run analytics:archive` extracts the user-provided ZIP to a private ignored `.local-data` directory. The existing ZIP dependency is used directly; no PowerShell execution policy or system setting is changed. Entry path, symlink, size, CRC32 and SHA-256 checks run before processing. Existing different extracted files are never overwritten.

The default `dry-run` keeps the source archive and existing analytics database read-only. Only a staging database, original CSV copies and JSON/Markdown audit reports are written. `--write` is explicitly rejected. The separately approved `import` command is local/private only, requires the exact plan fingerprint and makes a verified SQLite online backup before any schema or match change. No public route or scheduled task invokes this writer.

```powershell
npm run analytics:archive -- dry-run "--archive=C:\Users\Nemanja\Downloads\Downloads.zip"
npm run analytics:archive:check
```

The output directory is content-addressed by the archive checksum, parser checksum and as-of date. Re-running verifies every file, resumes completed file transactions and reconciles rows. It compares a fingerprint of the existing target before/after and reports the plan fingerprint; it does not rewrite canonical matches. A staging file cannot be silently reused for different CSV bytes or parser behavior.

## Identity and source integrity

- Division catalog: 22 European divisions. `SP2` is Spain's second division, not Primera Federacion. No public league labels are changed in this phase.
- Dates: explicit `dd/mm/yy`, `dd/mm/yyyy`, dotted equivalents and ISO, with real-calendar validation. Season is inferred from the whole season file, retaining July/August 2020 in the delayed 2019/20 season. Equivalent `yyyy/yyyy` and `yyyy/yy` existing season labels compare equally without rewriting stored labels.
- Team normalization: Unicode, whitespace, accents and curated country-specific aliases. Home/away order is preserved. Broad fuzzy matching never silently merges teams; ambiguous aliases, multiple candidates or possible date shifts go to review.
- Identity: league/country + match date + normalized home/away, followed by FT/HT checks. Missing values can be planned for supplementation, but contradictory results are quarantined. Known UTC kickoff timestamps are not replaced by unzoned CSV clocks. Unknown values remain NULL, including timezone.
- Every source observation keeps its file SHA-256 and line number. Original CSVs remain intact. Duplicate source files/rows do not add a second match or a second quote observation. All alternate source values remain auditable.

## Historical odds, not EliteVIPTips prices

Each staged source observation contains independent `odds.prices`, `odds.lines`, `odds.bookmakerCounts` and `statistics`. The central column decoder identifies 1X2, total-goals and Asian-handicap markets, bookmaker, average/maximum aggregation, selection, line and pre-closing/closing phase. Non-price AH lines can legitimately be zero or negative. Bookmaker counts are not odds. Malformed prices and decimal odds <=1 are excluded from normalized prices, not replaced by 1.00; original cells remain in the CSV.

`VC` is a bookmaker prefix, not a closing suffix; old VC and SKB columns are preserved. An abbreviation not established by the source notes remains the source abbreviation rather than an invented bookmaker name.

The source describes the first snapshot as **pre-closing**, not necessarily the first opening offer. `C` denotes closing. No current-market availability or exact quote timestamp is inferred. Pinnacle columns from 23 July 2025 carry the source-wide stale-price caution. No fixed margin, synthetic market, bookmaker selection or odds uplift is applied.

Approved local imports retain these snapshots in `fa_historical_quotes`, linked to the canonical match, never `tickets.totalOdds` or internal product prices. The payload preserves `odds`, raw non-odds `statistics`, original identity/score cells and invalid-column warnings. `file_sha` and `source_line` link to original CSVs; `fa_archive_files` keeps all file names, checksums and processing summaries. Multiple file names for the same bytes do not duplicate a quote. Compact per-source-match snapshots avoid turning millions of price cells into millions of Firestore documents.

Migration 3 creates only three analytics tables: `fa_historical_quotes`, `fa_archive_files`, `fa_archive_imports`, plus their local SQL indexes. No Firestore schema changes occur. The general migration command remains explicit; reads never apply migrations. The archive writer does not use `ANALYTICS_DATABASE_URL` and rejects production/Vercel execution.

## Approved write and recovery

```powershell
npm run analytics:archive -- import --local-private --allow-large --batch-matches=100 "--archive=C:\Users\Nemanja\Downloads\Downloads.zip" "--stage=ABSOLUTE_PATH_TO_ARCHIVE_STAGE.sqlite" --confirm=APPROVED_DRY_RUN_FINGERPRINT
npm run analytics:archive -- verify "--stage=ABSOLUTE_PATH_TO_ARCHIVE_STAGE.sqlite"
```

The CLI validates the ZIP checksum, every extracted CSV checksum, parser version, local target path and approval fingerprint. The writer binds the plan, normalized matches, source observations and files into a content digest. If the target changed since the approved dry-run, it stops without an import. More than 500 planned match changes additionally require `--allow-large`.

The backup is a consistent SQLite online backup including WAL contents, not an unsafe copy of just the main file. It is stored under `.local-backups`, opened for `quick_check`, and its original match fingerprint must match the plan. The write runs in 100-match transactions (configurable 1-500). Canonical record, source/club links, quote snapshots, observed version and checkpoint commit together. An invalid row rolls back its entire batch. A leased local import lock prevents overlapping archive writers.

Use the same original command with `--resume` after an interrupted import. The frozen plan must not be regenerated between interruption and resume. The writer validates the original content digest, resumes after the last committed identity, and reuses the original backup and canonical IDs. Repeating an already complete job returns `alreadyComplete: true` with no canonical writes or extra backup.

Existing canonical IDs, club IDs, trusted names, season labels, known scores, UTC kickoffs, optional statistics and their provenance are preserved. Only missing facts are filled; a pending/unknown match may become finished once real FT is available. Conflicting results and uncertain aliases/date shifts remain in `needs-review.json`, untouched. Source quote rows retain alternate observed values rather than silently replacing a reliable canonical statistic. New matches with no verified timezone retain `kickoffAt: null`; no UTC midnight is fabricated.

Historical versions use the actual import observation time, never a backdated match date. Coverage reflects the supplied archive subset, including pending-review gaps, not a claim that all fixtures in a competition have been independently verified. English four-season read queries apply the season scope before their safety limit, so the larger all-season archive does not break existing HT/FT pages.

`import-report.json` records committed counts, source/plan digests, backup location and skip counts. `verify` opens the canonical database, backup and stage read-only. It checks SQLite integrity, retention of every original ID and known fact, new/enriched counts, quote values and file/row provenance against staging, validity of every normalized price, and independently recomputes HT/FT totals in SQL. Its output is `import-verification.json`. Neither command invokes Firebase, AI, ticket publication or a public-index sync.

## Verified local import, 15 November 2026

- Archive: 434 CSV files, 154,481 source rows, 151,045 unique match identities.
- Committed: 143,296 new canonical matches, 5,466 fill-only enrichments, 148,762 source quote/statistics snapshots.
- Historical normalized price values stored: 8,069,372. Invalid normalized prices: zero. No 1.00 fallback prices.
- Quarantined: 173 existing-result conflicts and 2,110 uncertain identities. Two malformed source rows were rejected during staging.
- Canonical database after import: 155,431 real matches plus the unchanged nine isolated test records; 153,723 real matches have confirmed coherent HT and FT.
- All original 12,144 IDs and known facts are retained. No match was deleted. The online backup's original fingerprint is verified.
- The original import command was repeated: `alreadyComplete=true`; SQLite data version and match/version/source/quote/alias/job counts remained identical, with zero database commits.
- Existing English four-season read models return 9,701 matches and an 8,780 HT/FT sample; ranking, team history, transition pagination, league/season filtering and the 21-match upcoming schedule were checked read-only.
- Firestore reads/writes, public ticket publications, and production writes: zero.
- Validation: 169 tests passed, `npm run lint`, `npm run analytics:archive:check`, and `npm run build` passed.

The ignored report directory is `.local-data/football-data-archive/632ab8f02e93-2026-11-15-d8fa6c6d/`. It contains the original dry-run, review list, committed import receipt, full integrity/quote verification and repeat-import verification. The source archive and original extracted CSVs remain intact.

## Analysis and reports

All nine HT/FT transitions reuse the existing historical transition calculator. Denominators include only coherent known HT and FT; missing half-time is not a 0:0 draw. Archive results are retrospective match statistics, not claimed historic betting tips or tipster returns.

```powershell
npm run analytics:archive -- stats "--stage=ABSOLUTE_PATH_TO_ARCHIVE_STAGE.sqlite" --league=E0 --season=2024/25 "--team=Man Utd" --venue=home
```

`stats` opens the staging database read-only. Filter by division, season, team and home/away venue. Omitting team/venue gives league/season/all-match totals and all HT/FT frequencies with sample sizes. The report files contain per-league/season coverage, file encodings/headers/counts, all error locations, odds column mapping, and quarantined matches with possible existing IDs. No public design, auth, membership, payment or Firestore rule is changed.

## Approval and rights

The user approved the bounded local/private canonical import after the dry-run. This does not establish commercial publication rights. The provider states private-individual, noncommercial use and restricts commercial/data-training use. Permission must be verified before production/commercial use; possession of this ZIP is not represented as a license. The archive remains local and ignored by Git. No additional CSV scraping or downloads were performed. Production deployment, Firestore copy and commercial publication are not enabled by this approval.

Official sources: [data description and usage restriction](https://football-data.co.uk/data.php), [column definitions](https://football-data.co.uk/notes.txt).
