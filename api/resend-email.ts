import type { IncomingMessage, ServerResponse } from 'node:http';
import { Resend } from 'resend';
import { initializeApp, cert, getApp, type App } from 'firebase-admin/app';
import { getAuth as getAdminAuth, type Auth as AdminAuth } from 'firebase-admin/auth';

const getEnvValue = (key: string, fallback = '') =>
  typeof process.env[key] === 'string' && process.env[key]?.trim()
    ? process.env[key]!.trim()
    : fallback;

const APP_URL = getEnvValue('APP_URL', 'https://eliteviptips.com');
const AUTH_ACTION_URL = getEnvValue('AUTH_ACTION_URL', `${APP_URL.replace(/\/+$/, '')}/auth-action`);
const RESEND_API_KEY = getEnvValue('RESEND_API_KEY');
const RESEND_FROM_EMAIL = getEnvValue('RESEND_FROM_EMAIL', 'Elite VIP Tips <support@eliteviptips.com>');
const RESEND_CONTACT_TO_EMAIL = getEnvValue('RESEND_CONTACT_TO_EMAIL', 'nemanjazivkovic1605@gmail.com');
const RESEND_TEMPLATE_EMAIL_VERIFICATION_ID = getEnvValue('RESEND_TEMPLATE_EMAIL_VERIFICATION_ID');
const RESEND_TEMPLATE_PASSWORD_RESET_ID = getEnvValue('RESEND_TEMPLATE_PASSWORD_RESET_ID');
const RESEND_TEMPLATE_WELCOME_ID = getEnvValue('RESEND_TEMPLATE_WELCOME_ID');
const RESEND_TEMPLATE_CONTACT_ID = getEnvValue('RESEND_TEMPLATE_CONTACT_ID');
const FIREBASE_SERVICE_ACCOUNT_KEY = getEnvValue('FIREBASE_SERVICE_ACCOUNT_KEY');

const parseJson = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

let adminApp: App | null = null;
let adminAuth: AdminAuth | null = null;

const initAdminSdk = () => {
  if (adminApp && adminAuth) return { adminApp, adminAuth };

  if (!FIREBASE_SERVICE_ACCOUNT_KEY) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable.');
  }

  const serviceAccount = parseJson(FIREBASE_SERVICE_ACCOUNT_KEY);
  if (!serviceAccount || typeof serviceAccount !== 'object') {
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON.');
  }

  adminApp = initializeApp({ credential: cert(serviceAccount as any) });
  adminAuth = getAdminAuth(adminApp);
  return { adminApp, adminAuth };
};

const resend = () => {
  if (!RESEND_API_KEY) {
    throw new Error('Missing RESEND_API_KEY environment variable.');
  }
  return new Resend(RESEND_API_KEY);
};

const sendJson = (response: ServerResponse, status: number, data: unknown) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(data));
};

const readBody = async (request: IncomingMessage) => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
};

const verifyIdToken = async (authorization?: string) => {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return null;
  const { adminAuth: auth } = initAdminSdk();
  if (!auth) return null;
  try {
    return await auth.verifyIdToken(token);
  } catch {
    return null;
  }
};

const buildActionCodeSettings = () => ({
  url: AUTH_ACTION_URL,
  handleCodeInApp: false,
});

const buildVerificationHtml = (displayName: string, link: string) => `<!DOCTYPE html>
<html lang="sr">
  <body style="font-family: Inter, Helvetica, Arial, sans-serif; margin:0; padding:0; background:#0a0a0a; color:#f8f4f0;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; background:#111827; border-radius:24px; overflow:hidden;">
            <tr>
              <td style="padding:32px; text-align:center; background:#111827;">
                <h1 style="margin:0; font-size:28px; line-height:1.1; color:#facc15;">Potvrdite email adresu</h1>
                <p style="margin:16px 0 0; color:#d1d5db;">Završite registraciju Elite VIP Tips naloga koristeći donji link.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px; color:#e5e7eb;">
                <p>Zdravo ${displayName},</p>
                <p>Hvala što ste se registrovali. Kliknite na dugme ispod da potvrdite svoju email adresu i aktivirate pristup.</p>
                <p style="text-align:center; margin:32px 0;"><a href="${link}" style="display:inline-block; padding:16px 28px; background:#facc15; color:#111827; text-decoration:none; font-weight:700; border-radius:9999px;">Potvrdite email</a></p>
                <p>Ako niste tražili ovaj email, slobodno ga ignorišite.</p>
                <p style="margin:0; color:#9ca3af;">Elite VIP Tips</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const buildResetHtml = (link: string) => `<!DOCTYPE html>
