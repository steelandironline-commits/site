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
 */
export function actionRoutes({ actions, challenges }) {
  const r = Router();

  r.get('/actions', requireAuth, (req, res) => {
    res.json({ items: actions.catalog() });
  });

  r.post('/actions/:name', requireOnboardingSession, async (req, res) => {
    const name = String(req.params.name).toUpperCase();
    if (!actions.get(name)) throw notFound('Ação desconhecida.');
    const input = req.body?.input ?? {};
    const out = await runAction(actions, req, name, input);
    res.status(out.status === 'CONFIRMATION_REQUIRED' ? 202 : 200).json(out);
  });

  r.get('/challenges/:id', requireAuth, async (req, res) => {
    res.json({ challenge: await challenges.get(req.params.id, req.user.id) });
  });

  r.post('/challenges/:id/confirm', requireAuth, async (req, res) => {
    const { password } = parse(z.object({ password: z.string().min(1).max(200) }), req.body);
    const out = await challenges.confirm(req.params.id, { user: req.user, session: req.session, password, ip: req.ip, actor: actorOf(req) });
    res.json(out);
  });

  r.post('/challenges/:id/cancel', requireAuth, async (req, res) => {
    res.json(await challenges.cancel(req.params.id, req.user.id));
  });

  return r;
}
