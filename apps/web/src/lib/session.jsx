import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, post, onUnauthorized } from './api.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [state, setState] = useState({ loading: true, me: null, config: null });

  const refresh = useCallback(async () => {
    const [me, config] = await Promise.all([
      api('/api/session').then((r) => r.session).catch(() => null),
      api('/api/config').catch(() => null),
    ]);
    setState({ loading: false, me, config });
    return me;
  }, []);

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
