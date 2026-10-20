import { useEffect, useState, useSyncExternalStore } from 'react';
import { api, post, del } from './api.js';

// ------------------------------------------------------------ service worker

const updateListeners = new Set();
let waitingWorker = null;
let updateRequested = false;

/** Register /sw.js in production builds and surface "update available". */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const track = (worker) => {
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorker = worker;
            updateListeners.forEach((fn) => fn(true));
          }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) {
        waitingWorker = reg.waiting;
        updateListeners.forEach((fn) => fn(true));
      }
      reg.addEventListener('updatefound', () => track(reg.installing));
      // Check for updates when the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
      // Reload only when the user chose to apply an update — never on the
      // first install (clients.claim() also fires controllerchange).
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!updateRequested) return;
        updateRequested = false;
        window.location.reload();
      });
    } catch {
      /* SW is progressive enhancement */
    }
  });
}

export function useServiceWorkerUpdate() {
  const [available, setAvailable] = useState(Boolean(waitingWorker));
  useEffect(() => {
    updateListeners.add(setAvailable);
    return () => updateListeners.delete(setAvailable);
  }, []);
  return {
    available,
    apply: () => {
      updateRequested = true;
      waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
    },
  };
}

export function notifyLogoutToServiceWorker() {
  navigator.serviceWorker?.controller?.postMessage({ type: 'LOGOUT' });
}

// ---------------------------------------------------------------- install UX

let deferredPrompt = null;
const installListeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installListeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installListeners.forEach((fn) => fn());
  });
}

const standaloneQuery = typeof window !== 'undefined' ? window.matchMedia('(display-mode: standalone)') : null;
export function isStandalone() {
  return Boolean(standaloneQuery?.matches || window.navigator.standalone);
}

export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function useInstallPrompt() {
  const canPrompt = useSyncExternalStore(
    (cb) => {
      installListeners.add(cb);
      standaloneQuery?.addEventListener('change', cb);
      return () => {
        installListeners.delete(cb);
        standaloneQuery?.removeEventListener('change', cb);
      };
    },
    () => Boolean(deferredPrompt),
    () => false,
  );
  const installed = typeof window !== 'undefined' && isStandalone();
  return {
    installed,
    canPrompt,
    iosInstructions: !installed && !canPrompt && typeof window !== 'undefined' && isIos(),
    async prompt() {
      if (!deferredPrompt) return 'unavailable';
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      installListeners.forEach((fn) => fn());
      return outcome;
    },
  };
}

// ---------------------------------------------------------------- web push

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getPushState() {
  if (!pushSupported()) return { supported: false };
  const { publicKey } = await api('/api/notifications/push/public-key');
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return { supported: true, configured: Boolean(publicKey), subscribed: Boolean(sub), permission: Notification.permission, publicKey };
}

export async function enablePush() {
  const { publicKey } = await api('/api/notifications/push/public-key');
  if (!publicKey) throw new Error('Notificações push ainda não foram configuradas no servidor.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permissão de notificação negada.');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  const json = sub.toJSON();
  await post('/api/notifications/push/subscriptions', { endpoint: json.endpoint, keys: json.keys });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    await del('/api/notifications/push/subscriptions', { body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  }
}
