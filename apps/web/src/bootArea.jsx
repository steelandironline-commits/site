import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@autopix/ui/styles/global.css';
// "@area" é um alias do build (vite.config.js): aponta para src/areas/<área do build>. O Vite só
// enxerga o código da área atual; a entrada de cada área (areas/<área>/main.jsx) só passa a marca.
import '@area/theme.css';
import App from '@area/App.jsx';
import { BrandProvider, SessionProvider, registerServiceWorker } from '@autopix/ui';
import { ToastProvider } from './lib/toast.jsx';

/** Monta o app da área. `brand` é o AREA_BRAND de packages/areas/src/brand/<área>.js. */
export function bootArea(brand) {
  registerServiceWorker();

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <BrowserRouter>
        <MotionConfig reducedMotion="user">
          <BrandProvider brand={brand}>
            <SessionProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </SessionProvider>
          </BrandProvider>
        </MotionConfig>
      </BrowserRouter>
    </StrictMode>,
  );
}
