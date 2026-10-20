import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { disconnectPrisma, AgentOrchestrator, Scheduler } from '@autopix/core';
import { setupApp, resetDb, hasDb } from './helpers.js';
import { AREA_ENV, makeAccount } from './authAreaHelpers.js';

// 4c · item B. A busca de oportunidades é produto do CNPJ. A conta PERSON recebe assinatura ACTIVE
// (acesso gratuito do CPF), mas o agendador e o orquestrador não podem buscar nada para ela: o
// CPF não pode receber "Nova oportunidade" por atividade, WhatsApp ou e-mail, com link /app/opportunities.

describe.skipIf(!hasDb)('busca de oportunidades · modo de áreas · só a conta de empresa', () => {
  let ctx;
  let company;
  let person;

  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, DEMO_MODE: 'true' });
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  const jobsOf = (companyId) => ctx.prisma.searchJob.count({ where: { companyId } });

  it('o agendador enfileira a busca da empresa e nunca a da conta PERSON', async () => {
    const r = await new Scheduler({ prisma: ctx.prisma, config: ctx.config }).tick();
    expect(r.enqueued).toBe(1);
    expect(await jobsOf(company.company.id)).toBe(1);
    expect(await jobsOf(person.company.id)).toBe(0);
  });

  it('o orquestrador não roda um job de conta PERSON: nenhuma atividade, oportunidade ou evento', async () => {
    // Um job que chegou à fila por outro caminho (confirmação de pagamento, mudança de perfil, backlog).
    const job = await ctx.prisma.searchJob.create({ data: { companyId: person.company.id, trigger: 'MANUAL', isDemo: true } });
    const orchestrator = new AgentOrchestrator({ prisma: ctx.prisma, config: ctx.config, pacingMs: 0 });
    const stats = await orchestrator.runJob(job);
    expect(stats).toMatchObject({ skipped: 'not_company', companiesAnalyzed: 0, opportunitiesCreated: 0 });
    expect(await ctx.prisma.opportunity.count({ where: { companyId: person.company.id } })).toBe(0);
    expect(await ctx.prisma.activityEvent.count({ where: { companyId: person.company.id } })).toBe(0);
    expect(await ctx.prisma.domainEvent.count({ where: { companyId: person.company.id } })).toBe(0);
    expect(await ctx.prisma.agentRun.count({ where: { companyId: person.company.id } })).toBe(0);
  });

  it('a conta de empresa continua rodando o pipeline completo', async () => {
    const job = await ctx.prisma.searchJob.create({ data: { companyId: company.company.id, trigger: 'MANUAL', isDemo: true } });
    const orchestrator = new AgentOrchestrator({ prisma: ctx.prisma, config: ctx.config, pacingMs: 0 });
    const stats = await orchestrator.runJob(job);
    expect(stats.skipped).toBeUndefined();
    expect(stats.companiesAnalyzed).toBeGreaterThan(0);
    expect(await ctx.prisma.agentRun.count({ where: { companyId: company.company.id } })).toBe(5);
  });
});

describe.skipIf(!hasDb)('busca de oportunidades · modo legado, o agendamento é o de sempre', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await setupApp({ DEMO_MODE: 'true' });
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('toda assinatura ACTIVE entra na fila, de empresa ou de pessoa, e o job de PERSON roda', async () => {
    await resetDb(ctx.prisma);
    const company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    const person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    const r = await new Scheduler({ prisma: ctx.prisma, config: ctx.config }).tick();
    expect(r.enqueued).toBe(2);
    const job = await ctx.prisma.searchJob.findFirst({ where: { companyId: person.company.id } });
    const stats = await new AgentOrchestrator({ prisma: ctx.prisma, config: ctx.config, pacingMs: 0 }).runJob(job);
    expect(stats.skipped).toBeUndefined();
    expect(await ctx.prisma.searchJob.count({ where: { companyId: company.company.id } })).toBe(1);
  });
});
