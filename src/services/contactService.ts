import emailjs from '@emailjs/browser';

export interface ContactFormPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const getEnvValue = (key: string) => {
  const value = import.meta.env[key];
  return typeof value === 'string' ? value.trim() : '';
};

export const CONTACT_DISPLAY_EMAIL =
  getEnvValue('VITE_CONTACT_DISPLAY_EMAIL') || 'support@elitetips.com';

export const CONTACT_TO_EMAIL =
  getEnvValue('VITE_CONTACT_TO_EMAIL') || 'nemanjazivkovic1605@gmail.com';

const EMAILJS_SERVICE_ID = getEnvValue('VITE_EMAILJS_SERVICE_ID');
const EMAILJS_TEMPLATE_ID = getEnvValue('VITE_EMAILJS_TEMPLATE_ID');
const EMAILJS_PUBLIC_KEY = getEnvValue('VITE_EMAILJS_PUBLIC_KEY');

export const isContactServiceConfigured = () =>
  Boolean(EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY);

export const sendContactMessage = async (payload: ContactFormPayload) => {
  if (!isContactServiceConfigured()) {
    throw new Error('Slanje trenutno nije podešeno. Proverite EmailJS environment variables.');
  }

  return emailjs.send(
    EMAILJS_SERVICE_ID,
    EMAILJS_TEMPLATE_ID,
    {
      from_name: payload.name,
      from_email: payload.email,
      reply_to: payload.email,
      subject: payload.subject,
      message: payload.message,
      to_email: CONTACT_TO_EMAIL,
      site_name: 'VIP Tiketi Elite',
    },
    {
      publicKey: EMAILJS_PUBLIC_KEY,
    },
  );
};
