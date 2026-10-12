import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { disconnectPrisma, ActivityService } from '@autopix/core';
import { setupApp, resetDb, createActiveUser, hasDb } from './helpers.js';

describe.skipIf(!hasDb)('company, opportunities and activity', () => {
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

  describe('company profile', () => {
    it('returns and updates the profile, re-queuing the search', async () => {
      const { c, companyId } = await createActiveUser(ctx.app);
      const before = (await c.get('/api/company')).body.company;
      expect(before.services).toContain('Usinagem');

      // Drain the payment job so we can observe the profile-triggered one.
      await ctx.prisma.searchJob.updateMany({ where: { companyId }, data: { status: 'COMPLETED' } });

      const res = await c.put('/api/company', {
        services: ['Usinagem', 'Solda'],
        excludedIndustries: ['Varejo'],
        website: 'usinagem.example',
      });
      expect(res.status).toBe(200);
      expect(res.body.company.services).toEqual(['Usinagem', 'Solda']);
      expect(res.body.company.website).toBe('https://usinagem.example');
      expect(res.body.company.searchConfigVersion).toBe(before.searchConfigVersion + 1);
      expect(res.body.searchRequeued).toBe(true);
      const job = await ctx.prisma.searchJob.findFirst({ where: { companyId, status: 'QUEUED' } });
      expect(job.trigger).toBe('PROFILE_UPDATE');
      expect(job.configVersion).toBe(before.searchConfigVersion + 1);
    });

    it('validates input', async () => {
      const { c } = await createActiveUser(ctx.app);
      const res = await c.put('/api/company', { cnpj: '11.111.111/1111-11', averageTicket: -5 });
      expect(res.status).toBe(400);
      expect(res.body.error.fields.cnpj).toBeTruthy();
      expect(res.body.error.fields.averageTicket).toBeTruthy();
    });
  });

  describe('opportunities', () => {
    async function seedOpps(companyId) {
      const base = { companyId, confidence: 0.7, signal: 'Expansão operacional identificada', signalType: 'EXPANSION' };
      const a = await ctx.prisma.opportunity.create({
        data: { ...base, targetKey: 'alpha', targetCompanyName: 'Indústria Alpha', score: 92, priority: 'HIGH', estimatedMinValue: 15000, estimatedMaxValue: 35000, industry: 'Indústria', city: 'Joinville', matchingServices: ['Usinagem'],
          sources: { create: [{ type: 'WEBSITE', title: 'Site oficial', url: 'https://alpha.example' }] },
          contacts: { create: [{ businessEmail: 'comercial@alpha.example', publicSource: 'https://alpha.example/contato' }] } },
      });
      const b = await ctx.prisma.opportunity.create({
        data: { ...base, targetKey: 'beta', targetCompanyName: 'Logística Beta', score: 61, priority: 'LOW', estimatedMinValue: 4000, estimatedMaxValue: 9000, status: 'CONTACTED' },
      });
      return { a, b };
    }

    it('lists with filters, search and sort', async () => {
      const { c, companyId } = await createActiveUser(ctx.app);
      await seedOpps(companyId);
      const all = await c.get('/api/opportunities?sort=score');
      expect(all.status).toBe(200);
      expect(all.body.total).toBe(2);
      expect(all.body.items[0].targetCompanyName).toBe('Indústria Alpha');
      expect((await c.get('/api/opportunities?priority=HIGH')).body.total).toBe(1);
      expect((await c.get('/api/opportunities?status=CONTACTED')).body.items[0].targetCompanyName).toBe('Logística Beta');
      expect((await c.get('/api/opportunities?q=log')).body.total).toBe(1);
      expect((await c.get('/api/opportunities?status=INVALID')).status).toBe(400);
    });

    it('returns detail with sources and contacts', async () => {
      const { c, companyId } = await createActiveUser(ctx.app);
      const { a } = await seedOpps(companyId);
      const res = await c.get(`/api/opportunities/${a.id}`);
      expect(res.status).toBe(200);
      expect(res.body.opportunity.sources).toHaveLength(1);
      expect(res.body.opportunity.contacts[0].businessEmail).toBe('comercial@alpha.example');
    });

    it('updates status/notes, generates an approach and records activity', async () => {
      const { c, companyId } = await createActiveUser(ctx.app);
      const { a } = await seedOpps(companyId);
      const res = await c.patch(`/api/opportunities/${a.id}`, { status: 'CONTACTED', notes: 'Ligar na segunda.' });
      expect(res.status).toBe(200);
      expect(res.body.opportunity.status).toBe('CONTACTED');
      expect(res.body.opportunity.notes).toBe('Ligar na segunda.');
      const approach = await c.patch(`/api/opportunities/${a.id}`, { generateApproach: true });
      expect(approach.body.opportunity.suggestedApproach).toMatch(/MENSAGEM SUGERIDA/);
      const events = await ctx.prisma.activityEvent.findMany({ where: { opportunityId: a.id } });
      expect(events.map((e) => e.title)).toEqual(expect.arrayContaining(['Status alterado para Em contato', 'Abordagem comercial sugerida']));
      expect((await c.patch(`/api/opportunities/${a.id}`, { status: 'BOGUS' })).status).toBe(400);
    });
  });

  describe('activity', () => {
    it('records events and lists them with filters', async () => {
      const { c, companyId } = await createActiveUser(ctx.app);
      const svc = new ActivityService({ prisma: ctx.prisma });
      const e = await svc.record({
        companyId,
        agentKey: 'SIGNAL',
        type: 'SIGNAL',
        title: 'Expansão operacional identificada',
        severity: 'SUCCESS',
        source: 'Signal Agent',
        metadata: { strength: 0.9 },
      });
      expect(e.agent.key).toBe('SIGNAL');
      const res = await c.get('/api/activity?type=SIGNAL');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({ title: 'Expansão operacional identificada', severity: 'SUCCESS', metadata: { strength: 0.9 } });
      const all = await c.get('/api/activity');
      expect(all.body.items.length).toBeGreaterThan(1);
      expect(new Date(all.body.items[0].createdAt) >= new Date(all.body.items.at(-1).createdAt)).toBe(true);
    });

    it('dashboard metrics come from the database', async () => {
      const { c, companyId } = await createActiveUser(ctx.app);
      await ctx.prisma.opportunity.create({
        data: { companyId, targetKey: 'x', targetCompanyName: 'X', score: 90, priority: 'HIGH', confidence: 0.8, signal: 's', estimatedMinValue: 1000, estimatedMaxValue: 5000 },
      });
      await ctx.prisma.searchJob.updateMany({ where: { companyId }, data: { status: 'COMPLETED', companiesAnalyzed: 7, finishedAt: new Date() } });
      const res = await c.get('/api/dashboard');
      expect(res.body.metrics).toMatchObject({ opportunities: 1, highPriority: 1, potentialValue: 5000, companiesAnalyzed: 7 });
    });
  });
});
