import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, post, onUnauthorized } from './api.js';
import { notifyLogoutToServiceWorker } from './pwa.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [state, setState] = useState({ loading: true, me: null, config: null });

  const refresh = useCallback(async () => {
    let offline = false;
    const [me, config] = await Promise.all([
      api('/api/session')
        .then((r) => r.session)
        .catch((err) => {
          if (err.status === 0) offline = true;
          return null;
        }),
      api('/api/config').catch(() => null),
    ]);
    setState((s) => ({ loading: false, me: offline ? s.me : me, config: config ?? s.config, offline }));
    return me;
  }, []);

  // Recover automatically when the connection comes back.
  useEffect(() => {
    const on = () => refresh();
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(
    () =>
      onUnauthorized(() => {
        setState((s) => (s.me ? { ...s, me: null, expired: true } : s));
      }),
    [],
  );

  const logout = useCallback(async () => {
    await post('/api/auth/logout').catch(() => {});
    notifyLogoutToServiceWorker();
    setState((s) => ({ ...s, me: null }));
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      demoMode: Boolean(state.config?.demoMode ?? state.me?.demoMode),
      isAuthenticated: state.me?.scope === 'FULL' && state.me?.user?.status === 'ACTIVE',
      refresh,
      logout,
    }),
    [state, refresh, logout],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}
