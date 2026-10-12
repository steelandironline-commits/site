import { Router } from 'express';
import { companyUpdateSchema } from '@autopix/shared';
import { parse } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/session.js';

export function companyRoutes({ companies }) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req, res) => {
    res.json({ company: await companies.get(req.user.companyId) });
  });

  r.put('/', requireRole('OWNER', 'ADMIN'), async (req, res) => {
    const data = parse(companyUpdateSchema, req.body);
    const result = await companies.update(req.user.companyId, data, { userId: req.user.id });
    res.json(result);
  });

  return r;
}