<html lang="sr">
  <body style="font-family: Inter, Helvetica, Arial, sans-serif; margin:0; padding:0; background:#0a0a0a; color:#f8f4f0;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; background:#111827; border-radius:24px; overflow:hidden;">
            <tr>
              <td style="padding:32px; text-align:center; background:#111827;">
                <h1 style="margin:0; font-size:28px; line-height:1.1; color:#facc15;">Reset lozinke</h1>
                <p style="margin:16px 0 0; color:#d1d5db;">Podesite novu lozinku putem sledećeg linka.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px; color:#e5e7eb;">
                <p>Zatražena je promena lozinke za vaš Elite VIP Tips nalog.</p>
                <p style="text-align:center; margin:32px 0;"><a href="${link}" style="display:inline-block; padding:16px 28px; background:#facc15; color:#111827; text-decoration:none; font-weight:700; border-radius:9999px;">Resetuj lozinku</a></p>
                <p>Ako niste tražili reset lozinke, možete bezbedno ignorisati ovaj email.</p>
                <p style="margin:0; color:#9ca3af;">Elite VIP Tips</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const buildWelcomeHtml = (name: string, planName?: string) => `<!DOCTYPE html>
<html lang="sr">
  <body style="font-family: Inter, Helvetica, Arial, sans-serif; margin:0; padding:0; background:#0a0a0a; color:#f8f4f0;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; background:#111827; border-radius:24px; overflow:hidden;">
            <tr>
              <td style="padding:32px; text-align:center; background:#111827;">
                <h1 style="margin:0; font-size:28px; line-height:1.1; color:#facc15;">Dobrodošli u Elite VIP Tips</h1>
                <p style="margin:16px 0 0; color:#d1d5db;">Vaš nalog je aktivan i spreman za VIP savete.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px; color:#e5e7eb;">
                <p>Zdravo ${name},</p>
                <p>Hvala što ste se priključili. Vaš paket je: <strong>${planName || 'FREE'}</strong>. Ulogujte se i pratite dnevne VIP analize.</p>
                <p style="margin:0; color:#9ca3af;">Elite VIP Tips</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const buildContactHtml = (name: string, email: string, subject: string, message: string) => `<!DOCTYPE html>
<html lang="sr">
  <body style="font-family: Inter, Helvetica, Arial, sans-serif; margin:0; padding:0; background:#0a0a0a; color:#f8f4f0;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; background:#111827; border-radius:24px; overflow:hidden;">
            <tr>
              <td style="padding:32px; text-align:center; background:#111827;">
                <h1 style="margin:0; font-size:28px; line-height:1.1; color:#facc15;">Nova poruka sa sajta</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px; color:#e5e7eb;">
                <p><strong>Ime:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Naslov:</strong> ${subject}</p>
                <p><strong>Poruka:</strong></p>
                <p style="white-space:pre-wrap;">${message}</p>
                <p style="margin:24px 0 0; color:#9ca3af;">Elite VIP Tips</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const sendEmail = async (options: Record<string, unknown>) => {
  const client = resend();
  return client.emails.send(options as any);
};

