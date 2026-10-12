import { Router } from 'express';
import { activateSchema, forgotPasswordSchema, loginSchema, resetPasswordSchema } from '@autopix/shared';
import { parse } from '../middleware/validate.js';
import { clearSessionCookie, setSessionCookie } from '../middleware/session.js';

export function authRoutes({ auth, config, limiters }) {
  const r = Router();
  const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

  r.post('/login', limiters.login, async (req, res) => {
    const { identifier, password } = parse(loginSchema, req.body);
    const { token, session, user } = await auth.login(identifier, password, meta(req));
    setSessionCookie(res, config, token, session.expiresAt);
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  });

  /** Native/non-browser clients: returns a bearer token instead of a cookie. */
  r.post('/native/login', limiters.login, async (req, res) => {
    const { identifier, password } = parse(loginSchema, req.body);
    const { token, session, user } = await auth.login(identifier, password, meta(req));
    res.json({ token, tokenType: 'Bearer', expiresAt: session.expiresAt, user: { id: user.id, name: user.name, email: user.email } });
  });

  r.post('/logout', async (req, res) => {
    const bearer = /^Bearer\s+(\S+)$/.exec(req.get('authorization') || '')?.[1];
    await auth.revokeSessionByToken(bearer || req.cookies?.[config.session.cookieName]);
    clearSessionCookie(res, config);
    res.json({ ok: true });
  });

  r.get('/activate/:token', limiters.sensitive, async (req, res) => {
    const info = await auth.inspectActivationToken(req.params.token);
    res.json({ email: info.email, name: info.name, expiresAt: info.expiresAt });
  });

  r.post('/activate', limiters.sensitive, async (req, res) => {
    const { token, password } = parse(activateSchema, req.body);
    const result = await auth.activate(token, password, meta(req));
    setSessionCookie(res, config, result.token, result.session.expiresAt);
    res.json({ user: { id: result.user.id, name: result.user.name, email: result.user.email } });
  });

  r.post('/forgot-password', limiters.sensitive, async (req, res) => {
    const { email } = parse(forgotPasswordSchema, req.body);
    await auth.requestPasswordReset(email);
    // Same answer whether or not the account exists.
    res.json({ ok: true, message: 'Se o e-mail estiver cadastrado, você receberá um link em instantes.' });
  });

  r.get('/reset-password/:token', limiters.sensitive, async (req, res) => {
    const info = await auth.inspectResetToken(req.params.token);
    res.json({ email: info.email, expiresAt: info.expiresAt });
  });

  r.post('/reset-password', limiters.sensitive, async (req, res) => {
    const { token, password } = parse(resetPasswordSchema, req.body);
    await auth.resetPassword(token, password);
    clearSessionCookie(res, config);
    res.json({ ok: true });
  });

  return r;
}
