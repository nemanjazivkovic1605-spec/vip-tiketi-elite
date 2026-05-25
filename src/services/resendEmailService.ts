type ResendVerificationPayload = {
  type: 'verification';
  email: string;
};

type ResendPasswordResetPayload = {
  type: 'passwordReset';
  email: string;
};

type ResendWelcomePayload = {
  type: 'welcome';
  email: string;
  name: string;
  planName?: string;
};

type ResendContactPayload = {
  type: 'contact';
  name: string;
  email: string;
  subject: string;
  message: string;
};

type ResendEmailPayload =
  | ResendVerificationPayload
  | ResendPasswordResetPayload
  | ResendWelcomePayload
  | ResendContactPayload;

const API_ENDPOINT = '/api/resend-email';

const sendResendRequest = async (payload: ResendEmailPayload, authToken?: string) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Email service request failed: ${response.status} ${text}`);
  }

  return response.json();
};

export const resendEmailService = {
  sendVerificationEmail: async (email: string, authToken?: string) => {
    await sendResendRequest({ type: 'verification', email }, authToken);
  },

  sendPasswordResetEmail: async (email: string) => {
    await sendResendRequest({ type: 'passwordReset', email });
  },

  sendWelcomeEmail: async ({ email, name, planName }: { email: string; name: string; planName?: string }) => {
    await sendResendRequest({ type: 'welcome', email, name, planName });
  },

  sendContactMessage: async (payload: ResendContactPayload) => {
    await sendResendRequest(payload);
  },
};
