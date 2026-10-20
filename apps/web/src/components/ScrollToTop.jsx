import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Volta ao topo a cada troca de página (menos quando a URL tem âncora). */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}
