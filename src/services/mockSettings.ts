import { AppSettings } from '../types';

const SETTINGS_KEY = 'elite_tips_settings';
const SETTINGS_UPDATED_EVENT = 'elite_settings_updated';

const DEFAULT_SETTINGS: AppSettings = {
  telegramLink: 'https://t.me/elitetips',
  whatsappLink: 'https://wa.me/381600000000',
  instagramLink: 'https://instagram.com/elitetips',
  viberLink: 'viber://chat?number=%2B381600000000',
  contactEmail: 'support@elitetips.com',
};

const readSettings = (): AppSettings => {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
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
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...settings }));
    window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));
  },

  resetSettings: (): void => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));
  },
};
