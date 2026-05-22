import { AppSettings } from '../types';

const SETTINGS_KEY = 'elite_tips_settings';
const SETTINGS_UPDATED_EVENT = 'elite_settings_updated';
const PUBLIC_CONTACT_EMAIL = 'support@eliteviptips.com';
const normalizeContactEmail = (email: string) =>
  email === `support@${'elite'}tips.com` ? PUBLIC_CONTACT_EMAIL : email;

const DEFAULT_SETTINGS: AppSettings = {
  telegramLink: 'https://t.me/elitetips',
  whatsappLink: 'https://wa.me/381600000000',
  instagramLink: 'https://instagram.com/elitetips',
  viberLink: 'viber://chat?number=%2B381600000000',
  contactEmail: PUBLIC_CONTACT_EMAIL,
};

const readSettings = (): AppSettings => {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    const settings = stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
    return {
      ...settings,
      contactEmail: normalizeContactEmail(settings.contactEmail),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const mockSettingsService = {
  getSettings: (): AppSettings => {
    const settings = readSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return settings;
  },

  saveSettings: (settings: AppSettings): void => {
    const nextSettings = { ...DEFAULT_SETTINGS, ...settings };
    nextSettings.contactEmail = normalizeContactEmail(nextSettings.contactEmail);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(nextSettings));
    window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));
  },

  resetSettings: (): void => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));
  },
};
