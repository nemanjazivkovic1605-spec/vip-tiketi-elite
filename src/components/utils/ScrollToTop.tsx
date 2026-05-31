import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const scrollToHash = () => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const animationFrame = requestAnimationFrame(scrollToHash);
      const retries = [120, 360, 800].map((delay) => window.setTimeout(scrollToHash, delay));

      return () => {
        cancelAnimationFrame(animationFrame);
        retries.forEach((retry) => window.clearTimeout(retry));
      };
    }

    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}
