import { useEffect, useState } from 'react';

/** Minimal hash router: '#/auction/3' -> ['auction', '3']. */
export function useHashRoute(): { path: string; segments: string[]; navigate: (to: string) => void } {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const path = hash.replace(/^#/, '') || '/';
  const segments = path.split('/').filter(Boolean);
  return {
    path,
    segments,
    navigate: (to: string) => {
      window.location.hash = to;
    },
  };
}
