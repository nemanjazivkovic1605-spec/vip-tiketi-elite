import { build } from 'esbuild';
import { loadEnv } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../.local-data/seo-prerender/site.mjs', import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
const environment = { ...loadEnv('production', root, 'VITE_'), ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('VITE_'))),
  SSR: true, PROD: true, DEV: false, MODE: 'production', BASE_URL: '/' };
const verification = (process.env.GOOGLE_SITE_VERIFICATION || loadEnv('production', root, 'GOOGLE_SITE_VERIFICATION').GOOGLE_SITE_VERIFICATION || '').trim();
if (verification && !/^[A-Za-z0-9_-]{10,200}$/.test(verification)) throw new Error('GOOGLE_SITE_VERIFICATION mora sadržati samo vrednost HTML verification tokena, ne ceo meta tag.');
await build({ absWorkingDir: root, entryPoints: ['server/seo/prerender.tsx'], outfile: fileURLToPath(output),
  platform: 'node', target: 'node24', format: 'esm', bundle: true, packages: 'external', jsx: 'automatic',
  define: { 'import.meta.env': JSON.stringify(environment) }, logLevel: 'warning' });
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Prerender ne sme pozivati mrežu, Firestore ili sportske API-je.'); };
const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
try {
  const { renderSitePage, SITE_PAGES, SITE_STRUCTURED_DATA, siteMetadata } = await import(output.href);
  const template = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const head = path => {
    const meta = siteMetadata(path);
    return `<title data-site-fallback="true">${escape(meta.title)}</title><meta data-site-fallback="true" name="description" content="${escape(meta.description)}"><meta data-site-fallback="true" name="robots" content="${meta.noindex ? 'noindex,follow' : 'index,follow'}"><link data-site-fallback="true" rel="canonical" href="${meta.canonical}"><meta data-site-fallback="true" property="og:title" content="${escape(meta.title)}"><meta data-site-fallback="true" property="og:description" content="${escape(meta.description)}"><meta data-site-fallback="true" property="og:url" content="${meta.canonical}"><meta data-site-fallback="true" property="og:type" content="website">${path === '/' && verification ? `<meta name="google-site-verification" content="${verification}">` : ''}`;
  };
  const skeleton = template.replace(/<(title|meta|link)\b(?=[^>]*data-site-fallback="true")[^>]*(?:>[\s\S]*?<\/title>|\/?>)/gi, '').replace(/<noscript>[\s\S]*?<\/noscript>/i, '');
  const privateShell = skeleton.replace('</head>', '<title data-site-fallback="true">Elite VIP Tips</title><meta data-site-fallback="true" name="robots" content="noindex,follow"></head>');
  await writeFile(new URL('../dist/app.html', import.meta.url), privateShell);
  const staticPages = ['/', '/contact', '/faq', '/terms', '/bankroll-management', '/daily-analysis', '/early-information'];
  for (const path of staticPages) {
    const body = await renderSitePage(path);
    assert(body.includes('<h1'), `Nedostaje naslov u prerender-u: ${path}`);
    assert(!/\buserEmail\b|accessToken|refreshToken/.test(body), `Prerender ne sme sadržati privatne podatke: ${path}`);
    const markup = skeleton.replace('</head>', `${head(path)}<script data-site-fallback="true" type="application/ld+json">${JSON.stringify(SITE_STRUCTURED_DATA).replace(/</g, '\\u003c')}</script></head>`)
      .replace('<div id="root"></div>', `<div id="root" data-prerendered="true">${body}</div>`);
    const target = path === '/' ? 'index' : path.slice(1);
    await writeFile(new URL(`../dist/${target}.html`, import.meta.url), markup);
  }
  // Live ticket/statistics data stay client-side and read-only; no fake snapshot is generated at build time.
  for (const path of ['/history', '/stats']) {
    const [title, description] = SITE_PAGES[path];
    const markup = skeleton.replace('</head>', head(path) + '</head>').replace('</body>', `<noscript><section><h1>${escape(title)}</h1><p>${escape(description)}</p><p>Za interaktivni pregled rezultata uključite JavaScript. <a href="/fudbal">Javna fudbalska statistika dostupna je i bez JavaScript-a.</a></p></section></noscript></body>`);
    await writeFile(new URL(`../dist/${path.slice(1)}.html`, import.meta.url), markup);
  }
  console.log(`Prerendered ${staticPages.length} existing public pages without network or database access.`);
} finally {
  globalThis.fetch = originalFetch;
}
