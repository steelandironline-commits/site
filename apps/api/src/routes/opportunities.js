import { Router } from 'express';
import { opportunityQuerySchema, opportunityUpdateSchema } from '@autopix/shared';
import { parse } from '../middleware/validate.js';
import { requireAuth } from '../middleware/session.js';

export function opportunityRoutes({ opportunities }) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req, res) => {
    const query = parse(opportunityQuerySchema, req.query);
    res.json(await opportunities.list(req.user.companyId, query));
  });

  r.get('/:id', async (req, res) => {
    res.json({ opportunity: await opportunities.get(req.user.companyId, req.params.id) });
  });

  r.patch('/:id', async (req, res) => {
    const data = parse(opportunityUpdateSchema, req.body);
    const opportunity = await opportunities.update(req.user.companyId, req.params.id, data, { userId: req.user.id });
    res.json({ opportunity });
  });

  return r;
}
