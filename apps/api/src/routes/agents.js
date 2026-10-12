import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../middleware/validate.js';
import { requireAuth } from '../middleware/session.js';
import { runAction } from '../actor.js';

export function agentRoutes({ agents, prisma, config, actions }) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req, res) => {
    const latestJob = await prisma.searchJob.findFirst({
      where: { companyId: req.user.companyId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, trigger: true, runAt: true, startedAt: true, finishedAt: true, companiesAnalyzed: true, opportunitiesCreated: true },
    });
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { agentsPaused: true } });
    res.json({ items: await agents.list(req.user.companyId), latestJob, intervalMinutes: config.search.intervalMinutes, paused: company.agentsPaused });
  });

  r.get('/runs', async (req, res) => {
    const q = parse(
      z.object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        agent: z.enum(['RADAR', 'RESEARCH', 'SIGNAL', 'SCORING', 'SALES']).optional(),
      }),
      req.query,
    );
    res.json({ items: await agents.runs(req.user.companyId, q) });
  });

  /** "Buscar agora" → START_AGENT (queues a job; never runs in the request). */
  r.post('/run', async (req, res) => {
    const out = await runAction(actions, req, 'START_AGENT', {});
    res.status(out.result.created ? 201 : 200).json(out.result);
  });

  r.post('/pause', async (req, res) => {
    const out = await runAction(actions, req, 'PAUSE_AGENT', {});
    res.json(out.result);
  });

  return r;
}
