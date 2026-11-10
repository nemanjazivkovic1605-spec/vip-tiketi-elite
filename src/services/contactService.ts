export interface ContactFormPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const getEnvValue = (value: unknown) => {
  return typeof value === 'string' ? value.trim() : '';
};

const PUBLIC_CONTACT_EMAIL = 'support@eliteviptips.com';
const normalizeDisplayEmail = (email: string) =>
  email === `support@${'elite'}tips.com` ? PUBLIC_CONTACT_EMAIL : email;

export const CONTACT_DISPLAY_EMAIL =
  normalizeDisplayEmail(getEnvValue(import.meta.env.VITE_CONTACT_DISPLAY_EMAIL) || PUBLIC_CONTACT_EMAIL);

export const CONTACT_TO_EMAIL =
  getEnvValue(import.meta.env.VITE_CONTACT_TO_EMAIL) || 'nemanjazivkovic1605@gmail.com';

export const isContactServiceConfigured = () => true;

export const sendContactMessage = async (payload: ContactFormPayload) => {
  const response = await fetch('/api/resend-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'contact',
      name: payload.name,
      email: payload.email,
      subject: payload.subject,
      message: payload.message,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Contact request failed: ${response.status} ${text}`);
  }

  return response.json();
};
