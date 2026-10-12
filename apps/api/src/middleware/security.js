import rateLimit from 'express-rate-limit';
import { forbidden } from '@autopix/core';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF mitigation for cookie-authenticated endpoints:
 *  1. SameSite=Lax session cookie;
 *  2. state-changing requests must carry `X-Requested-With: autopix`
 *     (a non-simple header → cross-site requests require a CORS preflight,
 *     which only APP_URL passes);
 *  3. if an Origin header is present it must be one of ours.
 * Payment webhooks are excluded (they are verified by signature instead).
 */
export function csrfGuard(config) {
  const allowed = new Set([config.appUrl, config.apiUrl].map((u) => new URL(u).origin));
  return (req, res, next) => {
    if (SAFE.has(req.method)) return next();
    if (req.path.startsWith('/webhooks/')) return next();
    const origin = req.get('origin');
    if (origin && !allowed.has(origin)) return next(forbidden('Origem não permitida.'));
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
    payments: rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, skip, message: message('Muitas requisições de pagamento.') }),
  };
}
