import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/session.js';
import { parse } from '../middleware/validate.js';

export function freightRoutes({ freight }) {
  const r = Router();
  r.use(requireAuth);
  r.get('/', async (req, res) => res.json(await freight.list(req.user.companyId)));
  r.get('/matches/:id', async (req, res) => res.json({ match: await freight.getMatch(req.user.companyId, req.params.id) }));
  return r;
}

export function workforceRoutes({ workforce }) {
  const r = Router();
  r.use(requireAuth);
  r.get('/', async (req, res) => res.json({ demands: await workforce.list(req.user.companyId) }));
  r.get('/matches/:id', async (req, res) => res.json({ match: await workforce.getMatch(req.user.companyId, req.params.id) }));
  return r;
}

export function eventRoutes({ events }) {
  const r = Router();
  r.use(requireAuth);
  r.get('/', async (req, res) => {
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), before: z.string().datetime().optional() }), req.query);
    res.json({ items: await events.list(req.user.companyId, q) });
  });
  return r;
}
