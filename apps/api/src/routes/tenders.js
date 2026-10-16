import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/session.js';
import { parse } from '../middleware/validate.js';

const query = z.object({
  state: z.string().trim().length(2).optional(),
  city: z.string().trim().max(80).optional(),
  q: z.string().trim().max(120).optional(),
  modality: z.string().trim().max(60).optional(),
  status: z.enum(['open', 'closing', 'soon', 'all']).default('open'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(20),
});

/** Licitações (PNCP) for company accounts. */
export function tenderRoutes({ tenders }) {
  const r = Router();
  r.use(requireAuth);
  r.get('/', async (req, res) => {
    const q = parse(query, req.query);
    const blank = (v) => (v ? v : undefined);
    res.json(await tenders.list({ ...q, state: blank(q.state), city: blank(q.city), q: blank(q.q), modality: blank(q.modality) }));
  });
  r.get('/cities', async (req, res) => {
    const { state } = parse(z.object({ state: z.string().trim().length(2) }), req.query);
    res.json({ cities: await tenders.cities(state.toUpperCase()) });
  });
  return r;
}
