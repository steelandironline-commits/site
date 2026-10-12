import { Router } from 'express';
import { requireAuth } from '../middleware/session.js';

export function dashboardRoutes({ dashboard }) {
  const r = Router();
  r.use(requireAuth);
  r.get('/', async (req, res) => {
    res.json(await dashboard.overview(req.user.companyId));
  });
  return r;
}
