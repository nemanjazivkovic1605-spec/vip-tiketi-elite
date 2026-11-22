import React, { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import App from '../../src/App.js';
import Home from '../../src/pages/Home.js';
import Contact from '../../src/pages/Contact.js';
import Faq from '../../src/pages/Faq.js';
import Terms from '../../src/pages/Terms.js';
import BankrollManagement from '../../src/pages/BankrollManagement.js';
import DailyAnalysis from '../../src/pages/DailyAnalysis.js';
import EarlyInformation from '../../src/pages/EarlyInformation.js';
export { SITE_PAGES, SITE_STRUCTURED_DATA, siteMetadata } from '../../src/seo/siteMetadata.js';

const publicPages: Record<string, React.ComponentType> = { '/': Home, '/contact': Contact, '/faq': Faq, '/terms': Terms,
  '/bankroll-management': BankrollManagement, '/daily-analysis': DailyAnalysis, '/early-information': EarlyInformation };

export function renderSitePage(path: string): string {
  if (!publicPages[path]) throw new Error('Ova stranica nije odobrena za javni prerender.');
  const html = renderToString(<StrictMode><StaticRouter location={path}><App prerendered pageOverrides={publicPages}/></StaticRouter></StrictMode>);
  if (html.includes('<!--$!-->') || /<div hidden id="S:/.test(html)) throw new Error('Javni sadržaj ne sme ostati iza Suspense fallback-a.');
  return html;
}
