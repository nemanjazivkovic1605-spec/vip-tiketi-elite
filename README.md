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
2. For local AI analysis testing through `vercel dev`, set server-only `GEMINI_API_KEY` in an ignored `.env.local` file. Never use a `VITE_` prefix for this key.
3. Run the app:
   `npm run dev`

## Gemini DailyTips analysis setup

DailyTips AI analysis is generated through the server function at `/api/generate-daily-analysis`; the browser never receives the Gemini API key.

1. In Vercel, open Project Settings -> Environment Variables.
2. Add `GEMINI_API_KEY` for Production (and Preview only when needed).
3. Redeploy after adding or changing the environment variable.
4. In Admin -> Dnevni Tipovi, use `Generisi AI analizu` for a selected match or enable AI generation during manual API import.

If Gemini is unavailable or rate limited, the app stores a non-empty analysis fallback based on the selected match and pick.

## Contact form EmailJS setup

The public footer/contact email is `support@eliteviptips.com`, but contact form messages should be delivered to `nemanjazivkovic1605@gmail.com`.

1. Create an EmailJS account at https://www.emailjs.com/.
2. Add an email service connected to `nemanjazivkovic1605@gmail.com`.
3. Create an EmailJS template with these variables:
   - `from_name`
   - `reply_to`
   - `subject`
   - `message`
   - `to_email`
   - `site_name`
4. Use this template body:
   ```
   Ime: {{from_name}}
   Email korisnika: {{reply_to}}
   Naslov: {{subject}}
   Poruka: {{message}}
   ```
5. Set the EmailJS template recipient to `{{to_email}}` or directly to `nemanjazivkovic1605@gmail.com`.
6. Set the EmailJS template reply-to field to `{{reply_to}}`.
7. Copy `.env.example` to `.env` locally and set:
   - `VITE_EMAILJS_SERVICE_ID`
   - `VITE_EMAILJS_TEMPLATE_ID`
   - `VITE_EMAILJS_PUBLIC_KEY`
   - `VITE_CONTACT_DISPLAY_EMAIL=support@eliteviptips.com`
   - `VITE_CONTACT_TO_EMAIL=nemanjazivkovic1605@gmail.com`
8. Add the same `VITE_...` variables in Vercel Project Settings -> Environment Variables.

Do not commit `.env`; it is ignored by git. EmailJS public key is safe for browser use, but private EmailJS keys must never be placed in Vite frontend env variables.
