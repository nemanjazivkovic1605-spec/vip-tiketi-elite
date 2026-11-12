<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/baeb5e75-e490-4d35-a2a6-10aba2241794

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. For local AI analysis testing through `vercel dev`, set server-only `GEMINI_API_KEY` and `RESEND_API_KEY` in an ignored `.env.local` file. Never use a `VITE_` prefix for these keys.
3. Add `FIREBASE_SERVICE_ACCOUNT_KEY` to `.env.local` when using backend-generated auth links.
4. Run the app:
   `npm run dev`

## Gemini DailyTips analysis setup

DailyTips AI analysis is generated through the server function at `/api/generate-daily-analysis`; the browser never receives the Gemini API key.

1. In Vercel, open Project Settings -> Environment Variables.
2. Add `GEMINI_API_KEY` for Production (and Preview only when needed).
3. Redeploy after adding or changing the environment variable.
4. In Admin -> Dnevni Tipovi, use `Generisi AI analizu` for a selected match. Scheduled publication uses the provider's prediction and does not call Gemini.

If Gemini is unavailable or rate limited, the app stores a non-empty analysis fallback based on the selected match and pick.

## Automatic daily football picks

The browser calls `/api/football-data`. API-Sports and football-data.org credentials stay on the server and are never interchangeable. All football leagues returned by API-Sports are eligible, including lower divisions; available data depends on the account's subscription and season coverage.

Production requires `API_FOOTBALL_KEY`, `FIREBASE_SERVICE_ACCOUNT_KEY` and a random `CRON_SECRET` in Vercel. `FOOTBALL_DATA_API_KEY` is an optional fallback for schedules/results, not for bookmaker odds or provider predictions. `API_BASKETBALL_KEY` supports the existing manual basketball import. Legacy `VITE_FOOTBALL_API_KEY` / `VITE_BASKETBALL_API_KEY` variables are accepted only by server code for compatibility; migrate them to the server-only names and rotate previously exposed credentials in the provider dashboard. Do not add sports keys to browser configuration.

`vercel.json` runs `/api/daily-picks` at 08:00 UTC daily and `/api/daily-results` at 23:30 UTC. Cron requests require `Authorization: Bearer <CRON_SECRET>`; a Vercel user-agent alone is insufficient. The admin buttons use POST with a verified Firebase admin token. Vercel schedules run on production deployments.

The default publication target is **one FREE and up to two VIP single picks per match date**, for today, tomorrow and the day after in Europe/Belgrade. It requires an unstarted fixture at least 30 minutes away, a matching API-Football prediction, and an actual full-time bookmaker price for the proposed market. Missing data does not generate invented odds, predictions or historical tickets. Publication timestamps record when the pick was actually published. Odds can change after publication; the bookmaker and price timestamp, when supplied, are stored.

Requests are bounded, not an exhaustive scan of every bookmaker page. Defaults: `DAILY_LOOKAHEAD_DAYS=3`, `DAILY_FREE_PICKS=1`, `DAILY_VIP_PICKS=2`, `DAILY_ODDS_PAGE_LIMIT=3`, `DAILY_PREDICTION_LIMIT=4`, `SPORTS_API_INTERVAL_MS=6100`. At these defaults a complete publication run uses at most 24 API-Sports requests before retries, with fewer calls when dates are already filled or data is absent. Result checking examines at most 30 open football picks from the past seven dates. Warm-instance caches and the public response CDN reduce repeated reads; they are not a global daily quota guarantee. The free provider plan may exclude current seasons or odds/predictions, so code changes alone cannot unlock them.

Publication is a Firestore transaction across `dailyAnalyses`, its FREE/VIP read indexes, `tickets`, `publicTickets` and a per-date `dailyAutomation` reservation. It inserts missing picks and never overwrites existing picks. Admin edits, hiding and deletion survive later scheduled runs; a removed automatic pick is not recreated that day. Admins can edit either the daily analysis or its linked single ticket. Result checking reads the latest prediction inside a transaction and respects manual result overrides, hiding and deletion. Unsupported markets remain for manual review; postponed fixtures are not treated as wins or losses.

