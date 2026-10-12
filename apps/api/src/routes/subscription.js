import { Router } from 'express';
import { requireAuth } from '../middleware/session.js';
import { runAction } from '../actor.js';

export function subscriptionRoutes({ subscriptions, actions }) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req, res) => {
    res.json({ subscription: await subscriptions.get(req.user.companyId) });
  });

  r.post('/cancel', async (req, res) => {
    res.json((await runAction(actions, req, 'CANCEL_SUBSCRIPTION', {})).result);
  });

  r.post('/resume', async (req, res) => {
    res.json((await runAction(actions, req, 'RESUME_SUBSCRIPTION', {})).result);
  });

  return r;
}
