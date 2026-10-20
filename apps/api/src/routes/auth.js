import { Router } from 'express';
import { z } from 'zod';
import { activateSchema, forgotPasswordSchema, loginSchema, resetPasswordSchema } from '@autopix/shared';
import { parse } from '../middleware/validate.js';
import { clearSessionCookie, sessionCookieName, setSessionCookie } from '../middleware/session.js';

export function authRoutes({ auth, config, limiters }) {
  const r = Router();
  const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent'), hostArea: req.area });

  r.post('/login', limiters.login, async (req, res) => {
    const { identifier, password } = parse(loginSchema, req.body);
    const result = await auth.login(identifier, password, meta(req));
    if (result.mfaRequired) return res.json(result);
    const { token, session, user } = result;
    setSessionCookie(res, config, token, session.expiresAt, req.area);
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  });

  r.post('/login/verify-whatsapp', limiters.login, async (req, res) => {
    const { challengeId, code } = parse(z.object({ challengeId: z.string().trim().min(1).max(64), code: z.string().regex(/^[0-9]{6}$/) }), req.body);
    const { token, session, user } = await auth.verifyLoginCode(challengeId, code, meta(req));
    setSessionCookie(res, config, token, session.expiresAt, req.area);
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  });

  /** Native/non-browser clients: returns a bearer token instead of a cookie. */
  r.post('/native/login', limiters.login, async (req, res) => {
    const { identifier, password } = parse(loginSchema, req.body);
    const result = await auth.login(identifier, password, meta(req));
    if (result.mfaRequired) return res.json(result);
    const { token, session, user } = result;
    res.json({ token, tokenType: 'Bearer', expiresAt: session.expiresAt, user: { id: user.id, name: user.name, email: user.email } });
  });

  r.post('/native/verify-whatsapp', limiters.login, async (req, res) => {
    const { challengeId, code } = parse(z.object({ challengeId: z.string().trim().min(1).max(64), code: z.string().regex(/^[0-9]{6}$/) }), req.body);
    const { token, session, user } = await auth.verifyLoginCode(challengeId, code, meta(req));
    res.json({ token, tokenType: 'Bearer', expiresAt: session.expiresAt, user: { id: user.id, name: user.name, email: user.email } });
  });

  r.post('/logout', async (req, res) => {
    const bearer = /^Bearer\s+(\S+)$/.exec(req.get('authorization') || '')?.[1];
    const cookieName = sessionCookieName(req, config);
    await auth.revokeSessionByToken(bearer || (cookieName ? req.cookies?.[cookieName] : undefined));
    if (cookieName) clearSessionCookie(res, config, req.area);
    res.json({ ok: true });
  });

  r.get('/activate/:token', limiters.sensitive, async (req, res) => {
    const info = await auth.inspectActivationToken(req.params.token);
    res.json({ email: info.email, name: info.name, expiresAt: info.expiresAt });
  });

  r.post('/activate', limiters.sensitive, async (req, res) => {
    const { token, password } = parse(activateSchema, req.body);
    const result = await auth.activate(token, password, meta(req));
    setSessionCookie(res, config, result.token, result.session.expiresAt, req.area);
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
    if (sessionCookieName(req, config)) clearSessionCookie(res, config, req.area);
    res.json({ ok: true });
  });

  return r;
}
