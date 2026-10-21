import { Router } from 'express';
import { z } from 'zod';
import { JOB_AREA_SLUGS } from '@autopix/shared';
import { requireAuth } from '../middleware/session.js';
import { parse } from '../middleware/validate.js';

const blankToUndefined = (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

const listQuery = z.object({
  q: z.preprocess(blankToUndefined, z.string().trim().max(80, 'Use até 80 caracteres na busca').optional()),
  area: z.preprocess(blankToUndefined, z.enum(JOB_AREA_SLUGS, { errorMap: () => ({ message: 'Área inválida' }) }).optional()),
  limit: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(50).default(20)),
  cursor: z.preprocess(blankToUndefined, z.string().trim().max(200).optional()),
});

const idParam = z.object({ id: z.string().trim().min(1).max(64) });

/**
 * Vagas da área CPF (somente neste host: a montagem declara a área e responde 404 antes de autenticar nos outros).
 *
 *   GET /api/jobs?q=&area=&limit=&cursor=   { items, nextCursor, profile, source }
 *   GET /api/jobs/:id                        { item, profile, source }
 *
 * Cada pessoa vê só as vagas da própria área de atuação (perfil) mais as de família transversal (logística);
 * a regra está em packages/shared (jobs/visibility.js) e o serviço a aplica. Nada de dado de empresa de cobrança.
 */
export function jobRoutes({ jobs }) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req, res) => {
    res.json(await jobs.list(req.user.id, parse(listQuery, req.query)));
  });

  r.get('/:id', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await jobs.get(req.user.id, id));
  });

  return r;
}
