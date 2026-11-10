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
