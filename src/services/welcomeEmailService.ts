const APP_BASE_URL = (import.meta.env.VITE_APP_URL || 'https://eliteviptips.com').replace(/\/+$/, '');

type WelcomeEmailPayload = {
  email: string;
  name: string;
  planName?: string;
};

export const sendWelcomeEmail = async ({ email, name, planName }: WelcomeEmailPayload) => {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_WELCOME_TEMPLATE_ID;
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !publicKey) {
    return;
  }

  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: {
      name,
      email,
      to_email: email,
      reply_to: 'support@eliteviptips.com',
      support_email: 'support@eliteviptips.com',
      title: 'Dobrodošli u Elite VIP Tips',
      plan_name: planName || 'FREE',
      login_url: `${APP_BASE_URL}/login`,
      message: 'Vaš nalog je kreiran. Potvrdite email adresu, a VIP pristup će biti aktiviran nakon admin provere uplate.',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`EmailJS welcome email failed: ${response.status}`);
  }
};
