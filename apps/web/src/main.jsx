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
import './styles/global.css';
import App from './App.jsx';
import { SessionProvider } from './lib/session.jsx';
import { ToastProvider } from './lib/toast.jsx';
import { registerServiceWorker } from './lib/pwa.js';

registerServiceWorker();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <SessionProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </SessionProvider>
      </MotionConfig>
    </BrowserRouter>
  </StrictMode>,
);
