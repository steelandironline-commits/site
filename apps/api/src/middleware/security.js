import rateLimit from 'express-rate-limit';
import { forbidden } from '@autopix/core';
import { areaOrigins } from './area.js';
import { sessionCookieName } from './session.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const NATIVE_SIGN_IN = /^\/auth\/native\/(login|verify-whatsapp)$/;

/**
 * CSRF mitigation for cookie-authenticated endpoints:
 *  1. SameSite=Lax session cookie;
 *  2. state-changing requests must carry `X-Requested-With: autopix`
 *     (a non-simple header → cross-site requests require a CORS preflight,
 *     which only APP_URL passes);
 *  3. if an Origin header is present it must be one of ours.
 * Payment webhooks are excluded (they are verified by signature instead).
 *
 * Area mode: cpf.* and the apex are same-site, so SameSite=Lax does not separate them. The
 * request must then carry an Origin equal to the origin of ITS OWN area (derived from `req.area`,
 * never from a header) plus X-Requested-With, and a request without Origin is refused. The
 * cookie it is judged by is the one of its own area. Native sign-in (no cookie involved) may omit
 * Origin. Legacy mode: exactly as before.
 */
export function csrfGuard(config) {
  const allowed = new Set([config.appUrl, config.apiUrl].map((u) => new URL(u).origin));
  const areaMode = Boolean(config.areas?.enabled);
  const ownOrigins = areaOrigins(config);
  return (req, res, next) => {
    if (SAFE.has(req.method)) return next();
    if (req.path.startsWith('/webhooks/')) return next();
    // Bearer-token clients (native apps) carry no ambient credentials.
    const cookieName = sessionCookieName(req, config);
    if (/^Bearer\s+/i.test(req.get('authorization') || '') && !(cookieName && req.cookies?.[cookieName])) return next();
    const origin = req.get('origin');
    if (areaMode) {
      const own = ownOrigins.get(req.area);
      // The two native sign-in endpoints neither read nor set a cookie, so there is no ambient
      // credential to forge, and a native app sends no Origin. A wrong Origin is still refused.
      const nativeSignIn = origin === undefined && NATIVE_SIGN_IN.test(req.path);
      if (!own || (origin !== own && !nativeSignIn)) return next(forbidden('Origem não permitida.'));
    } else if (origin && !allowed.has(origin)) return next(forbidden('Origem não permitida.'));
    if (req.get('x-requested-with') !== 'autopix') return next(forbidden('Requisição não permitida.'));
    return next();
  };
}

const message = (msg) => ({ error: { code: 'RATE_LIMITED', message: msg } });

export function buildLimiters(config) {
  const skip = () => config.isTest && !process.env.TEST_RATE_LIMIT;
  return {
    api: rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, skip, message: message('Muitas requisições. Aguarde um instante.') }),
    login: rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, skip, message: message('Muitas tentativas de login. Tente novamente em alguns minutos.') }),
    sensitive: rateLimit({ windowMs: 15 * 60_000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, skip, message: message('Muitas tentativas. Tente novamente mais tarde.') }),
    onboarding: rateLimit({ windowMs: 60 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, skip, message: message('Muitos cadastros a partir desta rede.') }),
    // Checking an e-mail/document on the first signup step; bounded to limit account probing.
    onboardingCheck: rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, skip, message: message('Muitas verificações. Aguarde alguns minutos.') }),
    payments: rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, skip, message: message('Muitas requisições de pagamento.') }),
  };
}
