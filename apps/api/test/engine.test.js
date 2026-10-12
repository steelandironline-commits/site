import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { disconnectPrisma, AgentOrchestrator, JobQueue, setConfig, Scheduler } from '@autopix/core';
import { setupApp, resetDb, createActiveUser, client, hasDb, testConfig } from './helpers.js';

describe.skipIf(!hasDb)('autonomous engine', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('claims each job exactly once (SKIP LOCKED)', async () => {
    const { companyId } = await createActiveUser(ctx.app);
    const q1 = new JobQueue({ prisma: ctx.prisma, workerId: 'w1' });
    const q2 = new JobQueue({ prisma: ctx.prisma, workerId: 'w2' });
    const [a, b] = await Promise.all([q1.claim(), q2.claim()]);
    const claimed = [a, b].filter(Boolean);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].companyId).toBe(companyId);
    expect(claimed[0].status).toBe('RUNNING');
  });

  it('runs the pipeline in DEMO mode: agent runs, signals, opportunities, activity', async () => {
    const { companyId, c } = await createActiveUser(ctx.app);
    const queue = new JobQueue({ prisma: ctx.prisma });
    const job = await queue.claim();
    const orchestrator = new AgentOrchestrator({ prisma: ctx.prisma, config: ctx.config, pacingMs: 0 });
    const stats = await orchestrator.runJob(job);
    await queue.complete(job.id, stats);

    expect(stats.companiesAnalyzed).toBeGreaterThanOrEqual(3);
    const runs = await ctx.prisma.agentRun.findMany({ where: { jobId: job.id }, include: { agent: true } });
    expect(runs.map((r) => r.agent.key).sort()).toEqual(['RADAR', 'RESEARCH', 'SALES', 'SCORING', 'SIGNAL']);
    runs.forEach((r) => {
      expect(r.status).toBe('SUCCEEDED');
      expect(r.finishedAt).toBeTruthy();
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
      expect(r.metrics).toBeTruthy();
    });

    const opps = await ctx.prisma.opportunity.findMany({ where: { companyId }, include: { sources: true } });
    expect(opps.length).toBe(stats.opportunitiesCreated);
    for (const o of opps) {
      expect(o.isDemo).toBe(true);
      expect(o.score).toBeGreaterThanOrEqual(ctx.config.search.scoreThreshold);
      expect(o.targetWebsite).toMatch(/\.example$/);
      expect(o.sources.length).toBeGreaterThan(0);
    }
    const events = await ctx.prisma.activityEvent.findMany({ where: { companyId, jobId: job.id } });
    expect(events.every((e) => e.isDemo)).toBe(true);
    expect(events.some((e) => e.title.startsWith('Analisando'))).toBe(true);

    const agents = await c.get('/api/agents');
    expect(agents.body.items).toHaveLength(5);
    expect(agents.body.items.find((a) => a.key === 'RADAR').jobsToday).toBe(1);
    const agentRuns = await c.get('/api/agents/runs?agent=SCORING');
    expect(agentRuns.body.items).toHaveLength(1);

    // Re-running does not duplicate opportunities for the same targets.
    const again = await orchestrator.runJob({ ...job, id: job.id });
    const total = await ctx.prisma.opportunity.count({ where: { companyId } });
    expect(total).toBe(opps.length + again.opportunitiesCreated);
  });

  it('DEMO_MODE=false never fabricates activity or opportunities', async () => {
    const { companyId } = await createActiveUser(ctx.app);
    const config = setConfig(testConfig({ DEMO_MODE: 'false' }));
    const queue = new JobQueue({ prisma: ctx.prisma });
    const job = await queue.claim();
    const orchestrator = new AgentOrchestrator({ prisma: ctx.prisma, config, pacingMs: 0 });
    expect(orchestrator.adapters.some((a) => a.isDemo)).toBe(false);
    const stats = await orchestrator.runJob(job);
    expect(stats.skipped).toBe('no_sources');
    expect(await ctx.prisma.opportunity.count({ where: { companyId } })).toBe(0);
    const events = await ctx.prisma.activityEvent.findMany({ where: { companyId, jobId: job.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ title: 'Nenhuma fonte de dados configurada', isDemo: false, severity: 'WARNING' });
    setConfig(ctx.config);
  });

  it('manual search request queues a job without running it in the request', async () => {
    const { c, companyId } = await createActiveUser(ctx.app);
    await ctx.prisma.searchJob.updateMany({ where: { companyId }, data: { status: 'COMPLETED' } });
    const res = await c.post('/api/agents/run');
    expect(res.status).toBe(201);
    const job = await ctx.prisma.searchJob.findUnique({ where: { id: res.body.job.id } });
    expect(job).toMatchObject({ status: 'QUEUED', trigger: 'MANUAL' });
    expect(await ctx.prisma.agentRun.count({ where: { companyId } })).toBe(0);
    const dup = await c.post('/api/agents/run');
    expect(dup.status).toBe(200);
    expect(dup.body.created).toBe(false);
  });

  it('scheduler pauses agents when the subscription lapses', async () => {
    const { companyId } = await createActiveUser(ctx.app);
    await ctx.prisma.subscription.update({ where: { companyId }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    const r = await new Scheduler({ prisma: ctx.prisma, config: ctx.config }).tick();
    expect(r.expired).toBe(1);
    expect((await ctx.prisma.subscription.findUnique({ where: { companyId } })).status).toBe('PAST_DUE');
    expect(await ctx.prisma.searchJob.count({ where: { companyId, status: 'QUEUED' } })).toBe(0);
    const anon = client(ctx.app);
    expect((await anon.get('/api/agents')).status).toBe(401);
  });
});
