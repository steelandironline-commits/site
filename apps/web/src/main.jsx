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
import { PLATFORM_BRAND } from '@autopix/areas/brand/platform';
import App from './App.jsx';
import { BrandProvider, SessionProvider, registerServiceWorker } from '@autopix/ui';
import { ToastProvider } from './lib/toast.jsx';

registerServiceWorker();

// Build legado (até o go-live): a marca é a da plataforma, com os textos de sempre.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <BrandProvider brand={PLATFORM_BRAND}>
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
