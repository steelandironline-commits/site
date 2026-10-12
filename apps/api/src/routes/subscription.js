import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/session.js';

export function subscriptionRoutes({ subscriptions }) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req, res) => {
    res.json({ subscription: await subscriptions.get(req.user.companyId) });
  });

  r.post('/cancel', requireRole('OWNER'), async (req, res) => {
    res.json({ subscription: await subscriptions.cancel(req.user.companyId, req.user.id) });
  });

  r.post('/resume', requireRole('OWNER'), async (req, res) => {
    res.json({ subscription: await subscriptions.resume(req.user.companyId, req.user.id) });
  });

  return r;
}
