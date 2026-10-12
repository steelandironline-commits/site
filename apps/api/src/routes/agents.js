import { Router } from 'express';
import { z } from 'zod';
import { conflict } from '@autopix/core';
import { parse } from '../middleware/validate.js';
import { requireAuth } from '../middleware/session.js';

export function agentRoutes({ agents, queue, prisma, config, activity }) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req, res) => {
    const latestJob = await prisma.searchJob.findFirst({
      where: { companyId: req.user.companyId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, trigger: true, runAt: true, startedAt: true, finishedAt: true, companiesAnalyzed: true, opportunitiesCreated: true },
    });
    res.json({ items: await agents.list(req.user.companyId), latestJob, intervalMinutes: config.search.intervalMinutes });
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

  /** "Buscar agora": queue an immediate search (never runs in the request). */
  r.post('/run', async (req, res) => {
    const sub = await prisma.subscription.findUnique({ where: { companyId: req.user.companyId } });
    if (sub?.status !== 'ACTIVE') throw conflict('Sua assinatura não está ativa.');
    const { job, created } = await queue.enqueue(req.user.companyId, { trigger: 'MANUAL', isDemo: config.demoMode });
    if (created) {
      await activity.record({
        companyId: req.user.companyId,
        userId: req.user.id,
        type: 'SYSTEM',
        title: 'Busca manual solicitada',
        description: 'Os agentes vão iniciar um novo ciclo em instantes.',
        source: 'user',
      });
    }
    res.status(created ? 201 : 200).json({ job: { id: job.id, status: job.status }, created });
  });

  return r;
}
