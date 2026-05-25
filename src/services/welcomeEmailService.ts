import { resendEmailService } from './resendEmailService';

type WelcomeEmailPayload = {
  email: string;
  name: string;
  planName?: string;
};

export const sendWelcomeEmail = async ({ email, name, planName }: WelcomeEmailPayload) => {
  await resendEmailService.sendWelcomeEmail({ email, name, planName });
};