An authenticated `GET /api/daily-picks?dryRun=true&date=YYYY-MM-DD` checks provider data and planned picks without database writes. Omitting the date checks the configured lookahead. Never put the cron secret in the URL. `npm run dev` serves these sports API routes locally from server code; other backend routes can be tested with `vercel dev`.

Validation: `npm test`, `npm run lint`, `npm run build`. Tests cover real-price selection, lower leagues, missing/mismatched data, concurrent publication, protected admin changes, public VIP redaction, result grading, cron authentication and provider-key separation. They use synthetic fixtures and an in-memory transactional store; production key validity and Firestore permissions must also be checked on a deployment. Existing historical snapshots/statistics maintenance is separate from these daily jobs.

## Resend email setup

## Free fixture sources and independent odds

`server/freeFootballFeeds.ts` reads schedules/results from the configured football-data.org account, the official public TheSportsDB key `123`, and OpenLigaDB (Bundesliga divisions). Missing or failed providers are skipped. API-Football/API-Basketball can be disabled with `API_FOOTBALL_ENABLED=false` / `API_BASKETBALL_ENABLED=false`; disabled accounts are not called. No third-party/private keys are bundled.

Bookmaker prices are separate from fixtures. Set server-only `ODDS_API_KEY` from a personal [The Odds API](https://the-odds-api.com/) free account. The starter tier advertises 500 credits/month. The adapter requests at most two leagues and two featured markets, caches each league response for 30 minutes, and verifies both team names, competition and kickoff before joining a price. It never derives a bookmaker price from a probability. A prediction additionally requires at least five actual completed matches per team. Missing prices/statistics produce no automatic publication; admin receives an explanation and can enter a verified price manually.

Free services have limited coverage, delayed scores and no availability guarantee. TheSportsDB's free day endpoint is limited to three events. The independent odds feed does not supply all markets: unsupported offers are skipped, not reconstructed. Football-data.co.uk CSV files are not used for automated commercial fetching: their current fair-use policy does not grant this usage.

### Admin proposal discovery

Admin day buttons now POST to `/api/daily-picks?mode=proposals&date=YYYY-MM-DD`. This is separate from strict cron publication. The Odds API sports catalog and events endpoints discover upcoming football fixtures across up to `DAILY_DISCOVERY_LEAGUE_LIMIT=40` active competitions; these endpoints consume no odds credits. The existing price adapter reads at most two leagues, two markets and one region, with its existing 30-minute warm-instance cache. Free fixture sources are used if discovery returns no eligible fixtures. Only real future matches and actual bookmaker prices are offered. A market suggestion is a review aid, not a claim of statistical value; no confidence, form or analysis is fabricated. Without a price, the proposal has a blank pick and requires manual completion.

Up to ten proposals per day are stored create-only in the admin-only `dailyProposals` collection. Guests, FREE and ordinary VIP users cannot read it. Pulls never update `tickets`, public indexes or statistics, and never overwrite existing proposals, dismissals or published daily analyses. `Uredi predlog` fills the existing form; `Objavi predlog` validates the pick, price and future kickoff, then saves through the existing daily publication lifecycle with a stable ID. Refreshing the admin panel only reads proposals. Add `dryRun=true` to the same admin-authorized POST for read-only verification.

The manual proposal path does not call Gemini. Automated cron publication retains its original model/statistics requirements and does not publish these review proposals. Bet Better fair odds are model-derived, not bookmaker prices; no such prices or locked third-party picks are imported.

For a selected match and market, proposals use the highest eligible actual bookmaker quote returned by the existing feed. This comparison never changes the selected fixture or market and never adds a fixed odds margin. Scheduled model picks also compare real prices for their exact market. Bookmaker provenance stays internal; generated public analysis does not name the bookmaker. Saved/published historical odds and manually edited prices are not repriced automatically.

Source attribution: [TheSportsDB](https://www.thesportsdb.com/), [OpenLigaDB](https://www.openligadb.de/) ([ODbL](https://opendatacommons.org/licenses/odbl/1-0/)). Team images/logos have separate rights; the new free adapters do not import artwork.

## Automatic ELITE TIKET and SAFE PICK

The existing `/api/daily-picks` morning cron now also creates one `elite_ticket` and one `safe_pick` for the current Europe/Belgrade date. It reuses the same fixture/real-price discovery as the admin proposal tool; no AI endpoint is called. It does not require admin approval. The existing monthly daily-pick workflow remains separate and unchanged in category.

Elite selects 2-6 distinct fixtures, with a real combined price of at least 2.50 (selection target around 5.00, capped at 15.00). Safe selects 1-3 distinct fixtures with a combined price of 1.50-3.00. Existing basic statistics are preferred when available; unavailable statistics are not invented. Only unstarted football matches at least 30 minutes away, supported full-time markets and real feed prices are eligible. Missing data skips that category and records the reason in `automationLogs/products-seed-YYYY-MM-DD`.

Publication is atomic across the existing `tickets`, sanitized `publicTickets` and `dailyAutomation/products-YYYY-MM-DD` reservation. Stable document IDs are `auto-elite_ticket-YYYY-MM-DD` and `auto-safe_pick-YYYY-MM-DD`. Existing manual products occupy the corresponding daily slot. Reservations survive admin deletion, so repeated/overlapping jobs neither duplicate nor recreate tickets. No old tickets or historical aggregates are migrated. Both active products use the existing VIP access rules and checkout prices (15 EUR / 10 EUR).

The existing `Najbolje od nas` links open `/tickets?active=1&category=elite_ticket` or `safe_pick`. This reuses the ticket-card layout with a bounded active-public-index query (50 rows plus six known current/upcoming product IDs), not the finished-history query. Private documents are fetched only for the existing verified FREE/VIP access level; guests/non-VIP get sanitized locked cards. `/history`, ordinary `/tickets` history links, checkout buttons and prices remain unchanged. The active subscription is bounded as well and refreshes cards when the public index changes.

The existing admin ticket editor handles all automated tickets. Admin edits preserve automation metadata; manual result/status changes are protected. Result polling uses the existing `/api/daily-results`, existing free result providers and existing GitHub runner. It checks a bounded active-ticket page, evaluates each leg from verified regular-time scores, and waits for the complete ticket before publishing the public result. Unsupported/unavailable results remain pending with `resultReviewRequired`, visible as `Provera rezultata` in admin. It never guesses a win/loss. Canceled legs are void, postponed legs remain postponed, and mixed win/void tickets use the actual remaining-leg price. Settlement updates the existing public history and incremental monthly/category statistics transactionally.

No new credential is required: server-only `ODDS_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_KEY`, `CRON_SECRET`, and the existing optional fixture/result-provider keys are already supported. `PRODUCT_TICKETS_ENABLED=false` pauses new product publication without stopping results for existing tickets. Default is enabled. Preview deployments cannot write product tickets to production.

The existing Vercel schedules stay daily: `0 8 * * *` for publication (09:00 Serbia in winter / 10:00 in summer), and `30 23 * * *` for results. This frequency is compatible with Hobby's once-daily limitation; Hobby can invoke within the configured hour rather than at an exact minute. The existing GitHub result workflow supplies the more frequent checks; no extra Vercel cron or paid API is introduced. Free-provider coverage and credits can still prevent publication and are logged rather than bypassed.

Safe manual verification, with an admin Firebase bearer token:

```text
POST /api/daily-picks?mode=products&date=YYYY-MM-DD&dryRun=true
Authorization: Bearer <Firebase admin ID token>
```

The date must be today, tomorrow or the day after in Serbia. Dry-run returns planned tickets, reasons and `plannedWrites`, and writes nothing. Omit `dryRun=true` only for an intentional real publication. Do not invoke `/api/daily-results` against production as a fake-result test: it performs real updates. `npm test` uses isolated transaction stores for publication, edits/deletion, real-score grading and aggregate tests, with no production test tickets.

## Incremental public statistics and history

Public pages only read `publicStats/summary`, `publicMonthlyStats` and up to 50 selected `publicStatsTickets` per page. The compact monthly ledger provides ordering/category/status filters without downloading every ticket. The summary and page cache persist locally; a public CDN export remains available if Firestore is unavailable. All roles use the same aggregate totals.

Explicit admin mutations and result settlement update the affected month and summary transactionally. No page refresh initiates a write or sync. Bootstrap/repair is manual:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH = 'C:\path\to\service-account.json'
npm run stats:rebuild
# Review plannedWrites first. No ticket data is modified by these commands.
npm run stats:rebuild:write
# Read-only database export to deploy-time public files:
npm run stats:rebuild -- --snapshot
```

The rebuild is incremental, defaults to dry-run and stops above 500 planned writes. Repeating it unchanged plans zero writes. Deploy the refreshed local snapshots when making a manual export.

Result checking also runs through `.github/workflows/daily-results.yml` every 30 minutes, independent of the once-daily Vercel cron. It uses signed, short-lived GitHub OIDC tokens restricted to this exact repository, workflow and `main` ref; no cron/API secret is stored in GitHub. Unavailable results remain pending with backoff and a rotating cursor, never guessed. GitHub schedules can be delayed. `workflow_dispatch` runs the same protected check manually.

### Active ticket display

The active public view reads at most 50 entries in the current Belgrade date window (the previous six dates through two dates ahead), plus the six known current/upcoming automatic product IDs. Only published pending/postponed tickets are displayed. Older unresolved tickets remain in the database and admin view; their results and historical statistics are not changed.

New generated ticket codes include a stable suffix derived from the ticket ID so simultaneous Elite/Safe publication has different references. Legacy active codes receive the same suffix when displayed. Completed historical codes and custom admin references are preserved; no database migration is needed.

### Individual Elite/Safe purchases

`/checkout?product=vip-ticket-day` (15 EUR) and `/checkout?product=safe-pick-day` (10 EUR) now bind a bank transfer to one published ticket and a verified, active account. The locked ticket card links directly to its checkout. A pending request records the server-calculated RSD amount, ticket code and unique transfer reference; it does not grant access or charge a payment method. The QR and payment instructions use those stored values. New requests stop at the first kickoff; existing paid requests can still be reviewed by support.

After independently checking the bank transfer, an administrator opens **Kupovine tiketa**, checks the payment-verification box and approves the exact request. Approval unlocks only that ticket for its owner; it does not set VIP membership or unlock other tickets. Administrators can revoke access. Hiding/deleting or recategorizing the ticket and blocking the owner also prevent individual access. Open ticket pages recheck purchases while visible, once per minute; every API read revalidates the grant.

`/api/ticket-purchases` requires a Firebase ID token, verifies revocation and checks the stored profile. Only the server reads/writes `ticketPurchases`; the existing default-deny client rules stay unchanged. This uses the existing `FIREBASE_SERVICE_ACCOUNT_KEY` and named database, with no rule migration or new payment provider. Buyer responses are private/no-store, omit the approving administrator and never include another user's purchases. The server owns prices (the optional `VITE_EUR_RSD_RATE` must match the deployment's rate), timestamps, references and approval state. Tests use isolated stores and do not approve any real transfer.

## Resend configuration

The app now sends verification, password reset, welcome, and contact emails through a secure backend endpoint using Resend.

1. Create a Resend account at https://resend.com/.
2. Add `RESEND_API_KEY` in your `.env.local` for local development and in Vercel Project Settings for production.
3. Verify `eliteviptips.com` in Resend. Authentication emails always send as `Elite VIP Tips <support@eliteviptips.com>`.
4. Set `RESEND_CONTACT_TO_EMAIL` for the internal contact-form recipient.
5. Optionally configure templates only for welcome/contact emails and set:
   - `RESEND_TEMPLATE_WELCOME_ID`
   - `RESEND_TEMPLATE_CONTACT_ID`
6. For verification and password reset links, add `FIREBASE_SERVICE_ACCOUNT_KEY` to your backend environment. The server generates secure Firebase action codes, then Resend sends source-controlled branded HTML.
7. Production authentication action buttons always open `https://eliteviptips.com/auth-action`; Firebase default email templates are not used.

Do not commit `.env`; it is ignored by git. Keep `RESEND_API_KEY` and `FIREBASE_SERVICE_ACCOUNT_KEY` secret.
