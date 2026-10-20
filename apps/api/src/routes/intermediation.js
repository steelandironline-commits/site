import { Router } from 'express';
import { requireAuth } from '../middleware/session.js';

/** Intermediation overview: capabilities, counts and compatible buyers / suppliers. */
export function intermediationRoutes({ intermediation }) {
  const r = Router();
  r.use(requireAuth);
  r.get('/', async (req, res) => res.json(await intermediation.overview(req.user.companyId, { area: req.area })));
  return r;
}
