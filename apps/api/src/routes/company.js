import { Router } from 'express';
import { requireAuth } from '../middleware/session.js';
import { runAction } from '../actor.js';

export function companyRoutes({ companies, actions }) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req, res) => {
    const { payoutPixKey, ...company } = await companies.get(req.user.companyId);
    res.json({ company: { ...company, payoutPixKeyLast4: payoutPixKey ? payoutPixKey.slice(-4) : null } });
  });

  r.put('/', async (req, res) => {
    const { result } = await runAction(actions, req, 'UPDATE_COMPANY_PROFILE', req.body);
    const { payoutPixKey, ...company } = result.company;
    res.json({ ...result, company: { ...company, payoutPixKeyLast4: payoutPixKey ? payoutPixKey.slice(-4) : null } });
  });

  return r;
}
