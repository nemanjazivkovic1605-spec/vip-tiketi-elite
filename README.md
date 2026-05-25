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
4. In Admin -> Dnevni Tipovi, use `Generisi AI analizu` for a selected match or enable AI generation during manual API import.

If Gemini is unavailable or rate limited, the app stores a non-empty analysis fallback based on the selected match and pick.

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
