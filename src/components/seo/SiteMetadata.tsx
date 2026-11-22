import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { siteMetadata, SITE_STRUCTURED_DATA } from '../../seo/siteMetadata';

export default function SiteMetadata({prerendered=false}:{prerendered?:boolean}){
  const {pathname,search}=useLocation();
  const [active,setActive]=useState(!prerendered);
  useEffect(()=>{
    // React 19 hoists its own metadata instead of adopting the Vite HTML fallbacks.
    document.head.querySelectorAll('[data-site-fallback]').forEach(tag=>tag.remove());
    setActive(true);
  },[]);
  const {title,description,noindex,canonical}=siteMetadata(pathname,search);
  if(!active)return null;
  return <Helmet><html lang="sr-Latn"/><title>{title}</title><meta name="description" content={description}/><meta name="robots" content={noindex?'noindex,follow':'index,follow'}/><link rel="canonical" href={canonical}/><meta property="og:title" content={title}/><meta property="og:description" content={description}/><meta property="og:url" content={canonical}/><meta property="og:type" content="website"/><script type="application/ld+json">{JSON.stringify(SITE_STRUCTURED_DATA).replace(/</g,'\\u003c')}</script></Helmet>;
}
