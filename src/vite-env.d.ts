/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EMAILJS_SERVICE_ID?: string;
  readonly VITE_EMAILJS_TEMPLATE_ID?: string;
  readonly VITE_EMAILJS_PUBLIC_KEY?: string;
  readonly VITE_CONTACT_DISPLAY_EMAIL?: string;
  readonly VITE_CONTACT_TO_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
