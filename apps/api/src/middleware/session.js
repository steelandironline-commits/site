import { AREAS } from '@autopix/areas';
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

/**
 * Nome e atributos do cookie de sessão de uma área (ARQUITETURA, seção 6.1). `area` é a área do
 * HOST (`req.area`): um host, um cookie. O admin no host CNPJ (sem ADMIN_HOST) usa o cookie do CNPJ.
 *
 * - Modo legado: `ap_session` com os atributos de sempre, qualquer que seja a área.
 * - Modo de áreas, produção (https): __Host-ap_session (CNPJ), __Host-ap_session_cpf (CPF) e
 *   __Host-ap_session_admin (ADMIN). O prefixo __Host- impede que um subdomínio grave um cookie
 *   com Domain= que valha no host vizinho.
 * - Modo de áreas, desenvolvimento (http): os mesmos nomes sem o prefixo.
 *
 * Atributos sempre HttpOnly, SameSite=Lax, Path=/ e sem Domain; Secure só em https.
 * Em modo de áreas, uma área desconhecida lança erro: nunca cai no nome legado.
 */
export function cookieFor(area, config, maxAgeMs) {
  if (!config.areas?.enabled) return { name: config.session.cookieName, options: cookieOptions(config, maxAgeMs) };
  if (!AREAS.includes(area)) throw new TypeError(`cookieFor: área desconhecida: ${String(area)}`);
  const base = config.session.cookieName;
  const suffix = area === 'CNPJ' ? '' : `_${area.toLowerCase()}`;
  const prefix = config.isProduction ? '__Host-' : '';
  return { name: `${prefix}${base}${suffix}`, options: cookieOptions(config, maxAgeMs) };
}

/** Nome do cookie que este pedido lê, ou null se o host não tem área (modo de áreas). */
export function sessionCookieName(req, config) {
  if (!config.areas?.enabled) return config.session.cookieName;
  return AREAS.includes(req.area) ? cookieFor(req.area, config).name : null;
}

export function setSessionCookie(res, config, token, expiresAt, area = null) {
  const { name, options } = cookieFor(area, config, expiresAt.getTime() - Date.now());
  res.cookie(name, token, options);
}

export function clearSessionCookie(res, config, area = null) {
  const { name, options } = cookieFor(area, config);
  res.clearCookie(name, options);
}

/** Resolve the session cookie (if any) into req.session / req.user. */
/**
 * Browser clients use the HTTP-only cookie. Native/non-browser clients send
 * `Authorization: Bearer <token>` (issued by POST /api/auth/native/login).
 */
export function loadSession({ auth, config }) {
  return async (req, res, next) => {
    const header = req.get('authorization') || '';
    const bearer = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(header)?.[1];
    const cookieName = sessionCookieName(req, config);
    const token = bearer || (cookieName ? req.cookies?.[cookieName] : undefined);
    if (!token) return next();
    req.authVia = bearer ? 'bearer' : 'cookie';
    try {
      const session = await auth.resolveSession(token);
      if (!session) {
        if (!bearer) clearSessionCookie(res, config, req.area);
        return next();
      }
      req.session = session;
      req.user = session.user;
      req.sessionToken = token;
      if (session.refreshed && !bearer) setSessionCookie(res, config, token, session.expiresAt, req.area);
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
