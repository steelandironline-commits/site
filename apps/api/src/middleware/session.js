import { forbidden, unauthorized } from '@autopix/core';

export function cookieOptions(config, maxAgeMs) {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  };
}

export function setSessionCookie(res, config, token, expiresAt) {
  res.cookie(config.session.cookieName, token, cookieOptions(config, expiresAt.getTime() - Date.now()));
}

export function clearSessionCookie(res, config) {
  res.clearCookie(config.session.cookieName, cookieOptions(config));
}

/** Resolve the session cookie (if any) into req.session / req.user. */
export function loadSession({ auth, config }) {
  return async (req, res, next) => {
    const token = req.cookies?.[config.session.cookieName];
    if (!token) return next();
    try {
      const session = await auth.resolveSession(token);
      if (!session) {
        clearSessionCookie(res, config);
        return next();
      }
      req.session = session;
      req.user = session.user;
      req.sessionToken = token;
      if (session.refreshed) setSessionCookie(res, config, token, session.expiresAt);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/** Authentication: a FULL session of an ACTIVE user. */
export function requireAuth(req, res, next) {
  if (!req.session || req.session.scope !== 'FULL') return next(unauthorized());
  if (req.user.status !== 'ACTIVE') return next(forbidden('Sua conta ainda não foi ativada.'));
  return next();
}

/** Onboarding/checkout endpoints accept onboarding or full sessions. */
export function requireOnboardingSession(req, res, next) {
  if (!req.session) return next(unauthorized('Comece pelo cadastro para continuar.'));
  return next();
}

/** Authorization: restrict by role. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
    return next();
  };
}
