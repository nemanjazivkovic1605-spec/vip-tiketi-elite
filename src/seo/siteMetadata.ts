export const SITE_ORIGIN = 'https://eliteviptips.com';
export const SITE_PAGES: Record<string, readonly [string, string]> = {
  '/': ['Elite VIP Tips | Fudbalska statistika i sportski tipovi', 'Fudbalski raspored, forma timova, HT/FT statistika i javna istorija objavljenih tipova.'],
  '/history': ['Istorija sportskih tipova | Elite VIP Tips', 'Javni pregled završenih Elite Tiket, Safe Pick i VIP mesečnih tipova sa stvarnim rezultatima.'],
  '/tickets': ['Istorija sportskih tipova | Elite VIP Tips', 'Završeni sportski tipovi, rezultati i istorija Elite VIP Tips platforme.'],
  '/stats': ['Statistika objavljenih tipova | Elite VIP Tips', 'Prolaznost, profit u jedinicama, yield i mesečni pregled objavljenih tipova.'],
  '/contact': ['Kontakt i podrška | Elite VIP Tips', 'Kontaktirajte Elite VIP Tips podršku preko forme, emaila ili Facebook stranice.'],
  '/terms': ['Pravila korišćenja | Elite VIP Tips', 'Pravila korišćenja, odgovorno klađenje i pravno odricanje odgovornosti.'],
  '/faq': ['Česta pitanja | Elite VIP Tips', 'Odgovori na pitanja o FREE i VIP pristupu, članarinama i sportskim analizama.'],
  '/bankroll-management': ['Bankroll Management i Unit kalkulator | Elite VIP Tips', 'Unit sistem i kalkulator za odgovorno upravljanje budžetom.'],
  '/daily-analysis': ['Naš pristup sportskoj analizi | Elite VIP Tips', 'Statistika, forma, tržište kvota i procena rizika u sportskoj analizi.'],
  '/early-information': ['Rane informacije i kretanje kvota | Elite VIP Tips', 'Uloga pravovremenih informacija, kretanja kvota i odgovornog pristupa analizi.'],
};
export const APP_PATHS = ['/', '/tickets', '/history', '/table', '/results', '/live-results', '/live', '/stats', '/statistics', '/contact', '/faq', '/cesta-pitanja',
  '/bankroll-management', '/daily-analysis', '/daily-tips', '/dnevne-analize', '/dnevni-tipovi', '/early-information', '/terms', '/legal', '/pravila-koriscenja',
  '/login', '/register', '/checkout', '/auth-action', '/__/auth/action', '/dashboard', '/pricing', '/vip', '/vip-tips'];
export const isAppPath = (path: string) => APP_PATHS.includes(path) || path === '/admin' || path.startsWith('/admin/');
export const SITE_STRUCTURED_DATA = { '@context': 'https://schema.org', '@graph': [
  { '@type': 'Organization', '@id': SITE_ORIGIN + '/#organization', name: 'Elite VIP Tips', url: SITE_ORIGIN,
    logo: SITE_ORIGIN + '/favicon.svg', sameAs: ['https://www.facebook.com/eliteviptip/'] },
  { '@type': 'WebSite', '@id': SITE_ORIGIN + '/#website', name: 'Elite VIP Tips', url: SITE_ORIGIN, inLanguage: 'sr-Latn', publisher: { '@id': SITE_ORIGIN + '/#organization' } },
] };
export function siteMetadata(pathname: string, search = '') {
  const [title, description] = SITE_PAGES[pathname] || ['Elite VIP Tips', 'Sportska statistika i Elite VIP Tips zajednica.'];
  const params = new URLSearchParams(search);
  const noindex = !SITE_PAGES[pathname] || ['active', 'ticket', 'ticketId', 'access', 'token'].some(key => params.has(key));
  return { title, description, noindex, canonical: SITE_ORIGIN + (pathname === '/tickets' ? '/history' : pathname) };
}