const safeString = (value?: unknown) => String(value ?? '').trim();

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  if (!RESEND_API_KEY) {
    sendJson(response, 500, { error: 'Resend email is not configured.' });
    return;
  }

  try {
    const body = await readBody(request);
    const type = safeString(body.type) as string;

    if (type === 'verification') {
      const email = safeString(body.email);
      if (!email) {
        sendJson(response, 400, { error: 'Email is required for verification email.' });
        return;
      }

      const tokenData = await verifyIdToken(request.headers.authorization?.toString());
      if (!tokenData || tokenData.email !== email) {
        sendJson(response, 401, { error: 'Unauthorized verification email request.' });
        return;
      }

      const { adminAuth } = initAdminSdk();
      const verificationLink = await adminAuth.generateEmailVerificationLink(email, buildActionCodeSettings());
      const displayName = tokenData.name || email.split('@')[0];
      const templateId = RESEND_TEMPLATE_EMAIL_VERIFICATION_ID;
      const payload: Record<string, unknown> = {
        from: RESEND_FROM_EMAIL,
        to: email,
      };

      if (templateId) {
        payload.template = templateId;
        payload.template_data = {
          name: displayName,
          verify_url: verificationLink,
          email,
        };
      } else {
        payload.subject = 'Potvrdite email adresu – Elite VIP Tips';
        payload.html = buildVerificationHtml(displayName, verificationLink);
      }

      await sendEmail(payload);
      sendJson(response, 200, { success: true });
      return;
    }

    if (type === 'passwordReset') {
      const email = safeString(body.email);
      if (!email) {
        sendJson(response, 400, { error: 'Email is required for password reset.' });
        return;
      }

      const { adminAuth } = initAdminSdk();
      const resetLink = await adminAuth.generatePasswordResetLink(email, buildActionCodeSettings());
      const templateId = RESEND_TEMPLATE_PASSWORD_RESET_ID;
      const payload: Record<string, unknown> = {
        from: RESEND_FROM_EMAIL,
        to: email,
      };

      if (templateId) {
        payload.template = templateId;
        payload.template_data = {
          reset_url: resetLink,
          email,
        };
      } else {
        payload.subject = 'Reset lozinke – Elite VIP Tips';
        payload.html = buildResetHtml(resetLink);
      }

      await sendEmail(payload);
      sendJson(response, 200, { success: true });
      return;
    }

    if (type === 'welcome') {
      const email = safeString(body.email);
      const name = safeString(body.name);
      const planName = safeString(body.planName) || 'FREE';
      if (!email || !name) {
        sendJson(response, 400, { error: 'Email and name are required for welcome email.' });
        return;
      }

      const templateId = RESEND_TEMPLATE_WELCOME_ID;
      const payload: Record<string, unknown> = {
        from: RESEND_FROM_EMAIL,
        to: email,
      };

      if (templateId) {
        payload.template = templateId;
        payload.template_data = {
          name,
          plan_name: planName,
          login_url: `${APP_URL.replace(/\/+$/, '')}/login`,
          support_email: RESEND_FROM_EMAIL,
        };
      } else {
        payload.subject = 'Dobrodošli u Elite VIP Tips';
        payload.html = buildWelcomeHtml(name, planName);
      }

      await sendEmail(payload);
      sendJson(response, 200, { success: true });
      return;
    }

    if (type === 'contact') {
      const name = safeString(body.name);
      const email = safeString(body.email);
      const subject = safeString(body.subject);
      const message = safeString(body.message);
      if (!name || !email || !subject || !message) {
        sendJson(response, 400, { error: 'All contact fields are required.' });
        return;
      }

      const templateId = RESEND_TEMPLATE_CONTACT_ID;
      const payload: Record<string, unknown> = {
        from: RESEND_FROM_EMAIL,
        to: RESEND_CONTACT_TO_EMAIL,
      };

      if (templateId) {
        payload.template = templateId;
        payload.template_data = {
          from_name: name,
          from_email: email,
          subject,
          message,
          reply_to: email,
        };
      } else {
        payload.subject = `Nova kontakt poruka: ${subject}`;
        payload.html = buildContactHtml(name, email, subject, message);
      }

      await sendEmail(payload);
      sendJson(response, 200, { success: true });
      return;
    }

    sendJson(response, 400, { error: 'Unsupported email type.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Resend email handler error:', message, error);
    sendJson(response, 500, { error: 'Email delivery failed.' });
  }
}
