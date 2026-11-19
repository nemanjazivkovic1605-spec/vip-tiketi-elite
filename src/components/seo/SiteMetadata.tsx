import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

const pages:Record<string,[string,string]>={
  '/':['Elite VIP Tips | Fudbalska statistika i sportski tipovi','Fudbalski raspored, forma timova, HT/FT statistika i javna istorija objavljenih tipova.'],
  '/history':['Istorija sportskih tipova | Elite VIP Tips','Javni pregled završenih Elite Tiket, Safe Pick i VIP mesečnih tipova sa stvarnim rezultatima.'],
  '/tickets':['Istorija sportskih tipova | Elite VIP Tips','Završeni sportski tipovi, rezultati i istorija Elite VIP Tips platforme.'],
  '/stats':['Statistika objavljenih tipova | Elite VIP Tips','Prolaznost, profit u jedinicama, yield i mesečni pregled objavljenih tipova.'],
  '/contact':['Kontakt i podrška | Elite VIP Tips','Kontaktirajte Elite VIP Tips podršku preko forme, emaila ili Facebook stranice.'],
  '/terms':['Pravila korišćenja | Elite VIP Tips','Pravila korišćenja, odgovorno klađenje i pravno odricanje odgovornosti.'],
  '/faq':['Česta pitanja | Elite VIP Tips','Odgovori na pitanja o FREE i VIP pristupu, članarinama i sportskim analizama.'],
  '/bankroll-management':['Bankroll Management i Unit kalkulator | Elite VIP Tips','Unit sistem i kalkulator za odgovorno upravljanje budžetom.'],
  '/daily-analysis':['Naš pristup sportskoj analizi | Elite VIP Tips','Statistika, forma, tržište kvota i procena rizika u sportskoj analizi.'],
  '/early-information':['Rane informacije i kretanje kvota | Elite VIP Tips','Uloga pravovremenih informacija, kretanja kvota i odgovornog pristupa analizi.'],
};
export default function SiteMetadata(){
  const {pathname}=useLocation();
  useEffect(()=>{
    // React 19 hoists its own metadata instead of adopting the Vite HTML fallbacks.
    document.head.querySelectorAll('[data-site-fallback]').forEach(tag=>tag.remove());
  },[]);
  const [title,description]=pages[pathname]||['Elite VIP Tips','Sportska statistika i Elite VIP Tips zajednica.'];
  const privatePage=!pages[pathname];
  const canonical=`https://eliteviptips.com${pathname==='/tickets'?'/history':pathname}`;
  return <Helmet><html lang="sr-Latn"/><title>{title}</title><meta name="description" content={description}/><meta name="robots" content={privatePage?'noindex,follow':'index,follow'}/><link rel="canonical" href={canonical}/><meta property="og:title" content={title}/><meta property="og:description" content={description}/><meta property="og:url" content={canonical}/><meta property="og:type" content="website"/></Helmet>;
}
