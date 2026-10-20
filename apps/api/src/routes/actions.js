import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '@autopix/core';
import { requireAuth, requireOnboardingSession } from '../middleware/session.js';
import { parse } from '../middleware/validate.js';
import { actorOf, runAction } from '../actor.js';

/**
 * ActionEngine HTTP gateway — the documented way for every client
 * (web/PWA, native apps) to execute business actions.
 *
 *   GET  /api/actions            catalog
 *   POST /api/actions/:name      { input } → { status, action, result | challenge }
 *   GET  /api/challenges/:id
 *   POST /api/challenges/:id/confirm  { password }  (authenticated web session)
 *   POST /api/challenges/:id/cancel
 *
 * Two mounts in app.js (each with its own areas): /api/actions and /api/challenges.
 */
export function actionRoutes({ actions, limiters }) {
  const r = Router();

  // INVITE_COLLABORATOR tells whether an e-mail/CPF already has an account, so it shares the
  // onboarding/check limiter with /api/team (one counter, whichever way it is asked).
  const probes = new Set(['INVITE_COLLABORATOR']);
  const probeLimit = (req, res, next) => (probes.has(String(req.params.name).toUpperCase()) ? limiters.onboardingCheck(req, res, next) : next());

  r.get('/', requireAuth, (req, res) => {
    // Area mode lists only what the session's area may run (the engine denies the rest on every channel).
    res.json({ items: actions.catalog({ area: req.session.area }) });
  });

  r.post('/:name', requireOnboardingSession, probeLimit, async (req, res) => {
    const name = String(req.params.name).toUpperCase();
    if (!actions.get(name)) throw notFound('Ação desconhecida.');
    const input = req.body?.input ?? {};
    const out = await runAction(actions, req, name, input);
    res.status(out.status === 'CONFIRMATION_REQUIRED' ? 202 : 200).json(out);
  });

  return r;
}

export function challengeRoutes({ challenges }) {
  const r = Router();

  r.get('/:id', requireAuth, async (req, res) => {
    res.json({ challenge: await challenges.get(req.params.id, req.user.id) });
  });

  r.post('/:id/confirm', requireAuth, async (req, res) => {
    const { password } = parse(z.object({ password: z.string().min(1).max(200) }), req.body);
    const out = await challenges.confirm(req.params.id, { user: req.user, session: req.session, password, ip: req.ip, actor: actorOf(req) });
    res.json(out);
  });

  r.post('/:id/confirm-whatsapp', requireAuth, async (req, res) => {
    const { code } = parse(z.object({ code: z.string().regex(/^[0-9]{6}$/) }), req.body);
    const out = await challenges.confirmWhatsApp(req.params.id, { user: req.user, session: req.session, code, ip: req.ip });
    res.json(out);
  });

  r.post('/:id/cancel', requireAuth, async (req, res) => {
    res.json(await challenges.cancel(req.params.id, req.user.id));
  });

  return r;
}
